import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import * as Fetch from "../src/index.js";
import { CurrentOverrides, CurrentRoute } from "../src/internal/plugins.js";
import { base, setup, wire } from "./utils/client.js";
import { captureLogs } from "./utils/logs.js";
import { failure, hang, type Script } from "./utils/mockClient.js";
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
	it.effect("false skips the plugin's hooks, wrap and onError", () =>
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
			expect(log).toEqual(["onRequest", "onResponse", "wrap", "onError"]);
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
