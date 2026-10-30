import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import * as Fetch from "../src/index.js";
import { base, setup, wire } from "./utils/client.js";
import {
	failure,
	hang,
	makeMockClient,
	type RecordedRequest,
	type Script,
} from "./utils/mockClient.js";
import { redacted, supportsRedactedQuery } from "./utils/redacted.js";
import { reply } from "./utils/reply.js";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });
const ApiError = Schema.Struct({ code: Schema.String });

const defectOf = <A, E>(self: Effect.Effect<A, E>) =>
	Effect.map(Effect.exit(self), (exit) => {
		expect(Exit.hasDies(exit)).toBe(true);
		expect(Exit.hasFails(exit)).toBe(false);
		return Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
	});

const messageOf = (defect: unknown) => (defect as Error).message;

describe("base URL", () => {
	it.effect("is prepended to a relative path", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				baseUrl: "https://api.test/v1/",
			});
			yield* api.get("todos");
			expect(wire(mock).url).toBe("https://api.test/v1/todos");
		}),
	);

	it.effect.each([
		[base, "https://other.test/x", "https://other.test/x"],
		[base, "http://localhost:3000/y", "http://localhost:3000/y"],
		[undefined, "https://other.test/x", "https://other.test/x"],
	] as const)(
		"leaves absolute URLs alone (%s, %s)",
		([baseUrl, path, expected]) =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup([reply.json({})], { baseUrl });
				yield* api.get(path);
				expect(wire(mock).url).toBe(expected);
			}),
	);

	it.effect("can be an Effect", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				baseUrl: Effect.succeed("https://effect.test"),
			});
			yield* api.get("/x");
			expect(wire(mock).url).toBe("https://effect.test/x");
		}),
	);

	it.effect("can be a Config", () =>
		Effect.gen(function* () {
			const provider = (values: Record<string, string>) =>
				ConfigProvider.layer(ConfigProvider.fromUnknown(values));
			const { mock, api } = yield* setup([reply.json({})], {
				baseUrl: Config.String("API_URL"),
			}).pipe(Effect.provide(provider({ API_URL: "https://config.test" })));
			yield* api.get("/x");
			expect(wire(mock).url).toBe("https://config.test/x");

			const error = yield* Effect.flip(
				setup([reply.json({})], { baseUrl: Config.String("API_URL") }).pipe(
					Effect.provide(provider({})),
				),
			);
			expect(error._tag).toBe("ConfigError");
		}),
	);

	it.effect("can need services, which make asks for", () =>
		Effect.gen(function* () {
			class Origin extends Context.Service<Origin, string>()("Origin") {}
			const { mock, api } = yield* setup([reply.json({})], {
				baseUrl: Effect.service(Origin),
			}).pipe(Effect.provideService(Origin, "https://svc.test"));
			yield* api.get("/x");
			expect(wire(mock).url).toBe("https://svc.test/x");
		}),
	);

	it.effect("is resolved once, when the client is made", () =>
		Effect.gen(function* () {
			let resolved = 0;
			const { api } = yield* setup([reply.json({})], {
				baseUrl: Effect.sync(() => {
					resolved += 1;
					return base;
				}),
			});
			yield* api.get("/a");
			yield* api.get("/b");
			expect(resolved).toBe(1);
		}),
	);

	it.effect.each([
		"https://api.test/v1?key=SECRET",
		"https://api.test/v1#SECRET",
	])("with a query string or fragment is a defect: %s", (baseUrl) =>
		Effect.gen(function* () {
			for (const config of [
				{ baseUrl },
				{ baseUrl: Effect.succeed(baseUrl) },
			]) {
				const defect = yield* defectOf(
					Fetch.make(config).pipe(
						Effect.provide(makeMockClient([reply.json({})]).layer),
					),
				);
				expect(messageOf(defect)).toMatch(
					/^The baseUrl can't contain a query/,
				);
				expect(messageOf(defect)).not.toContain("SECRET");
			}
		}),
	);
});

describe("path params and query", () => {
	it.effect("are interpolated, encoded and put on the URL", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]);
			yield* api.get("/users/:id/files/:name", {
				params: { id: 42, name: "a b/c" },
				query: { page: 1, tags: ["a", "b"], skip: undefined },
			});
			expect(wire(mock).url).toBe(
				"https://api.test/users/42/files/a%20b%2Fc?page=1&tags=a&tags=b",
			);
		}),
	);

	it.effect("accept a query typed with an interface", () =>
		Effect.gen(function* () {
			interface ListTodosParams {
				readonly limit: number;
				readonly page?: number | undefined;
			}
			const params: ListTodosParams = { limit: 5, page: undefined };
			const { mock, api } = yield* setup([reply.json({})]);
			yield* api.get("/todos", { query: params });
			expect(wire(mock).url).toBe("https://api.test/todos?limit=5");
		}),
	);

	it.effect.runIf(supportsRedactedQuery)(
		"send a Redacted query value as its value, not in errors",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup([
					reply.json({}, { status: 500 }),
				]);
				const error = yield* Effect.flip(
					api.get("/todos", {
						query: { token: redacted("s3cret"), page: 1 },
					}),
				);
				expect(wire(mock).url).toBe(
					"https://api.test/todos?token=s3cret&page=1",
				);
				expect(error).toMatchObject({
					_tag: "HttpError",
					url: "https://api.test/todos",
				});
				expect(JSON.stringify(error)).not.toContain("s3cret");
			}),
	);

	it.effect("make the call defect when a param is missing at runtime", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]);
			const defect = yield* defectOf(
				api.get("/users/:id", { params: {} } as never),
			);
			expect(messageOf(defect)).toBe(
				'Missing path parameter "id" for path "/users/:id"',
			);
			expect(mock.requests).toHaveLength(0);
		}),
	);
});

describe("headers", () => {
	it.effect(
		"come from the client, and a call's header wins whatever its case",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup([reply.json({})], {
					headers: { "X-Client": "web", "X-Keep": "yes" },
				});
				yield* api.get("/todos", {
					headers: { "x-client": "mobile", "X-Extra": "1" },
				});
				expect(wire(mock).headers).toMatchObject({
					"x-client": "mobile",
					"x-keep": "yes",
					"x-extra": "1",
				});
			}),
	);

	it.effect("ask for JSON only when there is an output schema", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([
				reply.json({ id: 1, title: "x" }),
			]);
			yield* api.get("/todos");
			yield* api.get("/todos/1", { output: Todo });
			expect(wire(mock, 0).headers["accept"]).toBeUndefined();
			expect(wire(mock, 1).headers["accept"]).toBe("application/json");
		}),
	);

	it.effect("keep an Accept header from the client or the call", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(
				[reply.json({ id: 1, title: "x" })],
				{
					headers: { Accept: "application/vnd.api+json" },
				},
			);
			yield* api.get("/todos/1", { output: Todo });
			yield* api.get("/todos/1", {
				output: Todo,
				headers: { accept: "application/x-custom" },
			});
			expect(wire(mock, 0).headers["accept"]).toBe(
				"application/vnd.api+json",
			);
			expect(wire(mock, 1).headers["accept"]).toBe("application/x-custom");
		}),
	);

	it.effect("take content-type from the body, not the client", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				headers: { "Content-Type": "text/csv", "Content-Length": "1" },
			});
			yield* api.post("/todos", { body: { a: 1 } });
			yield* api.get("/todos");
			expect(wire(mock, 0).headers).toMatchObject({
				"content-type": "application/json",
				"content-length": "7",
			});
			expect(wire(mock, 1).headers["content-type"]).toBeUndefined();
			expect(wire(mock, 1).headers["content-length"]).toBeUndefined();
		}),
	);

	it.effect(
		"leave FormData without a content-type, whatever the client sets",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup([reply.json({})], {
					headers: { "Content-Type": "application/json" },
				});
				const form = new FormData();
				form.append("file", "contents");
				yield* api.post("/upload", { body: form });
				expect(wire(mock).headers["content-type"]).toBeUndefined();
				expect(wire(mock).body).toBe("[FormData]");
			}),
	);

	it.effect("let a call's content-type win over the body's", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]);
			yield* api.patch("/todos/1", {
				body: { done: true },
				headers: { "Content-Type": "application/merge-patch+json" },
			});
			expect(wire(mock).headers["content-type"]).toBe(
				"application/merge-patch+json",
			);
			expect(wire(mock).body).toBe('{"done":true}');
		}),
	);

	it.effect("include Effect's tracing headers unless propagation is off", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]);
			yield* api.get("/todos");
			yield* api
				.get("/todos")
				.pipe(
					Effect.provideService(
						HttpClient.TracerPropagationEnabled,
						false,
					),
				);
			expect(Object.keys(wire(mock, 0).headers)).toEqual(
				expect.arrayContaining(["traceparent", "b3"]),
			);
			expect(wire(mock, 1).headers["traceparent"]).toBeUndefined();
			expect(wire(mock, 1).headers["b3"]).toBeUndefined();
		}),
	);

	it.effect("leave tracing off for every call when make had it off", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]).pipe(
				Effect.provideService(HttpClient.TracerPropagationEnabled, false),
			);
			yield* api.get("/todos");
			yield* api
				.get("/todos")
				.pipe(
					Effect.provideService(HttpClient.TracerPropagationEnabled, true),
				);
			expect(wire(mock, 0).headers["traceparent"]).toBeUndefined();
			expect(wire(mock, 1).headers["traceparent"]).toBeDefined();
		}),
	);
});

describe("method and body", () => {
	it.effect.each([
		["GET", (api: Fetch.Client) => api.get("/x")],
		["HEAD", (api: Fetch.Client) => api.head("/x")],
		["OPTIONS", (api: Fetch.Client) => api.options("/x")],
		["POST", (api: Fetch.Client) => api.post("/x")],
		["PUT", (api: Fetch.Client) => api.put("/x")],
		["PATCH", (api: Fetch.Client) => api.patch("/x")],
		["DELETE", (api: Fetch.Client) => api.del("/x")],
	] as const)("sends %s", ([method, call]) =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.empty(200)]);
			yield* call(api);
			expect(wire(mock).method).toBe(method);
			expect(wire(mock).body).toBeUndefined();
		}),
	);

	it.effect("request sends any method", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]);
			yield* api.request("PATCH", "/todos/:id", {
				params: { id: 1 },
				body: { done: true },
			});
			yield* api.request("QUERY", "/x");
			expect(wire(mock, 0)).toMatchObject({
				method: "PATCH",
				url: "https://api.test/todos/1",
				body: '{"done":true}',
			});
			expect(wire(mock, 1).method).toBe("QUERY");
		}),
	);

	it.effect(
		"sends a JSON body, encoded with the input schema when given",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup([reply.json({})]);
				yield* api.post("/a", { body: { title: "x", tags: [1] } });
				yield* api.post("/b", {
					input: NewTodo,
					body: { title: "x", due: new Date("2026-10-11T00:00:00.000Z") },
				});
				expect(wire(mock, 0).body).toBe('{"title":"x","tags":[1]}');
				expect(wire(mock, 0).headers["content-type"]).toBe(
					"application/json",
				);
				expect(wire(mock, 1).body).toBe(
					'{"title":"x","due":"2026-10-11T00:00:00.000Z"}',
				);
			}),
	);

	it.effect("sends strings as text and URLSearchParams as a form", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]);
			yield* api.post("/a", { body: "plain" });
			yield* api.post("/b", { body: new URLSearchParams({ a: "1" }) });
			expect(wire(mock, 0).body).toBe("plain");
			expect(wire(mock, 0).headers["content-type"]).toBe("text/plain");
			expect(wire(mock, 1).body).toBe("a=1");
			expect(wire(mock, 1).headers["content-type"]).toBe(
				"application/x-www-form-urlencoded",
			);
		}),
	);

	it.effect("defect, without sending anything, when it can't be encoded", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]);
			const defect = yield* defectOf(
				api.post("/todos", {
					input: NewTodo,
					body: { title: "x" } as never,
				}),
			);
			expect(messageOf(defect)).toMatch(/^Invalid request body: /);
			expect(mock.requests).toHaveLength(0);
		}),
	);

	it.effect.each(["GET", "HEAD"] as const)(
		"defects, without sending anything, when a %s has a body",
		(method) =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup([reply.json({})]);
				const defect = yield* defectOf(
					api.request(method, "/x", { body: { a: 1 } }),
				);
				expect(messageOf(defect)).toBe(
					`A ${method} request can't have a body`,
				);
				expect(mock.requests).toHaveLength(0);
			}),
	);
});

describe("results", () => {
	it.effect("are the raw response without an output schema", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.json({ id: 1 }, { status: 201 })]);
			const response = yield* api.get("/todos/1");
			expect(response.status).toBe(201);
			expect(yield* response.json).toEqual({ id: 1 });
		}),
	);

	it.effect("are decoded with the output schema", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.json({ id: 1, title: "Write docs" }),
			]);
			const todo = yield* api.get("/todos/:id", {
				params: { id: 1 },
				output: Todo,
			});
			expect(todo).toEqual({ id: 1, title: "Write docs" });
		}),
	);

	it.effect("decode an empty 204 as undefined with Schema.Void", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.empty(204)]);
			const result = yield* api.del("/todos/1", { output: Schema.Void });
			expect(result).toBeUndefined();
		}),
	);

	it.effect("fail with a DecodeError when the output doesn't match", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.json({ id: "one" })]);
			const error = yield* Effect.flip(
				api.get("/todos/1", { output: Todo }),
			);
			expect(error).toBeInstanceOf(Fetch.DecodeError);
			expect(error).toMatchObject({ _tag: "DecodeError", status: 200 });
		}),
	);

	it.effect(
		"fail with an HttpError for a non-2xx status, before decoding",
		() =>
			Effect.gen(function* () {
				const { api } = yield* setup([
					reply.json({ code: "gone" }, { status: 410 }),
				]);
				const error = yield* Effect.flip(
					api.get("/todos/1", { output: Todo }),
				);
				expect(error).toBeInstanceOf(Fetch.HttpError);
				expect(error).toMatchObject({
					_tag: "HttpError",
					status: 410,
					body: { code: "gone" },
				});
			}),
	);

	it.effect("decode error bodies with the client's error schema", () =>
		Effect.gen(function* () {
			const { api } = yield* setup(
				[
					reply.json({ code: "gone" }, { status: 410 }),
					reply.json({ message: "other" }, { status: 400 }),
				],
				{ defaultError: ApiError },
			);
			const first = yield* Effect.flip(api.get("/todos/1"));
			const second = yield* Effect.flip(api.get("/todos/1"));
			expect(first).toMatchObject({ body: { code: "gone" } });
			expect(second).toMatchObject({ _tag: "HttpError", body: undefined });
		}),
	);

	it.effect(
		"decode error bodies with a call's error schema over the client's",
		() =>
			Effect.gen(function* () {
				const { api } = yield* setup(
					[reply.json({ reason: "full" }, { status: 409 })],
					{ defaultError: ApiError },
				);
				const Conflict = Schema.Struct({ reason: Schema.String });
				const error = yield* Effect.flip(
					api.post("/todos", { error: Conflict }),
				);
				expect(error).toMatchObject({ body: { reason: "full" } });
			}),
	);

	it.effect(
		"fail with a NetworkError, without the query string, when nothing arrives",
		() =>
			Effect.gen(function* () {
				const cause = new TypeError("fetch failed");
				const { api } = yield* setup([failure(cause)]);
				const error = yield* Effect.flip(
					api.get("/todos?api_key=SECRET#frag", {
						query: { token: "SECRET" },
					}),
				);
				expect(error).toBeInstanceOf(Fetch.NetworkError);
				expect(error).toMatchObject({
					_tag: "NetworkError",
					method: "GET",
					url: "https://api.test/todos",
					message: "GET https://api.test/todos: network error",
				});
				expect((error as Fetch.NetworkError).cause).toBe(cause);
			}),
	);
});

describe("an HttpClient that fails on non-2xx statuses", () => {
	const makeApi = (script: Script) =>
		Effect.gen(function* () {
			const mock = makeMockClient(script);
			const failing = Layer.effect(HttpClient.HttpClient)(
				Effect.map(HttpClient.HttpClient, HttpClient.filterStatusOk),
			).pipe(Layer.provide(mock.layer));
			return yield* Fetch.make({
				baseUrl: base,
				defaultError: ApiError,
			}).pipe(Effect.provide(failing));
		});

	it.effect("still gives an HttpError with the response body", () =>
		Effect.gen(function* () {
			const api = yield* makeApi([
				reply.json({ code: "gone" }, { status: 410 }),
			]);
			const error = yield* Effect.flip(
				api.get("/todos/1", { output: Todo }),
			);
			expect(error).toBeInstanceOf(Fetch.HttpError);
			expect(error).toMatchObject({
				_tag: "HttpError",
				status: 410,
				url: "https://api.test/todos/1",
				body: { code: "gone" },
			});
		}),
	);

	it.effect("passes 2xx responses and transport failures on as usual", () =>
		Effect.gen(function* () {
			const ok = yield* makeApi([reply.json({ id: 1, title: "x" })]);
			expect(yield* ok.get("/todos/1", { output: Todo })).toEqual({
				id: 1,
				title: "x",
			});
			const offline = yield* makeApi([failure()]);
			expect((yield* Effect.flip(offline.get("/x")))._tag).toBe(
				"NetworkError",
			);
		}),
	);
});

describe("defects", () => {
	it.effect("a relative URL without a baseUrl is one, outside browsers", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				baseUrl: undefined,
			});
			const defect = yield* defectOf(api.get("/todos"));
			expect(defect).toBeInstanceOf(HttpClientError.HttpClientError);
			expect((defect as HttpClientError.HttpClientError).reason._tag).toBe(
				"InvalidUrlError",
			);
			expect(mock.requests).toHaveLength(0);
		}),
	);
});

describe("interruption", () => {
	it.effect("aborts the in-flight request", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([hang]);
			const fiber = yield* Effect.forkChild(
				api.get("/slow", { output: Todo }),
			);
			yield* Effect.yieldNow;
			expect(mock.requests).toHaveLength(1);
			expect(wire(mock).signal.aborted).toBe(false);
			yield* Fiber.interrupt(fiber);
			expect(wire(mock).signal.aborted).toBe(true);
		}),
	);
});

describe("httpClient", () => {
	const raw = (path: string, headers?: Record<string, string>) =>
		HttpClientRequest.get(path, headers === undefined ? {} : { headers });

	it.effect("adds the base URL and default headers to a raw request", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				headers: { "X-Client": "web", "X-Other": "default" },
			});
			yield* api.httpClient.execute(raw("/todos", { "x-other": "own" }));
			expect(wire(mock).url).toBe("https://api.test/todos");
			expect(wire(mock).headers).toMatchObject({
				"x-client": "web",
				"x-other": "own",
			});
		}),
	);

	it.effect("leaves an absolute URL alone", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]);
			yield* api.httpClient.execute(raw("https://other.test/x"));
			expect(wire(mock).url).toBe("https://other.test/x");
		}),
	);

	it.effect("does no status check and no decoding", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.text("<p>oops</p>", {
					status: 500,
					headers: { "content-type": "text/html" },
				}),
			]);
			const response = yield* api.httpClient.execute(raw("/todos"));
			expect(response.status).toBe(500);
			expect(yield* response.text).toBe("<p>oops</p>");
		}),
	);

	it.effect("fails with a NetworkError on a transport failure", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([failure()]);
			const error = yield* Effect.flip(
				api.httpClient.execute(raw("/todos")),
			);
			expect(error).toBeInstanceOf(Fetch.NetworkError);
		}),
	);
});

describe("concurrent calls", () => {
	it.effect("don't interfere", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup((request: RecordedRequest) =>
				reply.json({
					id: Number(request.url.split("/").pop()),
					title: "x",
				}),
			);
			const todos = yield* Effect.all(
				[1, 2, 3].map((id) =>
					api.get("/todos/:id", { params: { id }, output: Todo }),
				),
				{ concurrency: "unbounded" },
			);
			expect(todos.map((todo) => todo.id)).toEqual([1, 2, 3]);
			expect(mock.requests).toHaveLength(3);
		}),
	);
});
