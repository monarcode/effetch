import { it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import { Fetch } from "../src/index.js";
import { base, wire } from "./utils/client.js";
import { makeMockClient } from "./utils/mockClient.js";
import { reply } from "./utils/reply.js";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
	message: Schema.String,
}) {}

class SessionExpired extends Schema.TaggedError<SessionExpired>()(
	"SessionExpired",
	{ message: Schema.String },
) {}

const tag = Fetch.plugin({
	name: "tag",
	onRequest: (request) =>
		Effect.succeed(HttpClientRequest.setHeader(request, "x-tag", "1")),
});

const listTodos = Fetch.endpoint("GET /todos", {
	output: Schema.Array(Todo),
});
const getTodo = Fetch.endpoint("GET /todos/:id", {
	output: Todo,
	statusErrors: { 404: TodoNotFound },
});
const createTodo = Fetch.endpoint("POST /todos", {
	input: Schema.Struct({ title: Schema.String }),
	output: Todo,
});

class Api extends Fetch.Service<Api>()("test/endpoints/Api", {
	baseUrl: base,
	statusErrors: { 401: SessionExpired },
	plugins: [tag],
}) {}

class TodoApi extends Fetch.Endpoints<TodoApi>()(
	"test/endpoints/TodoApi",
	Api,
	{
		list: listTodos,
		get: getTodo,
		create: [
			createTodo,
			{ plugins: { tag: false }, headers: { "x-op": "c" } },
		],
	},
) {}

const withMock = (mock: ReturnType<typeof makeMockClient>) =>
	TodoApi.layer.pipe(Layer.provide(Api.layer), Layer.provide(mock.layer));

describe("Fetch.Endpoints", () => {
	it.effect("yields working endpoints through its layer", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([
				reply.json([{ id: 1, title: "Write" }]),
				reply.json({ id: 1, title: "Write" }),
			]);
			const [all, one] = yield* Effect.gen(function* () {
				const todos = yield* TodoApi;
				const all = yield* todos.list();
				const one = yield* todos.get({ params: { id: 1 } });
				return [all, one] as const;
			}).pipe(Effect.provide(withMock(mock)));
			expect(all).toEqual([{ id: 1, title: "Write" }]);
			expect(one).toEqual({ id: 1, title: "Write" });
			expect(wire(mock, 0).url).toBe(`${base}/todos`);
			expect(wire(mock, 1).url).toBe(`${base}/todos/1`);
			expect(wire(mock, 1).headers["x-tag"]).toBe("1");
		}),
	);

	it.effect("applies a pair's bind options to that endpoint only", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([
				reply.json({ id: 2, title: "New" }),
				reply.json([]),
			]);
			yield* Effect.gen(function* () {
				const todos = yield* TodoApi;
				yield* todos.create({ body: { title: "New" } });
				yield* todos.list();
			}).pipe(Effect.provide(withMock(mock)));
			expect(wire(mock, 0).headers["x-tag"]).toBeUndefined();
			expect(wire(mock, 0).headers["x-op"]).toBe("c");
			expect(wire(mock, 1).headers["x-tag"]).toBe("1");
			expect(wire(mock, 1).headers["x-op"]).toBeUndefined();
		}),
	);

	it.effect("fails with the endpoint's and the client's statusErrors", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([
				reply.json({ message: "No todo 9" }, { status: 404 }),
				reply.json({ message: "Expired" }, { status: 401 }),
			]);
			const [notFound, expired] = yield* Effect.gen(function* () {
				const todos = yield* TodoApi;
				const notFound = yield* Effect.flip(
					todos.get({ params: { id: 9 } }),
				);
				const expired = yield* Effect.flip(todos.list());
				return [notFound, expired] as const;
			}).pipe(Effect.provide(withMock(mock)));
			expect(notFound).toBeInstanceOf(TodoNotFound);
			expect(expired).toBeInstanceOf(SessionExpired);
		}),
	);

	it.effect("works with a client service written by hand", () =>
		Effect.gen(function* () {
			const makeHand = Fetch.make({ baseUrl: `${base}/hand` });
			class Hand extends Context.Service<
				Hand,
				Effect.Success<typeof makeHand>
			>()("test/endpoints/Hand") {}
			class HandTodos extends Fetch.Endpoints<HandTodos>()(
				"test/endpoints/HandTodos",
				Hand,
				{ get: getTodo },
			) {}
			const mock = makeMockClient([reply.json({ id: 3, title: "Hand" })]);
			const todo = yield* Effect.gen(function* () {
				const todos = yield* HandTodos;
				return yield* todos.get({ params: { id: 3 } });
			}).pipe(
				Effect.provide(
					HandTodos.layer.pipe(
						Layer.provide(Layer.effect(Hand)(makeHand)),
						Layer.provide(mock.layer),
					),
				),
			);
			expect(todo).toEqual({ id: 3, title: "Hand" });
			expect(wire(mock).url).toBe(`${base}/hand/todos/3`);
		}),
	);

	it.effect("binds once per layer graph", () =>
		Effect.gen(function* () {
			class A extends Context.Service<A, unknown>()("test/endpoints/A") {}
			class B extends Context.Service<B, unknown>()("test/endpoints/B") {}
			const mock = makeMockClient([]);
			const [a, b] = yield* Effect.all([A, B]).pipe(
				Effect.provide(
					Layer.mergeAll(
						Layer.effect(A)(TodoApi),
						Layer.effect(B)(TodoApi),
					).pipe(Layer.provide(withMock(mock))),
				),
			);
			expect(a).toBe(b);
		}),
	);

	describe("definitions", () => {
		it("hold what was given, frozen", () => {
			expect(TodoApi.definitions.list).toBe(listTodos);
			expect(TodoApi.definitions.get).toBe(getTodo);
			expect(TodoApi.definitions.create[0]).toBe(createTodo);
			expect(TodoApi.definitions.create[1]).toEqual({
				plugins: { tag: false },
				headers: { "x-op": "c" },
			});
			expect(Object.isFrozen(TodoApi.definitions)).toBe(true);
			expect(Object.isFrozen(TodoApi.definitions.create)).toBe(true);
			expect(Object.isFrozen(TodoApi.definitions.create[1])).toBe(true);
		});

		it.effect("are a copy: changing what was passed changes nothing", () =>
			Effect.gen(function* () {
				const definitions: Record<string, typeof listTodos> = {
					list: listTodos,
				};
				class Copied extends Fetch.Endpoints<Copied>()(
					"test/endpoints/Copied",
					Api,
					definitions,
				) {}
				definitions["extra"] = listTodos;
				expect(Object.keys(Copied.definitions)).toEqual(["list"]);
				const mock = makeMockClient([]);
				const todos = yield* Copied.pipe(
					Effect.provide(
						Copied.layer.pipe(
							Layer.provide(Api.layer),
							Layer.provide(mock.layer),
						),
					),
				);
				expect(Object.keys(todos)).toEqual(["list"]);
			}),
		);
	});
});

describe("Fetch.Endpoints, checked when declared", () => {
	it("throws for an entry that isn't a definition", () => {
		expect(
			() =>
				class Bad extends Fetch.Endpoints<Bad>()(
					"test/endpoints/Bad",
					Api,
					{
						list: "GET /todos",
					} as never,
				) {},
		).toThrow(/"list" isn't an endpoint definition/);
	});

	it.effect("copies a pair's options down to its overrides", () =>
		Effect.gen(function* () {
			const options = {
				plugins: { tag: false as false | undefined },
				headers: { authorization: "Bearer secret", "x-op": "c" },
			};
			class Copied extends Fetch.Endpoints<Copied>()(
				"test/endpoints/CopiedOptions",
				Api,
				{ create: [createTodo, options] },
			) {}
			options.plugins.tag = undefined;
			options.headers["x-op"] = "changed";

			const stored = Copied.definitions.create[1];
			expect(Object.isFrozen(stored.plugins)).toBe(true);
			expect(JSON.stringify(Copied.definitions)).not.toContain("secret");

			const mock = makeMockClient([reply.json({ id: 2, title: "New" })]);
			yield* Effect.gen(function* () {
				const todos = yield* Copied;
				yield* todos.create({ body: { title: "New" } });
			}).pipe(
				Effect.provide(
					Copied.layer.pipe(
						Layer.provide(Api.layer),
						Layer.provide(mock.layer),
					),
				),
			);
			expect(wire(mock).headers["x-tag"]).toBeUndefined();
			expect(wire(mock).headers["x-op"]).toBe("c");
		}),
	);
});

describe("client.bindAll", () => {
	it.effect("binds each entry as bind does, under its name", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([
				reply.json({ id: 1, title: "A" }),
				reply.json({ id: 1, title: "A" }),
			]);
			const api = yield* Fetch.make({ baseUrl: base, plugins: [tag] }).pipe(
				Effect.provide(mock.layer),
			);
			const all = api.bindAll({ get: getTodo, list: listTodos });
			const one = api.bind(getTodo);
			expect(Object.keys(all)).toEqual(["get", "list"]);
			expect(all.get.route).toBe(one.route);
			expect(all.get.output).toBe(one.output);
			expect(all.get.statusErrors).toEqual(one.statusErrors);
			yield* all.get({ params: { id: 1 } });
			yield* one({ params: { id: 1 } });
			expect(wire(mock, 0)).toMatchObject({
				method: wire(mock, 1).method,
				url: wire(mock, 1).url,
			});
			expect(Object.isFrozen(all)).toBe(true);
		}),
	);

	it.effect("treats null options as none", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([reply.json({ id: 1, title: "A" })]);
			const api = yield* Fetch.make({ baseUrl: base, plugins: [tag] }).pipe(
				Effect.provide(mock.layer),
			);
			const all = api.bindAll({ get: [getTodo, null] } as never) as {
				readonly get: typeof one;
			};
			const one = api.bind(getTodo);
			yield* all.get({ params: { id: 1 } });
			expect(wire(mock).headers["x-tag"]).toBe("1");
		}),
	);

	it.effect("keeps a name such as __proto__ as its own key", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([]);
			const api = yield* Fetch.make({ baseUrl: base }).pipe(
				Effect.provide(mock.layer),
			);
			const all = api.bindAll({ ["__proto__"]: getTodo, get: getTodo });
			expect(Object.keys(all)).toEqual(["__proto__", "get"]);
			expect(Object.getPrototypeOf(all)).toBe(Object.prototype);
		}),
	);

	it.effect("leaves out symbol keys, as its type does", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([]);
			const api = yield* Fetch.make({ baseUrl: base }).pipe(
				Effect.provide(mock.layer),
			);
			const hidden = Symbol("hidden");
			const all = api.bindAll({ [hidden]: getTodo, get: getTodo });
			expect(Reflect.ownKeys(all)).toEqual(["get"]);
		}),
	);

	it.effect("bind throws for an endpoint that's already bound", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([]);
			const api = yield* Fetch.make({ baseUrl: base }).pipe(
				Effect.provide(mock.layer),
			);
			const bound = api.bind(getTodo);
			expect(() => api.bind(bound as never)).toThrow(
				/^bind takes an endpoint definition/,
			);
		}),
	);

	it.effect("binds an empty record", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([]);
			const api = yield* Fetch.make({ baseUrl: base }).pipe(
				Effect.provide(mock.layer),
			);
			expect(api.bindAll({})).toEqual({});
		}),
	);

	it.effect.each([
		["a bound endpoint", "bound"],
		["a plain object", { route: 1 }],
		["a pair holding something else", [{}, {}]],
		["a pair with options that aren't an object", ["x", 1]],
		["a pair of three", [getTodo, {}, {}]],
	] as const)("throws for %s", ([, value]) =>
		Effect.gen(function* () {
			const mock = makeMockClient([]);
			const api = yield* Fetch.make({ baseUrl: base }).pipe(
				Effect.provide(mock.layer),
			);
			const entry = value === "bound" ? api.bind(getTodo) : value;
			expect(() => api.bindAll({ bad: entry } as never)).toThrow(
				/"bad" isn't an endpoint definition/,
			);
		}),
	);
});
