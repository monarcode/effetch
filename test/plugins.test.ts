import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import * as Fetch from "../src/index.js";
import { CurrentOverrides, CurrentRoute } from "../src/internal/plugins.js";
import { retry } from "../src/plugins/index.js";
import { base, setup, wire } from "./utils/client.js";
import { after } from "./utils/clock.js";
import { captureLogs } from "./utils/logs.js";
import { delayed, failure, hang, type Script } from "./utils/mockClient.js";
import { reply, respond } from "./utils/reply.js";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

class SessionExpired extends Data.TaggedError("SessionExpired")<{}> {}
class Unavailable extends Data.TaggedError("Unavailable")<{
	readonly status: number;
}> {}
class Session extends Context.Service<Session, { readonly token: string }>()(
	"Session",
) {}

const trail = (request: HttpClientRequest.HttpClientRequest, name: string) =>
	HttpClientRequest.setHeader(
		request,
		"x-trail",
		[request.headers["x-trail"], name].filter(Boolean).join(" "),
	);

const tracer = <const Name extends string>(name: Name, log: Array<string>) =>
	Fetch.plugin({
		name,
		onRequest: (request) =>
			Effect.sync(() => {
				log.push(`${name} onRequest`);
				return trail(request, name);
			}),
		onResponse: (response) =>
			Effect.sync(() => {
				log.push(`${name} onResponse`);
				return response;
			}),
	});

const session = Fetch.plugin({
	name: "session",
	onResponse: (response) =>
		response.status === 401
			? Effect.fail(new SessionExpired())
			: Effect.succeed(response),
});

describe("onRequest and onResponse", () => {
	it.effect(
		"run as an onion: onRequest in array order, onResponse in reverse",
		() =>
			Effect.gen(function* () {
				const log: Array<string> = [];
				const { mock, api } = yield* setup([reply.json({})], {
					plugins: [tracer("a", log), tracer("b", log)],
				});
				yield* api.get("/todos");
				expect(log).toEqual([
					"a onRequest",
					"b onRequest",
					"b onResponse",
					"a onResponse",
				]);
				expect(wire(mock).headers["x-trail"]).toBe("a b");
			}),
	);

	it.effect("see the full URL and the client's headers", () =>
		Effect.gen(function* () {
			const seen: Array<HttpClientRequest.HttpClientRequest> = [];
			const recorder = Fetch.plugin({
				name: "recorder",
				onRequest: (request) =>
					Effect.sync(() => {
						seen.push(request);
						return request;
					}),
			});
			yield* setup([reply.json({})], {
				headers: { "x-client": "web" },
				plugins: [recorder],
			}).pipe(
				Effect.flatMap(({ api }) =>
					api.get("/todos/:id", { params: { id: 1 }, query: { a: 1 } }),
				),
			);
			expect(seen[0]?.url).toBe("https://api.test/todos/1");
			expect(seen[0]?.headers["x-client"]).toBe("web");
		}),
	);

	it.effect("give onResponse the request its own onRequest passed on", () =>
		Effect.gen(function* () {
			const seen: Array<HttpClientRequest.HttpClientRequest> = [];
			const outer = Fetch.plugin({
				name: "outer",
				onRequest: (request) => Effect.succeed(trail(request, "outer")),
				onResponse: (response, ctx) =>
					Effect.sync(() => {
						seen.push(ctx.request);
						return response;
					}),
			});
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [outer, tracer("inner", [])],
			});
			yield* api.get("/todos");
			expect(seen[0]?.headers["x-trail"]).toBe("outer");
			expect(wire(mock).headers["x-trail"]).toBe("outer inner");
		}),
	);

	it.effect("can fail the call before anything is sent", () =>
		Effect.gen(function* () {
			const guard = Fetch.plugin({
				name: "guard",
				onRequest: () => Effect.fail(new SessionExpired()),
			});
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [guard],
			});
			const error = yield* Effect.flip(api.get("/todos"));
			expect(error).toBeInstanceOf(SessionExpired);
			expect(mock.requests).toHaveLength(0);
		}),
	);

	it.effect("see non-2xx responses and can fail with their own error", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.empty(401), reply.json({})], {
				plugins: [session],
			});
			const error = yield* Effect.flip(api.get("/me"));
			expect(error).toBeInstanceOf(SessionExpired);
			const response = yield* api.get("/me");
			expect(response.status).toBe(200);
		}),
	);

	it.effect("can replace the response the status check and decoding see", () =>
		Effect.gen(function* () {
			const emptyOn404 = Fetch.plugin({
				name: "emptyOn404",
				onResponse: (response) =>
					Effect.succeed(
						response.status === 404
							? respond(reply.json([]), response.request)
							: response,
					),
			});
			const { api } = yield* setup([reply.empty(404)], {
				plugins: [emptyOn404],
			});
			const todos = yield* api.get("/todos", { output: Schema.Array(Todo) });
			expect(todos).toEqual([]);
		}),
	);
});

describe("wrap", () => {
	it.effect("encloses its plugin's hooks and the plugins after it", () =>
		Effect.gen(function* () {
			const log: Array<string> = [];
			const retrying = Fetch.plugin({
				name: "retrying",
				onRequest: (request) =>
					Effect.sync(() => {
						log.push("retrying onRequest");
						return request;
					}),
				wrap: (client) => HttpClient.retry(client, { times: 2 }),
			});
			const { mock, api } = yield* setup(
				[failure(), failure(), reply.json({})],
				{ plugins: [tracer("outer", log), retrying, tracer("inner", log)] },
			);
			yield* api.get("/todos");
			expect(mock.requests).toHaveLength(3);
			expect(
				log.filter((entry) => entry === "outer onRequest"),
			).toHaveLength(1);
			expect(
				log.filter((entry) => entry === "retrying onRequest"),
			).toHaveLength(3);
			expect(
				log.filter((entry) => entry === "inner onRequest"),
			).toHaveLength(3);
		}),
	);

	it.effect("sees the library's errors, not the HttpClient's", () =>
		Effect.gen(function* () {
			const seen: Array<unknown> = [];
			const watcher = Fetch.plugin({
				name: "watcher",
				wrap: (client) =>
					HttpClient.transformResponse(
						client,
						Effect.tapError((error) =>
							Effect.sync(() => seen.push(error)),
						),
					),
			});
			const { api } = yield* setup([failure()], { plugins: [watcher] });
			const error = yield* Effect.flip(api.get("/todos"));
			expect(error).toBeInstanceOf(Fetch.NetworkError);
			expect(seen).toEqual([error]);
		}),
	);

	it.effect("can add its own error, using the call's options", () =>
		Effect.gen(function* () {
			const unavailable = Fetch.plugin({
				name: "unavailable",
				defaults: { status: 503 },
				wrap: (client, options) =>
					HttpClient.transformResponse(client, (response) =>
						Effect.gen(function* () {
							const { status } = yield* options;
							const received = yield* response;
							if (received.status === status) {
								return yield* new Unavailable({ status });
							}
							return received;
						}),
					),
			});
			const { api } = yield* setup([reply.empty(503)], {
				plugins: [unavailable],
			});
			const first = yield* Effect.flip(api.get("/todos"));
			expect(first).toEqual(new Unavailable({ status: 503 }));
			const second = yield* Effect.flip(
				api.get("/todos", { plugins: { unavailable: { status: 500 } } }),
			);
			expect(second).toBeInstanceOf(Fetch.HttpError);
		}),
	);
});

describe("per-call overrides", () => {
	it.effect("false skips the plugin's hooks, wrap, onError and onExit", () =>
		Effect.gen(function* () {
			const log: Array<string> = [];
			const skippable = Fetch.plugin({
				name: "skippable",
				onRequest: (request) =>
					Effect.sync(() => {
						log.push("onRequest");
						return request;
					}),
				onResponse: (response) =>
					Effect.sync(() => {
						log.push("onResponse");
						return response;
					}),
				onError: () => Effect.sync(() => log.push("onError")),
				onExit: () => Effect.sync(() => log.push("onExit")),
				wrap: (client) =>
					HttpClient.transformResponse(
						client,
						Effect.tap(() => Effect.sync(() => log.push("wrap"))),
					),
			});
			const { mock, api } = yield* setup([reply.empty(500)], {
				plugins: [skippable, tracer("other", [])],
			});
			yield* Effect.flip(
				api.get("/todos", { plugins: { skippable: false } }),
			);
			expect(log).toEqual([]);
			expect(wire(mock, 0).headers["x-trail"]).toBe("other");
			yield* Effect.flip(api.get("/todos"));
			expect(log).toEqual([
				"onRequest",
				"onResponse",
				"wrap",
				"onError",
				"onExit",
			]);
		}),
	);

	it.effect("merge with the defaults, keeping them for undefined values", () =>
		Effect.gen(function* () {
			const headers = Fetch.plugin({
				name: "headers",
				defaults: { a: "1", b: "2" },
				onRequest: (request, ctx) =>
					Effect.succeed(
						HttpClientRequest.setHeaders(request, {
							"x-a": ctx.options.a,
							"x-b": ctx.options.b,
						}),
					),
			});
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [headers],
			});
			const withUndefined = { a: "A", b: undefined } as {
				readonly a: string;
			};
			yield* api.get("/todos", { plugins: { headers: withUndefined } });
			yield* api.get("/todos");
			expect(wire(mock, 0).headers).toMatchObject({
				"x-a": "A",
				"x-b": "2",
			});
			expect(wire(mock, 1).headers).toMatchObject({
				"x-a": "1",
				"x-b": "2",
			});
		}),
	);

	it.effect("apply to their own call only, even concurrently", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [tracer("tag", [])],
			});
			yield* Effect.all(
				[
					api.get("/skipped", { plugins: { tag: false } }),
					api.get("/tagged"),
				],
				{ concurrency: "unbounded" },
			);
			const byUrl = Object.fromEntries(
				mock.requests.map((request) => [request.url, request]),
			);
			expect(byUrl[`${base}/skipped`]?.headers["x-trail"]).toBeUndefined();
			expect(byUrl[`${base}/tagged`]?.headers["x-trail"]).toBe("tag");
		}),
	);
});

const observer = (seen: Array<unknown>) =>
	Fetch.plugin({
		name: "observer",
		onError: (error) => Effect.sync(() => seen.push(error)),
	});

const observed = (script: Script, seen: Array<unknown>) =>
	setup(script, { plugins: [observer(seen), session] });

type ObservedApi = Effect.Success<ReturnType<typeof observed>>["api"];

describe("onError", () => {
	it.effect.each([
		[
			"HttpError",
			[reply.json({ code: "x" }, { status: 500 })],
			(api: ObservedApi): Effect.Effect<unknown, unknown> =>
				api.get("/todos"),
		],
		[
			"DecodeError",
			[reply.json({ id: "1" })],
			(api: ObservedApi): Effect.Effect<unknown, unknown> =>
				api.get("/todos", { output: Todo }),
		],
		["NetworkError", [failure()], (api: ObservedApi) => api.get("/todos")],
		[
			"SessionExpired",
			[reply.empty(401)],
			(api: ObservedApi) => api.get("/me"),
		],
	] as const)("sees a %s", ([tag, script, call]) =>
		Effect.gen(function* () {
			const seen: Array<unknown> = [];
			const { api } = yield* observed(script, seen);
			const error = yield* Effect.flip(call(api));
			expect(error).toMatchObject({ _tag: tag });
			expect(seen).toEqual([error]);
		}),
	);

	it.effect(
		"runs in array order after decoding, with the request and the options",
		() =>
			Effect.gen(function* () {
				const seen: Array<unknown> = [];
				const record =
					(name: string) =>
					(error: unknown, ctx: Fetch.PluginContext<unknown>) =>
						Effect.sync(() => {
							seen.push({
								name,
								error,
								url: ctx.request.url,
								options: ctx.options,
							});
						});
				const first = Fetch.plugin({
					name: "first",
					onError: record("first"),
				});
				const second = Fetch.plugin({
					name: "second",
					defaults: { level: "warn", tag: "api" },
					onError: record("second"),
				});
				const { api } = yield* setup([reply.json({})], {
					plugins: [first, second],
				});
				const error = yield* Effect.flip(
					api.get("/todos", {
						output: Todo,
						plugins: { second: { level: "error" } },
					}),
				);
				expect(error).toBeInstanceOf(Fetch.DecodeError);
				expect(seen).toEqual([
					{
						name: "first",
						error,
						url: `${base}/todos`,
						options: undefined,
					},
					{
						name: "second",
						error,
						url: `${base}/todos`,
						options: { level: "error", tag: "api" },
					},
				]);
			}),
	);

	it.effect("doesn't run on success or interruption", () =>
		Effect.gen(function* () {
			const seen: Array<unknown> = [];
			const { api } = yield* observed([reply.json({}), hang], seen);
			yield* api.get("/todos");
			const fiber = yield* Effect.forkChild(api.get("/slow"));
			yield* Effect.yieldNow;
			yield* Fiber.interrupt(fiber);
			expect(seen).toEqual([]);
		}),
	);

	it.effect("doesn't run when a plugin interrupts the call", () =>
		Effect.gen(function* () {
			const seen: Array<unknown> = [];
			const cancel = Fetch.plugin({
				name: "cancel",
				onRequest: () => Effect.interrupt,
			});
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [observer(seen), cancel],
			});
			const exit = yield* Effect.exit(api.get("/todos"));
			expect(Exit.hasInterrupts(exit)).toBe(true);
			expect(mock.requests).toHaveLength(0);
			expect(seen).toEqual([]);
		}),
	);

	it.effect("sees defects, which still kill the call", () =>
		Effect.gen(function* () {
			const seen: Array<unknown> = [];
			const boom = new Error("boom");
			const broken = Fetch.plugin({
				name: "broken",
				onRequest: () => Effect.die(boom),
			});
			const { api } = yield* setup([reply.json({})], {
				plugins: [observer(seen), broken],
			});
			const exit = yield* Effect.exit(api.get("/todos"));
			expect(Exit.hasDies(exit)).toBe(true);
			expect(seen).toEqual([boom]);
		}),
	);

	it.effect("can't change the outcome when it dies, and is logged", () =>
		Effect.gen(function* () {
			const seen: Array<unknown> = [];
			const logs = captureLogs();
			const dying = Fetch.plugin({
				name: "dying",
				onError: () => Effect.die(new Error("hook failed")),
			});
			const { api } = yield* setup([reply.empty(500)], {
				plugins: [dying, observer(seen)],
			});
			const error = yield* logs.capture(Effect.flip(api.get("/todos")));
			expect(error).toBeInstanceOf(Fetch.HttpError);
			expect(seen).toEqual([error]);
			const entry = logs.entries.find((logged) =>
				String(logged.message[0]).includes('plugin "dying"'),
			);
			expect(entry?.level).toBe("Debug");
			expect(entry && Cause.squash(entry.cause)).toEqual(
				new Error("hook failed"),
			);
		}),
	);

	it.effect("doesn't run when the call dies before the request is built", () =>
		Effect.gen(function* () {
			const seen: Array<unknown> = [];
			const { api } = yield* observed([reply.json({})], seen);
			const exit = yield* Effect.exit(
				api.request("GET", "/todos", { body: {} }),
			);
			expect(Exit.hasDies(exit)).toBe(true);
			expect(seen).toEqual([]);
		}),
	);
});

/** What one `onExit` call saw. */
interface ExitSeen {
	readonly exit: Exit.Exit<unknown, unknown>;
	readonly ctx: Fetch.PluginExitContext<unknown>;
}

const exitObserver = (seen: Array<ExitSeen>) =>
	Fetch.plugin({
		name: "exits",
		onExit: (exit, ctx) => Effect.sync(() => seen.push({ exit, ctx })),
	});

const only = (seen: ReadonlyArray<ExitSeen>): ExitSeen => {
	expect(seen).toHaveLength(1);
	return seen[0] as ExitSeen;
};

describe("onExit", () => {
	it.effect("sees a success, with the decoded output and the response", () =>
		Effect.gen(function* () {
			const seen: Array<ExitSeen> = [];
			const { api } = yield* setup([reply.json({ id: 1, title: "a" })], {
				plugins: [exitObserver(seen)],
			});
			const todo = yield* api.get("/todos/:id", {
				params: { id: 1 },
				output: Todo,
			});
			const { exit, ctx } = only(seen);
			expect(exit).toEqual(Exit.succeed(todo));
			expect(ctx.route).toBe("GET /todos/:id");
			expect(ctx.request.url).toBe(`${base}/todos/1`);
			expect(ctx.response?.status).toBe(200);
			expect(ctx.durationMs).toBe(0);
			expect(ctx.options).toBeUndefined();
		}),
	);

	it.effect(
		"sees the response itself as the result of a call without output",
		() =>
			Effect.gen(function* () {
				const seen: Array<ExitSeen> = [];
				const { api } = yield* setup([reply.text("hi")], {
					plugins: [exitObserver(seen)],
				});
				const response = yield* api.get("/hello");
				const { exit, ctx } = only(seen);
				expect(Exit.isSuccess(exit) && exit.value).toBe(response);
				expect(ctx.response).toBe(response);
			}),
	);

	it.effect.each([
		["HttpError", [reply.json({}, { status: 500 })], 500],
		["DecodeError", [reply.json({ id: "1" })], 200],
		["NetworkError", [failure()], undefined],
	] as const)("sees a %s, with the response if any", ([tag, script, status]) =>
		Effect.gen(function* () {
			const seen: Array<ExitSeen> = [];
			const { api } = yield* setup(script, {
				plugins: [exitObserver(seen)],
			});
			const error = yield* Effect.flip(api.get("/todos", { output: Todo }));
			expect(error).toMatchObject({ _tag: tag });
			const { exit, ctx } = only(seen);
			expect(exit).toEqual(Exit.fail(error));
			expect(ctx.response?.status).toBe(status);
		}),
	);

	it.effect("sees a statusErrors error", () =>
		Effect.gen(function* () {
			class Gone extends Schema.TaggedError<Gone>()("Gone", {
				message: Schema.String,
			}) {}
			const seen: Array<ExitSeen> = [];
			const { api } = yield* setup(
				[reply.json({ message: "gone" }, { status: 410 })],
				{ plugins: [exitObserver(seen)], statusErrors: { 410: Gone } },
			);
			const error = yield* Effect.flip(api.get("/todos"));
			expect(error).toBeInstanceOf(Gone);
			expect(only(seen).exit).toEqual(Exit.fail(error));
		}),
	);

	it.effect("sees an interruption, which it can't stop", () =>
		Effect.gen(function* () {
			const seen: Array<ExitSeen> = [];
			const { api } = yield* setup([hang], {
				plugins: [exitObserver(seen)],
			});
			const fiber = yield* Effect.forkChild(api.get("/slow"));
			yield* Effect.yieldNow;
			yield* Fiber.interrupt(fiber);
			const { exit, ctx } = only(seen);
			expect(
				Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause),
			).toBe(true);
			expect(ctx.response).toBeUndefined();
		}),
	);

	it.effect("sees defects, which still kill the call", () =>
		Effect.gen(function* () {
			const seen: Array<ExitSeen> = [];
			const boom = new Error("boom");
			const broken = Fetch.plugin({
				name: "broken",
				onResponse: () => Effect.die(boom),
			});
			const { api } = yield* setup([reply.json({})], {
				plugins: [exitObserver(seen), broken],
			});
			const exit = yield* Effect.exit(api.get("/todos"));
			expect(Exit.hasDies(exit)).toBe(true);
			expect(only(seen).exit).toEqual(exit);
		}),
	);

	it.effect("sees the network's response when a plugin fails after it", () =>
		Effect.gen(function* () {
			const seen: Array<ExitSeen> = [];
			const expire = Fetch.plugin({
				name: "expire",
				onResponse: () => Effect.fail(new SessionExpired()),
			});
			const { api } = yield* setup([reply.empty(401)], {
				plugins: [exitObserver(seen), expire],
			});
			const error = yield* Effect.flip(api.get("/me"));
			const { exit, ctx } = only(seen);
			expect(exit).toEqual(Exit.fail(error));
			expect(ctx.response?.status).toBe(401);
		}),
	);

	it.effect("has no response when the last attempt got none", () =>
		Effect.gen(function* () {
			const seen: Array<ExitSeen> = [];
			const { api } = yield* setup([reply.empty(503), failure()], {
				plugins: [
					retry({ times: 1, schedule: Schedule.spaced("10 millis") }),
					exitObserver(seen),
				],
			});
			yield* Effect.flip(after(api.get("/todos"), "10 millis"));
			expect(only(seen).ctx.response).toBeUndefined();
		}),
	);

	it.effect("isn't given the response of a call made inside it", () =>
		Effect.gen(function* () {
			const seen: Array<ExitSeen> = [];
			const inner: { calls?: Effect.Effect<unknown, unknown> | undefined } =
				{};
			// After the outer response, makes calls of its own, then fails.
			const nested = Fetch.plugin({
				name: "nested",
				onResponse: (response) =>
					Effect.gen(function* () {
						if (!response.request.url.endsWith("/outer")) {
							return response;
						}
						const calls = inner.calls;
						inner.calls = undefined;
						if (calls !== undefined) {
							yield* Effect.orDie(calls);
						}
						return yield* new SessionExpired();
					}),
			});
			const script = (request: { readonly url: string }) =>
				request.url.endsWith("/outer") ? reply.empty(401) : reply.json({});
			const { api } = yield* setup(script, {
				plugins: [exitObserver(seen), nested],
			});
			const { api: other } = yield* setup(script, {
				plugins: [exitObserver(seen)],
			});
			const expectOuter401 = Effect.gen(function* () {
				seen.length = 0;
				yield* Effect.flip(api.get("/outer"));
				expect(
					seen.map(({ ctx }) => [ctx.route, ctx.response?.status]),
				).toEqual([
					["GET /inner", 200],
					["GET /outer", 401],
				]);
			});
			const raw = HttpClientRequest.get("/raw");
			inner.calls = Effect.andThen(
				api.get("/inner"),
				api.httpClient.execute(raw),
			);
			yield* expectOuter401;
			inner.calls = Effect.andThen(
				other.get("/inner"),
				other.httpClient.execute(raw),
			);
			yield* expectOuter401;
		}),
	);

	it.effect(
		"runs in array order after the onError hooks, with the options",
		() =>
			Effect.gen(function* () {
				const log: Array<unknown> = [];
				const hooks = <const Name extends string>(name: Name) =>
					Fetch.plugin({
						name,
						defaults: { level: "warn" },
						onError: () => Effect.sync(() => log.push(`${name} onError`)),
						onExit: (_exit, ctx) =>
							Effect.sync(() =>
								log.push(`${name} onExit ${ctx.options.level}`),
							),
					});
				const { api } = yield* setup([reply.empty(500)], {
					plugins: [hooks("first"), hooks("second")],
				});
				yield* Effect.flip(
					api.get("/todos", { plugins: { second: { level: "error" } } }),
				);
				expect(log).toEqual([
					"first onError",
					"second onError",
					"first onExit warn",
					"second onExit error",
				]);
			}),
	);

	it.effect(
		"sees the built request, and the sent one as the response's request",
		() =>
			Effect.gen(function* () {
				const seen: Array<ExitSeen> = [];
				const { api } = yield* setup([reply.json({})], {
					plugins: [exitObserver(seen), tracer("tag", [])],
				});
				yield* api.get("/todos");
				const { ctx } = only(seen);
				expect(ctx.request.headers["x-trail"]).toBeUndefined();
				expect(ctx.response?.request.headers["x-trail"]).toBe("tag");
			}),
	);

	it.effect(
		"measures the call until it's decoded, retries included, onError hooks not",
		() =>
			Effect.gen(function* () {
				const seen: Array<ExitSeen> = [];
				const slowReport = Fetch.plugin({
					name: "slowReport",
					onError: () => Effect.sleep("1 second"),
				});
				const { api } = yield* setup(
					[
						delayed("100 millis", reply.empty(503)),
						delayed("100 millis", reply.json({})),
					],
					{
						// Last in the list: inside the retries, and still sees them all.
						plugins: [
							retry({
								times: 1,
								schedule: Schedule.spaced("50 millis"),
							}),
							slowReport,
							exitObserver(seen),
						],
					},
				);
				yield* Effect.flip(
					after(api.get("/todos", { output: Todo }), "2 seconds"),
				);
				const { exit, ctx } = only(seen);
				expect(Exit.isFailure(exit)).toBe(true);
				expect(ctx.response?.status).toBe(200);
				expect(ctx.durationMs).toBe(250);
			}),
	);

	it.effect("can't change the outcome when it dies, and is logged", () =>
		Effect.gen(function* () {
			const seen: Array<ExitSeen> = [];
			const logs = captureLogs();
			const dying = Fetch.plugin({
				name: "dying",
				onExit: () => Effect.die(new Error("hook failed")),
			});
			const { api } = yield* setup([reply.json({ id: 1, title: "a" })], {
				plugins: [dying, exitObserver(seen)],
			});
			const todo = yield* logs.capture(
				api.get("/todos/1", { output: Todo }),
			);
			expect(todo).toEqual({ id: 1, title: "a" });
			expect(seen).toHaveLength(1);
			const entry = logs.entries.find((logged) =>
				String(logged.message[0]).includes('onExit hook of plugin "dying"'),
			);
			expect(entry?.level).toBe("Debug");
			expect(entry && Cause.squash(entry.cause)).toEqual(
				new Error("hook failed"),
			);
		}),
	);

	it.effect("can use the services captured by make", () =>
		Effect.gen(function* () {
			const tokens: Array<string> = [];
			const withSession = Fetch.plugin({
				name: "withSession",
				onExit: () =>
					Effect.map(Effect.service(Session), ({ token }) => {
						tokens.push(token);
					}),
			});
			const { api } = yield* setup([reply.json({})], {
				plugins: [withSession],
			}).pipe(Effect.provideService(Session, { token: "from-make" }));
			yield* api.get("/todos");
			expect(tokens).toEqual(["from-make"]);
		}),
	);

	it.effect("doesn't run when the call dies before the request is built", () =>
		Effect.gen(function* () {
			const seen: Array<ExitSeen> = [];
			const { api } = yield* setup([reply.json({})], {
				plugins: [exitObserver(seen)],
			});
			const exit = yield* Effect.exit(
				api.request("GET", "/todos", { body: {} }),
			);
			expect(Exit.hasDies(exit)).toBe(true);
			expect(seen).toEqual([]);
		}),
	);

	it.effect("doesn't run for httpClient", () =>
		Effect.gen(function* () {
			const seen: Array<ExitSeen> = [];
			const { api } = yield* setup([reply.json({})], {
				plugins: [exitObserver(seen)],
			});
			yield* api.httpClient.execute(HttpClientRequest.get("/todos"));
			expect(seen).toEqual([]);
		}),
	);
});

describe("services", () => {
	const auth = Fetch.plugin({
		name: "auth",
		onRequest: (request) =>
			Effect.map(Effect.service(Session), ({ token }) =>
				HttpClientRequest.bearerToken(request, token),
			),
	});

	it.effect("come from make, so calls don't need them", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [auth],
			}).pipe(Effect.provideService(Session, { token: "from-make" }));
			yield* api.get("/me");
			expect(wire(mock).headers.authorization).toBe("Bearer from-make");
		}),
	);

	it.effect("give way to the ones provided around a call", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [auth],
			}).pipe(Effect.provideService(Session, { token: "from-make" }));
			yield* api
				.get("/me")
				.pipe(Effect.provideService(Session, { token: "from-call" }));
			expect(wire(mock).headers.authorization).toBe("Bearer from-call");
		}),
	);
});

describe("make", () => {
	it.effect("dies when two plugins have the same name", () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(
				setup([reply.json({})], {
					plugins: [tracer("same", []), tracer("same", [])],
				}),
			);
			expect(Exit.hasDies(exit)).toBe(true);
			expect(
				Exit.isFailure(exit) && (Cause.squash(exit.cause) as Error).message,
			).toBe('Two plugins are named "same"');
		}),
	);
});

/** Records the route each hook sees, as `"<hook> <route>"`. */
const routeRecorder = (seen: Array<string>) =>
	Fetch.plugin({
		name: "routes",
		onRequest: (request, ctx) =>
			Effect.sync(() => {
				seen.push(`onRequest ${ctx.route}`);
				return request;
			}),
		onResponse: (response, ctx) =>
			Effect.sync(() => {
				seen.push(`onResponse ${ctx.route}`);
				return response;
			}),
		onError: (_error, ctx) =>
			Effect.sync(() => {
				seen.push(`onError ${ctx.route}`);
			}),
		onExit: (_exit, ctx) =>
			Effect.sync(() => {
				seen.push(`onExit ${ctx.route}`);
			}),
		wrap: (client, _options, route) =>
			HttpClient.transform(client, (response) =>
				Effect.gen(function* () {
					seen.push(`wrap ${yield* route}`);
					return yield* response;
				}),
			),
	});

describe("route", () => {
	it.effect("is the call's method and unfilled path, in every hook", () =>
		Effect.gen(function* () {
			const seen: Array<string> = [];
			const { api } = yield* setup([reply.empty(500)], {
				plugins: [routeRecorder(seen)],
			});
			yield* Effect.flip(api.get("/todos/:id", { params: { id: 1 } }));
			expect(seen).toEqual([
				"wrap GET /todos/:id",
				"onRequest GET /todos/:id",
				"onResponse GET /todos/:id",
				"onError GET /todos/:id",
				"onExit GET /todos/:id",
			]);
		}),
	);

	it.effect("is the same for every method and for endpoints", () =>
		Effect.gen(function* () {
			const seen: Array<string> = [];
			const { api } = yield* setup([reply.json({})], {
				plugins: [routeRecorder(seen)],
			});
			yield* api.request("PATCH", "/todos/:id", { params: { id: 1 } });
			yield* api.endpoint("PATCH /todos/:id")({ params: { id: 2 } });
			yield* api.post("https://other.test/upload");
			const onRequest = seen.filter((entry) =>
				entry.startsWith("onRequest"),
			);
			expect(onRequest).toEqual([
				"onRequest PATCH /todos/:id",
				"onRequest PATCH /todos/:id",
				"onRequest POST https://other.test/upload",
			]);
		}),
	);

	it.effect("belongs to its own call, even concurrently", () =>
		Effect.gen(function* () {
			const seen: Array<string> = [];
			const { api } = yield* setup([reply.json({})], {
				plugins: [routeRecorder(seen)],
			});
			yield* Effect.all(
				[api.get("/a"), api.del("/b/:id", { params: { id: 1 } })],
				{
					concurrency: "unbounded",
				},
			);
			expect(
				seen.filter((entry) => entry.startsWith("onRequest")).sort(),
			).toEqual(["onRequest DELETE /b/:id", "onRequest GET /a"]);
		}),
	);

	it.effect("is undefined for httpClient, even inside a call", () =>
		Effect.gen(function* () {
			const seen: Array<string> = [];
			const inner: {
				send?:
					| ((
							request: HttpClientRequest.HttpClientRequest,
					  ) => Effect.Effect<unknown, unknown>)
					| undefined;
			} = {};
			const nested = Fetch.plugin({
				name: "nested",
				onRequest: (request, ctx) =>
					Effect.gen(function* () {
						// Only once, so a leaked route fails the test instead of looping.
						const send = inner.send;
						if (ctx.route === "GET /outer" && send !== undefined) {
							inner.send = undefined;
							yield* Effect.orDie(send(HttpClientRequest.get("/inner")));
						}
						return request;
					}),
			});
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [routeRecorder(seen), nested],
			});
			inner.send = (request) => api.httpClient.execute(request);
			yield* api.get("/outer");
			expect(mock.requests.map((request) => request.url)).toEqual([
				`${base}/inner`,
				`${base}/outer`,
			]);
			expect(seen.filter((entry) => entry.startsWith("onRequest"))).toEqual([
				"onRequest GET /outer",
				"onRequest undefined",
			]);
			expect(seen.filter((entry) => entry.startsWith("onExit"))).toEqual([
				"onExit GET /outer",
			]);
		}),
	);
});

describe("httpClient", () => {
	it.effect("runs every plugin with its defaults, outside any call", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [tracer("tag", [])],
			});
			yield* api.httpClient
				.execute(HttpClientRequest.get("/todos"))
				.pipe(Effect.provideService(CurrentOverrides, { tag: false }));
			expect(wire(mock).url).toBe(`${base}/todos`);
			expect(wire(mock).headers["x-trail"]).toBe("tag");
		}),
	);

	it.effect("gives plugins no route, outside any call", () =>
		Effect.gen(function* () {
			const seen: Array<string> = [];
			const { api } = yield* setup([reply.json({})], {
				plugins: [routeRecorder(seen)],
			});
			yield* api.httpClient
				.execute(HttpClientRequest.get("/todos"))
				.pipe(Effect.provideService(CurrentRoute, "GET /elsewhere"));
			expect(seen).toEqual([
				"wrap undefined",
				"onRequest undefined",
				"onResponse undefined",
			]);
		}),
	);

	it.effect("fails with the plugins' errors", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.empty(401)], {
				plugins: [session],
			});
			const error = yield* Effect.flip(
				api.httpClient.execute(HttpClientRequest.get("/me")),
			);
			expect(error).toBeInstanceOf(SessionExpired);
		}),
	);
});
