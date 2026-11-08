import { it } from "@effect/vitest";
import * as Console from "effect/Console";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Headers from "effect/http/Headers";
import * as HttpBody from "effect/http/HttpBody";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import * as Fetch from "../../src/index.js";
import {
	type ConsoleLoggerCall,
	type ConsoleLoggerOptions,
	type ConsoleLoggerPlugin,
	bearer,
	consoleLogger,
	retry,
} from "../../src/plugins/index.js";
import { base, setup } from "../utils/client.js";
import { after } from "../utils/clock.js";
import { delayed, failure, hang, type Script } from "../utils/mockClient.js";
import { reply } from "../utils/reply.js";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

class InvalidRole extends Schema.TaggedError<InvalidRole>()("InvalidRole", {
	message: Schema.String,
}) {}

/** One call to the console. */
interface Printed {
	readonly method: string;
	readonly args: ReadonlyArray<unknown>;
}

/** A console that records what it's given, provided around the effect. */
const captureConsole = () => {
	const printed: Array<Printed> = [];
	const record =
		(method: string) =>
		(...args: ReadonlyArray<unknown>) => {
			printed.push({ method, args });
		};
	const console: Console.Console = Object.assign(
		Object.create(globalThis.console),
		{
			log: record("log"),
			group: record("group"),
			groupCollapsed: record("groupCollapsed"),
			groupEnd: record("groupEnd"),
			error: record("error"),
			warn: record("warn"),
		},
	);
	return {
		printed,
		capture: <A, E, R>(self: Effect.Effect<A, E, R>) =>
			Effect.provideService(self, Console.Console, console),
		/**
		 * The first argument of each call's line: its group's label, or the
		 * line itself without a group.
		 */
		summaries: () => {
			let depth = 0;
			const lines: Array<unknown> = [];
			for (const entry of printed) {
				if (entry.method === "groupEnd") {
					depth -= 1;
				} else if (depth === 0) {
					lines.push(entry.args[0]);
				}
				if (entry.method === "group" || entry.method === "groupCollapsed") {
					depth += 1;
				}
			}
			return lines;
		},
		/** The values printed under `label`, in order. */
		details: (label: string) => details(printed, label),
		/** The first value printed under `label`. */
		detail: (label: string) => details(printed, label)[0],
	};
};

const details = (
	printed: ReadonlyArray<Printed>,
	label: string,
): Array<unknown> =>
	printed
		.filter(
			(entry) =>
				entry.method === "log" &&
				entry.args.length === 2 &&
				typeof entry.args[0] === "string" &&
				entry.args[0].trim() === label,
		)
		.map((entry) => entry.args[1]);

/** A client with `consoleLogger` (plain text) first, then `plugins`. */
const logged = <const Ps extends ReadonlyArray<Fetch.Plugin.Any> = []>(
	script: Script,
	options: ConsoleLoggerOptions = {},
	plugins: Ps = [] as unknown as Ps,
) =>
	setup(script, {
		plugins: [
			consoleLogger({ color: false, ...options }),
			...plugins,
		] as const,
		statusErrors: { 400: InvalidRole },
	});

describe("consoleLogger", () => {
	it.effect(
		"prints a collapsed group per call, with the URL, headers and bodies",
		() =>
			Effect.gen(function* () {
				const out = captureConsole();
				const { api } = yield* logged([reply.json({ id: 1, title: "a" })]);
				yield* out.capture(
					api.post("/todos/:id", {
						params: { id: 1 },
						query: { page: 2 },
						body: { title: "a" },
						output: Todo,
					}),
				);
				expect(out.printed.map((entry) => entry.method)).toEqual([
					"groupCollapsed",
					"log",
					"log",
					"log",
					"log",
					"log",
					"groupEnd",
				]);
				expect(out.printed[0]?.args).toEqual([
					"POST /todos/:id  200 OK  0 ms  20 B",
				]);
				expect(out.printed[1]?.args).toEqual([
					`POST ${base}/todos/1?page=2`,
				]);
				expect(out.detail("request headers")).toMatchObject({
					accept: "application/json",
					"content-type": "application/json",
					"content-length": "13",
				});
				expect(out.detail("request body")).toEqual({ title: "a" });
				expect(out.detail("response headers")).toEqual({
					"content-type": "application/json",
				});
				expect(out.detail("response body")).toEqual({ id: 1, title: "a" });
			}),
	);

	it.effect.each([
		[
			"a statusErrors error, with its message",
			[reply.json({ message: "No such role" }, { status: 400 })],
			"✗ GET /todos  400 Bad Request  0 ms  26 B  → InvalidRole: No such role",
		],
		[
			"an HttpError, by its tag",
			[reply.json({}, { status: 500 })],
			"✗ GET /todos  500 Internal Server Error  0 ms  2 B  → HttpError",
		],
		[
			"a NetworkError, with its cause",
			[failure(new TypeError("Failed to fetch"))],
			"✗ GET /todos  0 ms  → NetworkError: Failed to fetch",
		],
		[
			"a DecodeError, with its issue",
			[reply.json({ id: "1", title: "a" })],
			'✗ GET /todos  200 OK  0 ms  22 B  → DecodeError: Expected number at ["id"]',
		],
	] as const)("summarises %s", ([, script, line]) =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged(script);
			const error = yield* out.capture(
				Effect.flip(api.get("/todos", { output: Todo })),
			);
			expect(out.summaries()).toEqual([line]);
			expect(out.detail("error")).toMatchObject({
				_tag: error._tag,
				message: error.message,
			});
		}),
	);

	it.effect("prints defects and interruptions", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const boom = new Error("boom");
			const broken = Fetch.plugin({
				name: "broken",
				onResponse: () => Effect.die(boom),
			});
			const { api } = yield* logged([reply.json({}), hang], {}, [broken]);
			yield* out.capture(Effect.exit(api.get("/todos")));
			expect(out.detail("defect")).toBe(boom);
			const fiber = yield* Effect.forkChild(out.capture(api.get("/slow")));
			yield* Effect.yieldNow;
			yield* Fiber.interrupt(fiber);
			expect(out.summaries()).toEqual([
				"✗ GET /todos  200 OK  0 ms  2 B  → defect: Error: boom",
				"⊘ GET /slow  0 ms  interrupted",
			]);
		}),
	);

	it.effect("redacts sensitive headers, query parameters and body keys", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged(
				[
					reply.json(
						{
							user: { id: 1, accessToken: "a", refresh_token: "r" },
							items: [{ password: "p", name: "n" }],
						},
						{
							headers: {
								"set-cookie": "session=1",
								"x-request-id": "7",
							},
						},
					),
				],
				{},
				[bearer({ token: Effect.succeed("t0ken") })],
			);
			yield* out.capture(
				api.post("/login", {
					query: {
						page: 1,
						access_token: "q",
						sig: "s",
						secret: Redacted.make("hidden"),
					},
					headers: { "x-csrf-token": "c", "x-trace": "t" },
					body: {
						email: "a@b.c",
						password: "p",
						nested: [{ apiKey: "k" }],
					},
					output: Schema.Unknown,
				}),
			);
			expect(out.printed[1]?.args).toEqual([
				`POST ${base}/login?page=1&access_token=<redacted>&sig=<redacted>&secret=<redacted>`,
			]);
			expect(out.detail("request headers")).toMatchObject({
				authorization: "<redacted>",
				"x-csrf-token": "<redacted>",
				"x-trace": "t",
			});
			expect(out.detail("request body")).toEqual({
				email: "a@b.c",
				password: "<redacted>",
				nested: [{ apiKey: "<redacted>" }],
			});
			expect(out.detail("response headers")).toEqual({
				"content-type": "application/json",
				"set-cookie": "<redacted>",
				"x-request-id": "7",
			});
			expect(out.detail("response body")).toEqual({
				user: {
					id: 1,
					accessToken: "<redacted>",
					refresh_token: "<redacted>",
				},
				items: [{ password: "<redacted>", name: "n" }],
			});
		}),
	);

	it.effect(
		"redacts the names given too, ignoring case, - and _, or nothing",
		() =>
			Effect.gen(function* () {
				const out = captureConsole();
				const script = [reply.json({ one_time_code: "1", card: "c" })];
				const { api } = yield* logged(script, {
					redact: {
						headers: ["X-Session"],
						query: ["INVITE"],
						body: ["oneTimeCode", "otp", /^card/],
					},
				});
				yield* out.capture(
					api.post("/verify", {
						query: { invite: "i" },
						headers: { "x-session": "s", authorization: "a" },
						body: { otp: "1", cardNumber: "4242" },
						output: Schema.Unknown,
					}),
				);
				expect(out.printed[1]?.args).toEqual([
					`POST ${base}/verify?invite=<redacted>`,
				]);
				expect(out.detail("request headers")).toMatchObject({
					"x-session": "<redacted>",
					authorization: "<redacted>",
				});
				expect(out.detail("request body")).toEqual({
					otp: "<redacted>",
					cardNumber: "<redacted>",
				});
				expect(out.detail("response body")).toEqual({
					one_time_code: "<redacted>",
					card: "<redacted>",
				});

				const plain = captureConsole();
				const { api: unredacted } = yield* logged(script, {
					redact: false,
				});
				yield* plain.capture(
					unredacted.post("/verify", {
						headers: { authorization: "a" },
						body: { password: "p" },
					}),
				);
				expect(plain.detail("request headers")).toMatchObject({
					authorization: "a",
				});
				expect(plain.detail("request body")).toEqual({ password: "p" });
			}),
	);

	it.effect("follows Effect's Headers.CurrentRedactedNames", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([reply.json({})]);
			yield* out.capture(
				api
					.get("/todos", { headers: { "x-internal": "i", cookie: "c" } })
					.pipe(
						Effect.provideService(Headers.CurrentRedactedNames, [
							"x-internal",
						]),
					),
			);
			expect(out.detail("request headers")).toMatchObject({
				"x-internal": "<redacted>",
				cookie: "c",
			});
		}),
	);

	it.effect("prints form bodies field by field", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([reply.empty(204)]);
			const form = new FormData();
			form.append("name", "ada");
			form.append("tag", "a");
			form.append("tag", "b");
			form.append("password", "p");
			form.append(
				"avatar",
				new File(["png!"], "avatar.png", { type: "image/png" }),
			);
			yield* out.capture(api.post("/form", { body: form }));
			expect(out.detail("request body")).toEqual({
				name: "ada",
				tag: ["a", "b"],
				password: "<redacted>",
				avatar: "<avatar.png, 4 B, image/png>",
			});
			expect(out.detail("response body")).toBeUndefined();
		}),
	);

	it.effect(
		"prints urlencoded, text, binary and streamed request bodies",
		() =>
			Effect.gen(function* () {
				const out = captureConsole();
				const { api } = yield* logged([reply.empty(204)], {
					detail: "full",
				});
				yield* out.capture(
					api.post("/a", {
						body: HttpBody.text(
							"a=1&token=t",
							"application/x-www-form-urlencoded",
						),
					}),
				);
				yield* out.capture(api.post("/b", { body: "hello" }));
				yield* out.capture(
					api.post("/c", { body: new Uint8Array([1, 2, 3]) }),
				);
				const bodies = out.details("request body");
				expect(bodies).toEqual([
					{ a: "1", token: "<redacted>" },
					"hello",
					"<application/octet-stream, 3 B>",
				]);
			}),
	);

	it.effect("cuts long bodies, printing long JSON as its text", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged(
				[reply.json({ title: "x".repeat(40) }), reply.text("y".repeat(40))],
				{ maxBodyLength: 20 },
			);
			yield* out.capture(api.get("/json", { output: Schema.Unknown }));
			yield* out.capture(
				api.get("/text", { output: Schema.Unknown }).pipe(Effect.exit),
			);
			const bodies = out.details("response body");
			expect(bodies).toEqual([
				'{"title":"xxxxxxxxxx… (32 more characters)',
				"yyyyyyyyyyyyyyyyyyyy… (20 more characters)",
			]);
		}),
	);

	it.effect(
		"reads no body the call returns as its response, or that isn't text",
		() =>
			Effect.gen(function* () {
				const out = captureConsole();
				const { api } = yield* logged([
					reply.text("streamed"),
					reply.text("events", {
						headers: { "content-type": "text/event-stream" },
					}),
					reply.text("png", {
						status: 500,
						headers: {
							"content-type": "image/png",
							"content-length": "3",
						},
					}),
				]);
				const response = yield* out.capture(api.get("/raw"));
				expect(yield* response.text).toBe("streamed");
				yield* out.capture(
					api.get("/events", { output: Schema.String }).pipe(Effect.exit),
				);
				yield* out.capture(Effect.exit(api.get("/image")));
				const bodies = out.details("response body");
				expect(bodies).toEqual([
					"<not read: the call returns the response>",
					"<text/event-stream>",
					"<image/png, 3 B>",
				]);
			}),
	);

	it.effect(
		"shows the response a plugin failed on, with the plugin's error",
		() =>
			Effect.gen(function* () {
				class Expired extends Schema.TaggedError<Expired>()(
					"Expired",
					{},
				) {}
				const out = captureConsole();
				const expire = Fetch.plugin({
					name: "expire",
					onResponse: (response) =>
						response.status === 401
							? Effect.fail(new Expired())
							: Effect.succeed(response),
				});
				const { api } = yield* logged(
					[reply.json({ reason: "expired" }, { status: 401 })],
					{},
					[expire],
				);
				yield* out.capture(Effect.flip(api.get("/me")));
				expect(out.summaries()).toEqual([
					"✗ GET /me  401 Unauthorized  0 ms  20 B  → Expired",
				]);
				expect(out.detail("response body")).toEqual({ reason: "expired" });
				expect(out.detail("error")).toEqual({
					_tag: "Expired",
					message: "",
				});
			}),
	);

	it.effect("redacts the body data errors carry", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([
				reply.json(
					{ code: "STALE", refreshToken: "r" },
					{ status: 409, headers: { "set-cookie": "s=1" } },
				),
				reply.json({ id: "1", title: "a", accessToken: "t" }),
			]);
			yield* out.capture(Effect.flip(api.get("/a")));
			yield* out.capture(Effect.flip(api.get("/b", { output: Todo })));
			const [httpError, decodeError] = out.details("error");
			expect(httpError).toEqual({
				_tag: "HttpError",
				message: `GET ${base}/a: HTTP 409`,
				method: "GET",
				url: `${base}/a`,
				status: 409,
				headers: {
					"content-type": "application/json",
					"set-cookie": "<redacted>",
				},
				body: { code: "STALE", refreshToken: "<redacted>" },
			});
			expect(decodeError).toMatchObject({
				_tag: "DecodeError",
				status: 200,
			});
			expect(decodeError).not.toHaveProperty("issue");
			expect(JSON.stringify(out.printed)).not.toMatch(/"(r|t)"/);
		}),
	);

	it.effect("prints errors as they are with redact: false", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([reply.json({}, { status: 500 })], {
				redact: false,
			});
			const error = yield* out.capture(Effect.flip(api.get("/a")));
			expect(out.detail("error")).toBe(error);
		}),
	);

	it.effect("prints one line per call with detail: summary", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([reply.json({}, { status: 404 })], {
				detail: "summary",
			});
			yield* out.capture(
				Effect.flip(api.get("/todos/:id", { params: { id: 1 } })),
			);
			expect(out.printed).toEqual([
				{
					method: "log",
					args: ["✗ GET /todos/:id  404 Not Found  0 ms  → HttpError"],
				},
			]);
		}),
	);

	it.effect("leaves the bodies out with detail: headers", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([reply.json({ id: 1 })], {
				detail: "headers",
			});
			yield* out.capture(api.post("/todos", { body: { title: "a" } }));
			expect(out.detail("request headers")).toBeDefined();
			expect(out.detail("request body")).toBeUndefined();
			expect(out.detail("response body")).toBeUndefined();
			// The body isn't read, so only `content-length` could give a size.
			expect(out.summaries()).toEqual(["POST /todos  200 OK  0 ms"]);
		}),
	);

	it.effect("prints only failed calls with only: errors", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged(
				[reply.json({}), reply.json({}, { status: 500 })],
				{ only: "errors", detail: "summary" },
			);
			yield* out.capture(api.get("/ok"));
			yield* out.capture(Effect.flip(api.get("/broken")));
			expect(out.summaries()).toEqual([
				"✗ GET /broken  500 Internal Server Error  0 ms  → HttpError",
			]);
		}),
	);

	it.effect("opens expanded groups with collapsed: false", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([reply.json({})], { collapsed: false });
			yield* out.capture(api.get("/todos"));
			expect(out.printed[0]?.method).toBe("group");
		}),
	);

	it.effect("flags slow calls, timing the whole call, retries included", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged(
				[
					delayed("600 millis", reply.empty(503)),
					delayed("600 millis", reply.json({})),
					delayed("10 millis", reply.json({})),
				],
				{ slow: "1 second", detail: "summary" },
				[retry({ times: 1, schedule: Schedule.spaced("100 millis") })],
			);
			yield* out.capture(after(api.get("/report"), "2 seconds"));
			yield* out.capture(after(api.get("/quick"), "10 millis"));
			expect(out.summaries()).toEqual([
				"⚠ GET /report  200 OK  1.3 s  (slow)",
				"GET /quick  200 OK  10 ms",
			]);
		}),
	);

	it.effect("can be changed or skipped per call", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([reply.json({})]);
			yield* out.capture(
				api.get("/brief", {
					plugins: { consoleLogger: { detail: "summary" } },
				}),
			);
			yield* out.capture(
				api.get("/health", { plugins: { consoleLogger: false } }),
			);
			expect(out.printed).toEqual([
				{ method: "log", args: ["GET /brief  200 OK  0 ms"] },
			]);
		}),
	);

	it.effect("prints only the calls filter accepts", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const seen: Array<ConsoleLoggerCall> = [];
			const { api } = yield* logged([reply.json({})], {
				detail: "summary",
				filter: (call) => {
					seen.push(call);
					return call.route !== "GET /health";
				},
			});
			yield* out.capture(api.get("/health"));
			yield* out.capture(api.get("/todos"));
			expect(out.summaries()).toEqual(["GET /todos  200 OK  0 ms"]);
			expect(seen.map((call) => call.request.url)).toEqual([
				`${base}/health`,
				`${base}/todos`,
			]);
			expect(seen[0]?.response?.status).toBe(200);
		}),
	);

	it.effect("does nothing when enabled is false", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const plugin = consoleLogger({ enabled: false });
			expect(plugin.onExit).toBeUndefined();
			const { api } = yield* setup([reply.json({})], { plugins: [plugin] });
			yield* out.capture(api.get("/todos"));
			expect(out.printed).toEqual([]);
		}),
	);

	it.effect("styles with %c for css, and escape codes for ansi", () =>
		Effect.gen(function* () {
			const css = captureConsole();
			const ansi = captureConsole();
			const { api: styled } = yield* logged([reply.json({})], {
				color: "css",
				detail: "summary",
			});
			const { api: colored } = yield* logged([reply.json({})], {
				color: "ansi",
				detail: "summary",
			});
			yield* css.capture(styled.get("/todos"));
			yield* ansi.capture(colored.get("/todos"));
			expect(css.printed[0]?.args).toEqual([
				"%cGET /todos%c  %c200 OK%c  %c0 ms",
				"font-weight: bold",
				"",
				"color: #2e9d4f",
				"",
				"color: #888",
			]);
			expect(ansi.printed[0]?.args).toEqual([
				"\u001b[1mGET /todos\u001b[22m  \u001b[32m200 OK\u001b[39m  \u001b[2m0 ms\u001b[22m",
			]);
		}),
	);

	it.effect("escapes % in printed text", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([reply.json({})], { detail: "summary" });
			yield* out.capture(api.get("/files/%d"));
			expect(out.printed[0]?.args).toEqual(["GET /files/%%d  200 OK  0 ms"]);
		}),
	);

	it.effect(
		"uses the request plugins sent, or the built one without a response",
		() =>
			Effect.gen(function* () {
				const out = captureConsole();
				const { api } = yield* logged(
					[reply.json({}), failure()],
					{ redact: false },
					[bearer({ token: Effect.succeed("t0ken") })],
				);
				yield* out.capture(api.get("/sent"));
				yield* out.capture(Effect.flip(api.get("/lost")));
				const headers = out.details("request headers");
				expect(headers[0]).toMatchObject({ authorization: "Bearer t0ken" });
				expect(headers[1]).not.toHaveProperty("authorization");
			}),
	);
});

describe("consoleLogger details", () => {
	it.effect("leaves fields that only mention tokens alone", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([
				reply.json(
					{ usage: { total_tokens: 3 }, token_type: "Bearer", tokens: 2 },
					{ headers: { "x-ratelimit-remaining-tokens": "90" } },
				),
			]);
			yield* out.capture(api.get("/usage", { output: Schema.Unknown }));
			expect(out.detail("response body")).toEqual({
				usage: { total_tokens: 3 },
				token_type: "Bearer",
				tokens: 2,
			});
			expect(out.detail("response headers")).toMatchObject({
				"x-ratelimit-remaining-tokens": "90",
			});
		}),
	);

	it.effect("matches header names ignoring - and _ too", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([reply.json({})], {
				redact: { headers: ["x_session", "clientId"] },
			});
			yield* out.capture(
				api.get("/a", { headers: { "x-session": "s", "client-id": "c" } }),
			);
			expect(out.detail("request headers")).toMatchObject({
				"x-session": "<redacted>",
				"client-id": "<redacted>",
			});
		}),
	);

	it.effect("redacts credentials in the URL", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* setup([reply.json({})], {
				baseUrl: "https://user:pw@api.test",
				plugins: [consoleLogger({ color: false })],
			});
			yield* out.capture(api.get("/a"));
			expect(out.printed[1]?.args).toEqual([
				"GET https://<redacted>@api.test/a",
			]);
		}),
	);

	it.effect("hides what's nested too deep to check", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			let deep: unknown = { password: "p4ss" };
			for (let level = 0; level < 70; level++) {
				deep = { next: deep };
			}
			const { api } = yield* logged([reply.json(deep)]);
			yield* out.capture(api.get("/deep", { output: Schema.Unknown }));
			const printed = JSON.stringify(out.detail("response body"));
			expect(printed).not.toContain("p4ss");
			expect(printed).toContain("<…>");
		}),
	);

	it.effect("doesn't parse bodies too large to print", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([
				reply.json({ a: 1 }, { headers: { "content-length": "2000000" } }),
			]);
			yield* out.capture(
				api.get("/big", { output: Schema.Unknown }).pipe(Effect.exit),
			);
			expect(out.detail("response body")).toBe("<application/json, 2.0 MB>");
		}),
	);

	it.effect("ignores an empty content-length", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([
				reply.json({ a: 1 }, { headers: { "content-length": "" } }),
			]);
			yield* out.capture(api.get("/a", { output: Schema.Unknown }));
			expect(out.detail("response body")).toEqual({ a: 1 });
		}),
	);

	it.effect("prints no body for HEAD and 204 responses", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([
				reply.json({ a: 1 }),
				reply.empty(204),
			]);
			yield* out.capture(api.head("/a"));
			yield* out.capture(api.del("/a"));
			expect(out.details("response headers")).toHaveLength(2);
			expect(out.details("response body")).toEqual([]);
		}),
	);

	it.effect("doesn't read the body of an interrupted call", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			// Headers arrive, but the body never ends.
			const client = HttpClient.make((request) =>
				Effect.succeed(
					HttpClientResponse.fromWeb(
						request,
						new Response(new ReadableStream({ start: () => {} }), {
							headers: { "content-type": "application/json" },
						}),
					),
				),
			);
			const api = yield* Fetch.make({
				baseUrl: base,
				plugins: [consoleLogger({ color: false })],
			}).pipe(Effect.provideService(HttpClient.HttpClient, client));
			const fiber = yield* Effect.forkChild(
				out.capture(api.get("/stream", { output: Schema.Unknown })),
			);
			yield* Effect.yieldNow;
			yield* Fiber.interrupt(fiber);
			expect(out.summaries()).toEqual([
				"⊘ GET /stream  200 OK  0 ms  interrupted",
			]);
			expect(out.detail("response body")).toBe(
				"<not read: the call was interrupted>",
			);
		}),
	);

	it.effect("describes Blob bodies", () =>
		Effect.gen(function* () {
			const out = captureConsole();
			const { api } = yield* logged([reply.empty(204)]);
			yield* out.capture(
				api.post("/upload", {
					body: new Blob(["abc"], { type: "text/plain" }),
				}),
			);
			expect(out.detail("request body")).toBe("<blob, 3 B, text/plain>");
		}),
	);

	it.effect("checks slow when it's made, and ignores a bad one per call", () =>
		Effect.gen(function* () {
			expect(() =>
				consoleLogger({ slow: "soon" as unknown as Duration.Input }),
			).toThrow("consoleLogger: slow must be a duration or false, got soon");
			const out = captureConsole();
			const { api } = yield* logged([reply.json({})], { detail: "summary" });
			yield* out.capture(
				api.get("/a", {
					plugins: {
						consoleLogger: { slow: "soon" as unknown as Duration.Input },
					},
				}),
			);
			expect(out.summaries()).toEqual(["GET /a  200 OK  0 ms"]);
		}),
	);

	it.effect("doesn't collapse groups by default in React Native", () =>
		Effect.gen(function* () {
			const descriptor = Object.getOwnPropertyDescriptor(
				globalThis,
				"navigator",
			);
			Object.defineProperty(globalThis, "navigator", {
				value: { product: "ReactNative" },
				configurable: true,
			});
			let native: ConsoleLoggerPlugin;
			let chosen: ConsoleLoggerPlugin;
			try {
				native = consoleLogger({ color: false });
				chosen = consoleLogger({ color: false, collapsed: true });
			} finally {
				if (descriptor === undefined) {
					Reflect.deleteProperty(globalThis, "navigator");
				} else {
					Object.defineProperty(globalThis, "navigator", descriptor);
				}
			}
			const elsewhere = consoleLogger({ color: false });
			const methods: Array<string | undefined> = [];
			for (const plugin of [native, chosen, elsewhere]) {
				const out = captureConsole();
				const { api } = yield* setup([reply.json({})], {
					plugins: [plugin],
				});
				yield* out.capture(api.get("/a"));
				methods.push(out.printed[0]?.method);
			}
			expect(methods).toEqual(["group", "groupCollapsed", "groupCollapsed"]);
		}),
	);

	it.effect("uses css colors by default where there's a document", () =>
		Effect.gen(function* () {
			const global = globalThis as { document?: unknown };
			global.document = {};
			const plugin = consoleLogger({ detail: "summary" });
			delete global.document;
			const out = captureConsole();
			const { api } = yield* setup([reply.json({})], { plugins: [plugin] });
			yield* out.capture(api.get("/a"));
			expect(out.printed[0]?.args[0]).toBe("%cGET /a%c  %c200 OK%c  %c0 ms");
			const plain = captureConsole();
			const { api: other } = yield* setup([reply.json({})], {
				plugins: [consoleLogger({ detail: "summary" })],
			});
			yield* plain.capture(other.get("/a"));
			expect(plain.printed[0]?.args).toEqual(["GET /a  200 OK  0 ms"]);
		}),
	);
});
