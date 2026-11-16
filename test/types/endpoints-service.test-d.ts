// Type tests build Effects only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";

import { describe, expectTypeOf, it } from "vitest";

import * as Fetch from "../../src/index.js";
import { FetchTest } from "../../src/test/index.js";

const ApiError = Schema.Struct({ code: Schema.String });
const OtherError = Schema.Struct({ reason: Schema.String });
const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const NewTodo = Schema.Struct({ title: Schema.String });

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}
class Expired extends Schema.TaggedError<Expired>()("Expired", {}) {}
class Session extends Context.Service<Session, string>()("Session") {}
class TokenError extends Data.TaggedError("TokenError")<{}> {}

declare const token: Effect.Effect<string, TokenError, Session>;

const bearer = Fetch.plugin({
	name: "bearer",
	onRequest: (request) =>
		Effect.map(token, (value) =>
			HttpClientRequest.bearerToken(request, value),
		),
});

const listTodos = Fetch.endpoint("GET /todos", {
	output: Schema.Array(Todo),
});
const getTodo = Fetch.endpoint("GET /todos/:id", {
	output: Todo,
	statusErrors: { 404: NotFound },
});
const createTodo = Fetch.endpoint("POST /todos", {
	input: NewTodo,
	output: Todo,
	error: OtherError,
});

class Api extends Fetch.Service<Api>()("Api", {
	defaultError: ApiError,
	statusErrors: { 401: Expired },
	plugins: [bearer],
}) {}

type ApiPs = readonly [typeof bearer];
type ApiSE = { 401: typeof Expired };

class TodoApi extends Fetch.Endpoints<TodoApi>()("TodoApi", Api, {
	list: listTodos,
	get: getTodo,
	create: [createTodo, { plugins: { bearer: false } }],
}) {}

declare const api: Effect.Success<typeof Api>;

describe("Fetch.Endpoints", () => {
	it("gives each endpoint the type bind gives it", () => {
		const todos = Effect.map(TodoApi, (service) => service);
		type Todos = Effect.Success<typeof todos>;
		expectTypeOf<Todos["list"]>().toEqualTypeOf<
			ReturnType<
				typeof api.bind<
					"GET /todos",
					typeof listTodos.output,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined
				>
			>
		>();
		expectTypeOf<Todos["get"]>().toEqualTypeOf<
			Fetch.Endpoint<
				"GET /todos/:id",
				typeof Todo,
				typeof ApiError,
				undefined,
				ApiPs,
				{ 404: typeof NotFound } | ApiSE
			>
		>();
		expectTypeOf<Todos["create"]>().toEqualTypeOf<
			Fetch.Endpoint<
				"POST /todos",
				typeof Todo,
				typeof OtherError,
				typeof NewTodo,
				ApiPs,
				undefined | ApiSE
			>
		>();
	});

	it("is a key for the endpoints, and its layer needs the client", () => {
		expectTypeOf(TodoApi.layer).toEqualTypeOf<
			Layer.Layer<TodoApi, never, Api>
		>();
		expectTypeOf(TodoApi).toExtend<
			Fetch.EndpointsClass<
				TodoApi,
				"TodoApi",
				Api,
				typeof TodoApi.definitions,
				ApiPs,
				typeof ApiError,
				ApiSE
			>
		>();
		const program = Effect.gen(function* () {
			const todos = yield* TodoApi;
			return yield* todos.get({ params: { id: 1 } });
		});
		expectTypeOf<Effect.Services<typeof program>>().toEqualTypeOf<TodoApi>();
		expectTypeOf<NotFound>().toExtend<Effect.Error<typeof program>>();
		expectTypeOf<Expired>().toExtend<Effect.Error<typeof program>>();
		expectTypeOf<TokenError>().toExtend<Effect.Error<typeof program>>();
	});

	it("keeps the definitions' types", () => {
		expectTypeOf(TodoApi.definitions.list).toEqualTypeOf<typeof listTodos>();
		expectTypeOf(TodoApi.definitions.create[0]).toEqualTypeOf<
			typeof createTodo
		>();
	});

	it("checks calls against each endpoint", () => {
		Effect.gen(function* () {
			const todos = yield* TodoApi;
			// @ts-expect-error the :id path param is required
			yield* todos.get({});
			// @ts-expect-error the body is required with an input
			yield* todos.create();
			// @ts-expect-error there is no such endpoint
			yield* todos.remove();
		});
	});

	it("checks a pair's options against the client's plugins", () => {
		class Typo extends Fetch.Endpoints<Typo>()("Typo", Api, {
			// @ts-expect-error no plugin is called "bearr"
			list: [listTodos, { plugins: { bearr: false } }],
		}) {}
		expectTypeOf(Typo).toBeObject();
	});

	it("rejects what isn't a definition", () => {
		// @ts-expect-error a route string isn't a definition
		Fetch.Endpoints<Bad>()("Bad", Api, { list: "GET /todos" });
		interface Bad {
			readonly _: unique symbol;
		}
	});

	it("works with a client written by hand", () => {
		const makeHand = Fetch.make({ defaultError: ApiError });
		class Hand extends Context.Service<
			Hand,
			Effect.Success<typeof makeHand>
		>()("Hand") {}
		class HandTodos extends Fetch.Endpoints<HandTodos>()("HandTodos", Hand, {
			get: getTodo,
		}) {}
		expectTypeOf(HandTodos.layer).toEqualTypeOf<
			Layer.Layer<HandTodos, never, Hand>
		>();
		const program = Effect.flatMap(HandTodos, (todos) =>
			todos.get({ params: { id: 1 } }),
		);
		expectTypeOf<NotFound>().toExtend<Effect.Error<typeof program>>();
		expectTypeOf<Expired>().not.toExtend<Effect.Error<typeof program>>();
	});
});

describe("client.bindAll", () => {
	it("returns BoundEndpoints, equal to bind one by one", () => {
		const all = api.bindAll({ list: listTodos, get: getTodo });
		expectTypeOf(all.get).toEqualTypeOf(api.bind(getTodo));
		expectTypeOf(all.list).toEqualTypeOf(api.bind(listTodos));
		expectTypeOf(all).toEqualTypeOf<
			Fetch.BoundEndpoints<
				{ readonly list: typeof listTodos; readonly get: typeof getTodo },
				ApiPs,
				typeof ApiError,
				ApiSE
			>
		>();
	});

	it("checks a pair's options exactly, as bind does", () => {
		api.bindAll({
			// @ts-expect-error there's no "plugns" option
			x: [listTodos, { headers: {}, plugns: { bearer: false } }],
		});
		api.bindAll({
			// @ts-expect-error no plugin is called "retyr"
			x: [listTodos, { plugins: { bearer: false, retyr: false } }],
		});
		// @ts-expect-error no plugin is called "retyr"
		api.bind(listTodos, { plugins: { bearer: false, retyr: false } });
	});

	it("takes a record typed with an interface", () => {
		interface Definitions {
			readonly list: typeof listTodos;
			readonly get: typeof getTodo;
		}
		const definitions: Definitions = { list: listTodos, get: getTodo };
		const all = api.bindAll(definitions);
		expectTypeOf(all.get).toEqualTypeOf(api.bind(getTodo));
	});

	it("leaves symbol keys out of the result", () => {
		const hidden: unique symbol = Symbol("hidden");
		const all = api.bindAll({ [hidden]: listTodos, list: listTodos });
		expectTypeOf<keyof typeof all>().toEqualTypeOf<"list">();
	});

	it("binds pairs with their options", () => {
		const all = api.bindAll({
			create: [createTodo, { plugins: { bearer: false } }],
		});
		expectTypeOf(all.create).toEqualTypeOf(
			api.bind(createTodo, { plugins: { bearer: false } }),
		);
		// @ts-expect-error bearer can only be turned off
		api.bindAll({ create: [createTodo, { plugins: { bearer: { x: 1 } } }] });
	});

	it("is unchanged for bind and endpoint", () => {
		expectTypeOf(api.bind).toEqualTypeOf<
			Fetch.BindMethod<ApiPs, typeof ApiError, ApiSE>
		>();
		expectTypeOf(api.bindAll).toEqualTypeOf<
			Fetch.BindAllMethod<ApiPs, typeof ApiError, ApiSE>
		>();
	});
});

describe("inline definitions", () => {
	// An inline `Fetch.endpoint(…)` inside a pair used to take its unset
	// `stream` and `responseMode` from the surrounding type, so it was typed
	// as a stream endpoint.
	class InlineApi extends Fetch.Endpoints<InlineApi>()("InlineApi", Api, {
		create: [
			Fetch.endpoint("POST /todos", { input: NewTodo, output: Todo }),
			{ plugins: { bearer: false } },
		],
		list: Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) }),
		events: [
			Fetch.endpoint("GET /events", { output: Todo, stream: "sse" }),
			{ plugins: { bearer: false } },
		],
		page: [
			Fetch.endpoint("GET /page", {
				output: Todo,
				responseMode: "decoded-and-response",
			}),
			{},
		],
	}) {}

	it("types a pair's inline definition as a hoisted one", () => {
		const createInline = Fetch.endpoint("POST /todos", {
			input: NewTodo,
			output: Todo,
		});
		const program = Effect.gen(function* () {
			const inline = yield* InlineApi;
			expectTypeOf(inline.create).toEqualTypeOf(
				api.bind(createInline, { plugins: { bearer: false } }),
			);
			expectTypeOf(inline.list).toEqualTypeOf(
				api.bind(
					Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) }),
				),
			);
		});
		void program;
	});

	it("keeps a given stream format and response mode", () => {
		const events = Fetch.endpoint("GET /events", {
			output: Todo,
			stream: "sse",
		});
		const page = Fetch.endpoint("GET /page", {
			output: Todo,
			responseMode: "decoded-and-response",
		});
		const program = Effect.gen(function* () {
			const inline = yield* InlineApi;
			expectTypeOf(inline.events).toEqualTypeOf(
				api.bind(events, { plugins: { bearer: false } }),
			);
			expectTypeOf(inline.page).toEqualTypeOf(api.bind(page, {}));
		});
		void program;
	});

	it("types every other definition shape as a hoisted one", () => {
		class Shapes extends Fetch.Endpoints<Shapes>()("Shapes", Api, {
			bare: [Fetch.endpoint("DELETE /todos/:id"), {}],
			typed: [
				Fetch.endpoint("GET /todos/:id", {
					query: Schema.Struct({ full: Schema.optional(Schema.Boolean) }),
					output: Todo,
					error: OtherError,
					statusErrors: { 404: NotFound },
				}),
				{ plugins: { bearer: false } },
			],
		}) {}
		const bare = Fetch.endpoint("DELETE /todos/:id");
		const typed = Fetch.endpoint("GET /todos/:id", {
			query: Schema.Struct({ full: Schema.optional(Schema.Boolean) }),
			output: Todo,
			error: OtherError,
			statusErrors: { 404: NotFound },
		});
		const program = Effect.gen(function* () {
			const shapes = yield* Shapes;
			expectTypeOf(shapes.bare).toEqualTypeOf(api.bind(bare, {}));
			expectTypeOf(shapes.typed).toEqualTypeOf(
				api.bind(typed, { plugins: { bearer: false } }),
			);
		});
		void program;
	});

	it("does the same with client.bindAll", () => {
		const all = api.bindAll({
			create: [
				Fetch.endpoint("POST /todos", { input: NewTodo, output: Todo }),
				{ plugins: { bearer: false } },
			],
		});
		const create = Fetch.endpoint("POST /todos", {
			input: NewTodo,
			output: Todo,
		});
		expectTypeOf(all.create).toEqualTypeOf(
			api.bind(create, { plugins: { bearer: false } }),
		);
	});

	it("takes nothing from a type the endpoint is checked against", () => {
		const fromEndpoint = {
			get: Fetch.endpoint("GET /todos/:id", { output: Todo }),
		} satisfies Record<string, Fetch.AnyUnboundEndpoint>;
		expectTypeOf(fromEndpoint.get.stream).toEqualTypeOf<undefined>();
		const fromClient = {
			get: api.endpoint("GET /todos/:id", { output: Todo }),
		} satisfies Record<string, FetchTest.TestEndpoint>;
		expectTypeOf(fromClient.get.stream).toEqualTypeOf<undefined>();
	});
});
