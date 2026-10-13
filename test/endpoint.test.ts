import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import * as Fetch from "../src/index.js";
import { mergeOverrides } from "../src/internal/plugins.js";
import { base, setup, wire } from "./utils/client.js";
import type { RecordedRequest } from "./utils/mockClient.js";
import { reply } from "./utils/reply.js";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });
const ApiError = Schema.Struct({ code: Schema.String });

const todo = { id: 1, title: "Write docs" };

/** What was sent, without the tracing headers, which differ per request. */
const sent = ({ method, url, headers, body }: RecordedRequest) => ({
	method,
	url,
	headers: Object.fromEntries(
		Object.entries(headers).filter(
			([name]) => name !== "traceparent" && name !== "b3",
		),
	),
	body,
});

/** Sets `x-a` and `x-b` from its options, so tests can see them. */
const flags = Fetch.plugin({
	name: "flags",
	defaults: { a: "1", b: "2" },
	onRequest: (request, ctx) =>
		Effect.succeed(
			HttpClientRequest.setHeaders(request, {
				"x-a": ctx.options.a,
				"x-b": ctx.options.b,
			}),
		),
});

/** Sets `x-tag`, and has no options: calls can only skip it. */
const tag = Fetch.plugin({
	name: "tag",
	onRequest: (request) =>
		Effect.succeed(HttpClientRequest.setHeader(request, "x-tag", "yes")),
});

describe("calls", () => {
	it.effect("send what the equivalent method sends", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json(todo)]);
			const getTodo = api.endpoint("GET /todos/:id", { output: Todo });
			const viaEndpoint = yield* getTodo({
				params: { id: 1 },
				query: { expand: "owner" },
				headers: { "x-trace": "1" },
			});
			const viaMethod = yield* api.get("/todos/:id", {
				params: { id: 1 },
				query: { expand: "owner" },
				headers: { "x-trace": "1" },
				output: Todo,
			});
			expect(viaEndpoint).toEqual(todo);
			expect(viaMethod).toEqual(todo);
			expect(sent(wire(mock, 0))).toEqual(sent(wire(mock, 1)));
			expect(wire(mock, 0)).toMatchObject({
				method: "GET",
				url: `${base}/todos/1?expand=owner`,
			});
		}),
	);

	it.effect("encode the body with the input schema", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json(todo)]);
			const create = api.endpoint("POST /todos", {
				input: NewTodo,
				output: Todo,
			});
			const due = new Date("2026-01-02T03:04:05.000Z");
			yield* create({ body: { title: "Write docs", due } });
			expect(wire(mock)).toMatchObject({
				method: "POST",
				url: `${base}/todos`,
				body: JSON.stringify({
					title: "Write docs",
					due: "2026-01-02T03:04:05.000Z",
				}),
			});
			expect(wire(mock).headers["content-type"]).toBe("application/json");
		}),
	);

	it.effect("send a body by its type without an input schema", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.empty()]);
			const note = api.endpoint("PUT /notes/:id");
			yield* note({ params: { id: "a b" }, body: "hello" });
			expect(wire(mock)).toMatchObject({
				method: "PUT",
				url: `${base}/notes/a%20b`,
				body: "hello",
			});
			expect(wire(mock).headers["content-type"]).toBe("text/plain");
		}),
	);

	it.effect("succeed with the raw response without output", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.empty(204)]);
			const remove = api.endpoint("DELETE /todos/:id");
			const response = yield* remove({ params: { id: 1 } });
			expect(HttpClientResponse.TypeId in response).toBe(true);
			expect(response.status).toBe(204);
		}),
	);

	it.effect("take no arguments when there's nothing to pass", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json([todo])]);
			const list = api.endpoint("GET /todos", {
				output: Schema.Array(Todo),
			});
			expect(yield* list()).toEqual([todo]);
			expect(wire(mock).url).toBe(`${base}/todos`);
		}),
	);

	it.effect("send a new request every time", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json(todo)]);
			const getTodo = api.endpoint("GET /todos/:id", { output: Todo });
			yield* Effect.all(
				[getTodo({ params: { id: 1 } }), getTodo({ params: { id: 2 } })],
				{ concurrency: "unbounded" },
			);
			yield* getTodo({ params: { id: 3 } });
			expect(mock.requests.map((request) => request.url).sort()).toEqual([
				`${base}/todos/1`,
				`${base}/todos/2`,
				`${base}/todos/3`,
			]);
		}),
	);

	it.effect("use an absolute URL route as it is", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.empty()]);
			const upload = api.endpoint("POST https://uploads.test/files/:name");
			yield* upload({ params: { name: "a.txt" }, body: "x" });
			expect(wire(mock).url).toBe("https://uploads.test/files/a.txt");
		}),
	);
});

describe("errors", () => {
	it.effect("decode error bodies with the endpoint's error schema", () =>
		Effect.gen(function* () {
			const { api } = yield* setup(
				[reply.json({ code: "gone" }, { status: 404 })],
				{ defaultError: Schema.Struct({ other: Schema.String }) },
			);
			const getTodo = api.endpoint("GET /todos/:id", {
				output: Todo,
				error: ApiError,
			});
			const error = yield* Effect.flip(getTodo({ params: { id: 1 } }));
			expect(error).toBeInstanceOf(Fetch.HttpError);
			expect(error).toMatchObject({ status: 404, body: { code: "gone" } });
		}),
	);

	it.effect("fall back to the client's default error schema", () =>
		Effect.gen(function* () {
			const { api } = yield* setup(
				[reply.json({ code: "gone" }, { status: 404 })],
				{ defaultError: ApiError },
			);
			const getTodo = api.endpoint("GET /todos/:id", { output: Todo });
			const error = yield* Effect.flip(getTodo({ params: { id: 1 } }));
			expect(error).toMatchObject({ status: 404, body: { code: "gone" } });
		}),
	);

	it.effect("fail with DecodeError when output doesn't match", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.json({ id: "one" })]);
			const getTodo = api.endpoint("GET /todos/:id", { output: Todo });
			const error = yield* Effect.flip(getTodo({ params: { id: 1 } }));
			expect(error).toBeInstanceOf(Fetch.DecodeError);
		}),
	);
});

describe("headers", () => {
	it.effect("are sent over the client's, and a call's win", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				headers: { "x-client": "client", "x-shared": "client" },
			});
			const list = api.endpoint("GET /todos", {
				headers: { "X-Shared": "endpoint", "x-endpoint": "endpoint" },
			});
			yield* list();
			yield* list({ headers: { "x-shared": "call", "X-Endpoint": "call" } });
			expect(wire(mock, 0).headers).toMatchObject({
				"x-client": "client",
				"x-shared": "endpoint",
				"x-endpoint": "endpoint",
			});
			expect(wire(mock, 1).headers).toMatchObject({
				"x-client": "client",
				"x-shared": "call",
				"x-endpoint": "call",
			});
		}),
	);

	it.effect("can set the content type, over the body's", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]);
			const patch = api.endpoint("PATCH /todos/:id", {
				headers: { "content-type": "application/merge-patch+json" },
			});
			yield* patch({ params: { id: 1 }, body: { done: true } });
			expect(wire(mock).headers["content-type"]).toBe(
				"application/merge-patch+json",
			);
		}),
	);

	it.effect("ask for JSON with an output, unless they set accept", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json(todo)]);
			yield* api.endpoint("GET /todos/:id", { output: Todo })({
				params: { id: 1 },
			});
			yield* api.endpoint("GET /todos/:id", {
				output: Todo,
				headers: { accept: "application/vnd.api+json" },
			})({ params: { id: 1 } });
			expect(wire(mock, 0).headers["accept"]).toBe("application/json");
			expect(wire(mock, 1).headers["accept"]).toBe(
				"application/vnd.api+json",
			);
		}),
	);
});

describe("plugin overrides", () => {
	it.effect("apply to every call of the endpoint", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [flags, tag],
			});
			const login = api.endpoint("POST /login", {
				plugins: { tag: false, flags: { a: "endpoint" } },
			});
			yield* login();
			yield* api.post("/other");
			expect(wire(mock, 0).headers["x-tag"]).toBeUndefined();
			expect(wire(mock, 0).headers).toMatchObject({
				"x-a": "endpoint",
				"x-b": "2",
			});
			expect(wire(mock, 1).headers).toMatchObject({
				"x-tag": "yes",
				"x-a": "1",
			});
		}),
	);

	it.effect("merge with a call's, whose options win", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [flags],
			});
			const list = api.endpoint("GET /todos", {
				plugins: { flags: { a: "endpoint", b: "endpoint" } },
			});
			const withUndefined = { a: "call", b: undefined } as {
				readonly a: string;
			};
			yield* list({ plugins: { flags: { b: "call" } } });
			yield* list({ plugins: { flags: withUndefined } });
			expect(wire(mock, 0).headers).toMatchObject({
				"x-a": "endpoint",
				"x-b": "call",
			});
			expect(wire(mock, 1).headers).toMatchObject({
				"x-a": "call",
				"x-b": "endpoint",
			});
		}),
	);

	it.effect("let a call skip a plugin, or turn it back on", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})], {
				plugins: [flags],
			});
			const configured = api.endpoint("GET /a", {
				plugins: { flags: { a: "endpoint" } },
			});
			const skipped = api.endpoint("GET /b", { plugins: { flags: false } });
			yield* configured({ plugins: { flags: false } });
			yield* skipped({ plugins: { flags: { b: "call" } } });
			expect(wire(mock, 0).headers["x-a"]).toBeUndefined();
			expect(wire(mock, 1).headers).toMatchObject({
				"x-a": "1",
				"x-b": "call",
			});
		}),
	);

	it("are merged per plugin name, as own keys only", () => {
		const endpoint = JSON.parse('{"__proto__": false, "a": {"x": 1}}');
		const merged = mergeOverrides(endpoint, { a: { y: 2 } });
		expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
		expect(Object.hasOwn(merged ?? {}, "__proto__")).toBe(true);
		expect(merged).toMatchObject({ a: { x: 1, y: 2 } });
		expect(mergeOverrides(undefined, { a: false })).toEqual({ a: false });
		expect(mergeOverrides({ a: false }, undefined)).toEqual({ a: false });
	});
});

describe("the endpoint", () => {
	it.effect("carries its route, method and path", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.json({})]);
			const getUser = api.endpoint("GET /users/:id");
			expect(getUser.route).toBe("GET /users/:id");
			expect(getUser.method).toBe("GET");
			expect(getUser.path).toBe("/users/:id");
		}),
	);

	it.effect("keeps its schemas, whatever a call passes", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.json(todo)]);
			const raw = api.endpoint("GET /todos/:id") as unknown as (
				options: object,
			) => Effect.Effect<unknown, unknown>;
			const response = yield* raw({ params: { id: 1 }, output: Todo });
			expect(response).toHaveProperty([HttpClientResponse.TypeId]);
		}),
	);

	it.effect.each([
		"get /todos",
		"GTE /todos",
		"GET/todos",
		"GET  /todos",
		"GET todos",
		"/todos",
		"",
		42,
	])("throws for the invalid route %j", (route) =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.json({})]);
			expect(() => api.endpoint(route as "GET /")).toThrow(
				/^Invalid endpoint route .*: expected an uppercase HTTP method/,
			);
		}),
	);

	it.effect("dies on a body for a method without one, like api.get", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json({})]);
			const list = api.endpoint("GET /todos") as unknown as (
				options: object,
			) => Effect.Effect<unknown, unknown>;
			const exit = yield* Effect.exit(list({ body: { a: 1 } }));
			expect(Exit.hasDies(exit)).toBe(true);
			const defect = Exit.isFailure(exit)
				? Cause.squash(exit.cause)
				: undefined;
			expect((defect as Error).message).toBe(
				"A GET request can't have a body",
			);
			expect(mock.requests).toHaveLength(0);
		}),
	);
});
