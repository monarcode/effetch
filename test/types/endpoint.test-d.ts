// Type tests build Effects only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

import { describe, expectTypeOf, it } from "vitest";

import type { Client } from "../../src/Client.js";
import { endpoint as define } from "../../src/Endpoint.js";
import type {
	BindMethod,
	Endpoint,
	EndpointArgs,
	EndpointMethod,
	EndpointRoute,
	RouteMethod,
	RoutePath,
	UnboundEndpoint,
	ValidRoute,
} from "../../src/Endpoint.js";
import type { DecodeError, HttpError, NetworkError } from "../../src/Errors.js";
import type {
	AnySchema,
	CallEffect,
	CallError,
	CallServices,
	Success,
} from "../../src/Options.js";
import type { Plugin } from "../../src/Plugin.js";

class TimeoutError extends Data.TaggedError("TimeoutError")<{}> {}

type Ps = [
	Plugin<"bearer">,
	Plugin<"retry", never, never, { times: number; methods: Array<string> }>,
	Plugin<"timeout", TimeoutError, never, { duration: string }>,
];

declare const endpoint: EndpointMethod<Ps, Schema.Unknown>;
declare const bind: BindMethod<Ps, Schema.Unknown>;

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });
const ApiError = Schema.Struct({ code: Schema.String });

type Todo = typeof Todo.Type;
type Response = HttpClientResponse.HttpClientResponse;

describe("route", () => {
	it("gives the endpoint its method and path", () => {
		const getTodo = endpoint("GET /todos/:id");
		expectTypeOf(getTodo.route).toEqualTypeOf<"GET /todos/:id">();
		expectTypeOf(getTodo.method).toEqualTypeOf<"GET">();
		expectTypeOf(getTodo.path).toEqualTypeOf<"/todos/:id">();
	});

	it("can be an absolute URL", () => {
		const upload = endpoint("POST https://uploads.test/files/:name");
		expectTypeOf(upload.method).toEqualTypeOf<"POST">();
		expectTypeOf(
			upload.path,
		).toEqualTypeOf<"https://uploads.test/files/:name">();
		upload({ params: { name: "a.txt" } });
	});

	it("accepts every HTTP method", () => {
		endpoint("PUT /x");
		endpoint("PATCH /x");
		endpoint("DELETE /x");
		endpoint("HEAD /x");
		endpoint("OPTIONS /x");
		endpoint("TRACE /x");
		endpoint("QUERY /x");
	});

	it("rejects malformed routes", () => {
		// @ts-expect-error misspelled method
		endpoint("GTE /todos");
		// @ts-expect-error lowercase method
		endpoint("get /todos");
		// @ts-expect-error no space
		endpoint("GET/todos");
		// @ts-expect-error two spaces
		endpoint("GET  /todos");
		// @ts-expect-error path doesn't start with "/"
		endpoint("GET todos");
		// @ts-expect-error no method
		endpoint("/todos");
		// @ts-expect-error empty
		endpoint("");
	});

	it("rejects strings that aren't literals", () => {
		const route: string = "GET /todos";
		// @ts-expect-error the route must be known statically
		endpoint(route);
	});

	it("keeps params of template literal segments", () => {
		const orgId: string = "acme";
		const getUser = endpoint(`GET /orgs/${orgId}/users/:id`);
		getUser({ params: { id: 1 } });
		// @ts-expect-error id is still required
		getUser({});
	});

	it("has helper types", () => {
		expectTypeOf<RouteMethod<"PATCH /a/:b">>().toEqualTypeOf<"PATCH">();
		expectTypeOf<RoutePath<"PATCH /a/:b">>().toEqualTypeOf<"/a/:b">();
		expectTypeOf<ValidRoute<"GET /a">>().toEqualTypeOf<"GET /a">();
		expectTypeOf<ValidRoute<"GTE /a">>().toEqualTypeOf<
			| "GET /"
			| "POST /"
			| "PUT /"
			| "DELETE /"
			| "PATCH /"
			| "HEAD /"
			| "OPTIONS /"
			| "TRACE /"
			| "QUERY /"
		>();
		expectTypeOf<"GET /a">().toExtend<EndpointRoute>();
		expectTypeOf<"GET a">().not.toExtend<EndpointRoute>();
	});
});

describe("schemas", () => {
	it("are the ones defined, or undefined", () => {
		const createTodo = endpoint("POST /todos", {
			input: NewTodo,
			output: Todo,
			error: ApiError,
		});
		expectTypeOf(createTodo.output).toEqualTypeOf<typeof Todo>();
		expectTypeOf(createTodo.error).toEqualTypeOf<typeof ApiError>();
		expectTypeOf(createTodo.input).toEqualTypeOf<typeof NewTodo>();
		const listTodos = endpoint("GET /todos");
		expectTypeOf(listTodos.output).toEqualTypeOf<undefined>();
		expectTypeOf(listTodos.input).toEqualTypeOf<undefined>();
	});

	it("give error the client's defaultError when the endpoint has none", () => {
		expectTypeOf(
			endpoint("GET /todos").error,
		).toEqualTypeOf<Schema.Unknown>();
		const withDefault = null as unknown as EndpointMethod<
			[],
			typeof ApiError
		>;
		expectTypeOf(withDefault("GET /todos").error).toEqualTypeOf<
			typeof ApiError
		>();
		expectTypeOf(
			withDefault("GET /todos", { error: NewTodo }).error,
		).toEqualTypeOf<typeof NewTodo>();
	});
});

describe("params", () => {
	const getTodo = endpoint("GET /todos/:id", { output: Todo });
	const listTodos = endpoint("GET /todos", { output: Schema.Array(Todo) });

	it("are required when the path has params", () => {
		getTodo({ params: { id: 1 } });
		getTodo({ params: { id: "abc" } });
		// @ts-expect-error missing options
		getTodo();
		// @ts-expect-error missing params
		getTodo({});
		// @ts-expect-error unknown param
		getTodo({ params: { id: 1, ID: 2 } });
		// @ts-expect-error booleans aren't path values
		getTodo({ params: { id: true } });
	});

	it("are forbidden when the path has none", () => {
		listTodos();
		listTodos({});
		// @ts-expect-error the path has no params
		listTodos({ params: { id: 1 } });
	});
});

describe("body", () => {
	it("is forbidden on methods without a body, as is input", () => {
		const list = endpoint("GET /todos");
		list({ body: undefined });
		// @ts-expect-error GET has no body
		list({ body: {} });
		// @ts-expect-error GET has no input
		endpoint("GET /todos", { input: NewTodo });
		// @ts-expect-error HEAD has no input
		endpoint("HEAD /todos", { input: NewTodo });
		// @ts-expect-error OPTIONS has no body
		endpoint("OPTIONS /todos")({ body: "x" });
		// @ts-expect-error TRACE has no body
		endpoint("TRACE /todos")({ body: "x" });
	});

	it("is required and typed with an input schema", () => {
		const create = endpoint("POST /todos", { input: NewTodo, output: Todo });
		create({ body: { title: "x", due: new Date() } });
		// @ts-expect-error body is required
		create();
		// @ts-expect-error body is required
		create({});
		// @ts-expect-error due must be a Date
		create({ body: { title: "x", due: "tomorrow" } });
	});

	it("is optional and untyped without an input schema", () => {
		const upload = endpoint("POST /upload");
		upload();
		upload({ body: new FormData() });
		upload({ body: { anything: true } });
	});

	it("works with params", () => {
		const replace = endpoint("PUT /todos/:id", { input: Todo, output: Todo });
		replace({ params: { id: 1 }, body: { id: 1, title: "x" } });
		// @ts-expect-error body is required
		replace({ params: { id: 1 } });
		// @ts-expect-error params are required
		replace({ body: { id: 1, title: "x" } });
	});

	it("is required by EndpointArgs only with params or input", () => {
		expectTypeOf<EndpointArgs<"GET /a", undefined, 1>>().toEqualTypeOf<
			[options?: 1]
		>();
		expectTypeOf<EndpointArgs<"GET /a/:b", undefined, 1>>().toEqualTypeOf<
			[options: 1]
		>();
		expectTypeOf<EndpointArgs<"POST /a", typeof Todo, 1>>().toEqualTypeOf<
			[options: 1]
		>();
		expectTypeOf<EndpointArgs<"POST /a", undefined, 1>>().toEqualTypeOf<
			[options?: 1]
		>();
	});
});

describe("call options", () => {
	const list = endpoint("GET /todos", { output: Schema.Array(Todo) });

	it("accept query and headers", () => {
		list({ query: { page: 1, tags: ["a", "b"], q: undefined } });
		list({ headers: { "x-trace": "1" } });
		// @ts-expect-error a Date isn't a query value
		list({ query: { when: new Date() } });
	});

	it("accept a query typed with an interface", () => {
		interface ListParams {
			readonly limit: number;
			readonly after?: string | undefined;
		}
		const query: ListParams = { limit: 5 };
		list({ query });
	});

	it("can't change the schemas", () => {
		// @ts-expect-error output is fixed by the endpoint
		list({ output: Todo });
		// @ts-expect-error error is fixed by the endpoint
		list({ error: ApiError });
		// @ts-expect-error input is fixed by the endpoint
		endpoint("POST /todos")({ input: NewTodo });
	});
});

describe("plugin overrides", () => {
	it("are typed from the client's plugins, in definitions and calls", () => {
		const login = endpoint("POST /login", { plugins: { bearer: false } });
		login({ plugins: { retry: { times: 0 }, timeout: { duration: "1s" } } });
		// @ts-expect-error unknown plugin name
		endpoint("POST /login", { plugins: { logger: false } });
		// @ts-expect-error bearer only accepts false
		endpoint("POST /login", { plugins: { bearer: {} } });
		// @ts-expect-error unknown plugin name
		login({ plugins: { logger: false } });
		// @ts-expect-error times is a number
		login({ plugins: { retry: { times: "0" } } });
	});
});

describe("return type", () => {
	it("is the raw response without output", () => {
		expectTypeOf(
			endpoint("DELETE /todos/:id")({ params: { id: 1 } }),
		).toEqualTypeOf<
			Effect.Effect<
				Response,
				NetworkError | HttpError.With<unknown> | TimeoutError,
				never
			>
		>();
	});

	it("is the decoded output, with DecodeError", () => {
		const getTodo = endpoint("GET /todos/:id", { output: Todo });
		expectTypeOf(getTodo({ params: { id: 1 } })).toEqualTypeOf<
			Effect.Effect<
				Todo,
				NetworkError | HttpError.With<unknown> | DecodeError | TimeoutError,
				never
			>
		>();
	});

	it("types HttpError.body with the endpoint's error schema", () => {
		const call = endpoint("GET /todos", { error: ApiError })();
		type E = Effect.Error<typeof call>;
		expectTypeOf<Extract<E, { _tag: "HttpError" }>["body"]>().toEqualTypeOf<
			{ readonly code: string } | undefined
		>();
	});

	it("uses the client's error schema by default", () => {
		const withDefault = null as unknown as EndpointMethod<
			[],
			typeof ApiError
		>;
		const call = withDefault("GET /todos")();
		type E = Effect.Error<typeof call>;
		expectTypeOf<Extract<E, { _tag: "HttpError" }>["body"]>().toEqualTypeOf<
			{ readonly code: string } | undefined
		>();
	});

	it("names the endpoint's type", () => {
		const getTodo = endpoint("GET /todos/:id", { output: Todo });
		expectTypeOf(getTodo).toEqualTypeOf<
			Endpoint<"GET /todos/:id", typeof Todo, Schema.Unknown, undefined, Ps>
		>();
	});

	it("fits CallEffect, CallError and CallServices in generic code", () => {
		const callAs = <O extends AnySchema, EB extends AnySchema>(
			getTodo: Endpoint<"GET /todos/:id", O, EB, undefined, Ps>,
		): Effect.Effect<
			Success<O>,
			CallError<O, EB, Ps>,
			CallServices<O, EB, undefined>
		> => getTodo({ params: { id: 1 } });
		const callAsEffect = <O extends AnySchema, EB extends AnySchema>(
			getTodo: Endpoint<"GET /todos/:id", O, EB, undefined, Ps>,
		): CallEffect<O, EB, undefined, Ps> => getTodo({ params: { id: 1 } });
		expectTypeOf(callAs).toBeFunction();
		expectTypeOf(callAsEffect).toBeFunction();
	});
});

describe("services", () => {
	class Locale extends Context.Service<Locale, { readonly tag: string }>()(
		"Locale",
	) {}
	const Localized = Schema.String.pipe(
		Schema.decode({
			decode: SchemaGetter.transformEffect((s: string) =>
				Effect.map(Effect.service(Locale), (l) => `${l.tag}:${s}`),
			),
			encode: SchemaGetter.passthrough(),
		}),
	);
	const LocalizedInput = Schema.String.pipe(
		Schema.decode({
			decode: SchemaGetter.passthrough(),
			encode: SchemaGetter.transformEffect((s: string) =>
				Effect.map(Effect.service(Locale), (l) => `${l.tag}:${s}`),
			),
		}),
	);

	it("are never for plain schemas", () => {
		const call = endpoint("POST /todos", { input: NewTodo, output: Todo })({
			body: { title: "x", due: new Date() },
		});
		expectTypeOf<Effect.Services<typeof call>>().toBeNever();
	});

	it("include the schemas' services", () => {
		const output = endpoint("GET /x", { output: Localized })();
		expectTypeOf<Effect.Services<typeof output>>().toEqualTypeOf<Locale>();
		const error = endpoint("GET /x", { error: Localized })();
		expectTypeOf<Effect.Services<typeof error>>().toEqualTypeOf<Locale>();
		const input = endpoint("POST /x", { input: LocalizedInput })({
			body: "x",
		});
		expectTypeOf<Effect.Services<typeof input>>().toEqualTypeOf<Locale>();
	});

	it("match CallEffect, CallError and CallServices exactly", () => {
		// The call signature writes these types out, so check they still agree.
		const fromOutput = endpoint("GET /x", {
			output: Localized,
			error: ApiError,
		})();
		expectTypeOf(fromOutput).toEqualTypeOf<
			Effect.Effect<
				Success<typeof Localized>,
				CallError<typeof Localized, typeof ApiError, Ps>,
				CallServices<typeof Localized, typeof ApiError, undefined>
			>
		>();
		expectTypeOf(fromOutput).toEqualTypeOf<
			CallEffect<typeof Localized, typeof ApiError, undefined, Ps>
		>();
		const fromError = endpoint("GET /x", {
			output: Todo,
			error: Localized,
		})();
		expectTypeOf(fromError).toEqualTypeOf<
			Effect.Effect<
				Todo,
				CallError<typeof Todo, typeof Localized, Ps>,
				CallServices<typeof Todo, typeof Localized, undefined>
			>
		>();
		const posted = endpoint("POST /x", {
			input: LocalizedInput,
			output: Todo,
		})({ body: "x" });
		expectTypeOf(posted).toEqualTypeOf<
			Effect.Effect<
				Todo,
				CallError<typeof Todo, Schema.Unknown, Ps>,
				CallServices<typeof Todo, Schema.Unknown, typeof LocalizedInput>
			>
		>();
		expectTypeOf(posted).toEqualTypeOf<
			CallEffect<typeof Todo, Schema.Unknown, typeof LocalizedInput, Ps>
		>();
	});
});

describe("on a client", () => {
	it("is available with the client's plugins and default error", () => {
		const getTodo = (api: Client<Ps, typeof ApiError>) =>
			api.endpoint("GET /todos/:id", {
				output: Todo,
				plugins: { retry: { times: 1 } },
			});
		type E = Effect.Error<ReturnType<ReturnType<typeof getTodo>>>;
		expectTypeOf<Extract<E, { _tag: "HttpError" }>["body"]>().toEqualTypeOf<
			{ readonly code: string } | undefined
		>();
		expectTypeOf<
			Extract<E, { _tag: "TimeoutError" }>
		>().toEqualTypeOf<TimeoutError>();
	});
});

describe("defined without a client", () => {
	const ApiErrorBind = null as unknown as BindMethod<Ps, typeof ApiError>;

	it("checks the route", () => {
		define("GET /todos/:id");
		define("POST https://uploads.test/files/:name");
		// @ts-expect-error misspelled method
		define("GTE /todos");
		// @ts-expect-error no space
		define("GET/todos");
		// @ts-expect-error path doesn't start with "/"
		define("GET todos");
		const route: string = "GET /todos";
		// @ts-expect-error the route must be known statically
		define(route);
	});

	it("carries its route, schemas and headers", () => {
		const updateTodo = define("PATCH /todos/:id", {
			input: NewTodo,
			output: Todo,
			headers: { "content-type": "application/merge-patch+json" },
		});
		expectTypeOf(updateTodo).toEqualTypeOf<
			UnboundEndpoint<
				"PATCH /todos/:id",
				typeof Todo,
				undefined,
				typeof NewTodo
			>
		>();
		expectTypeOf(updateTodo.method).toEqualTypeOf<"PATCH">();
		expectTypeOf(updateTodo.path).toEqualTypeOf<"/todos/:id">();
		const listTodos = define("GET /todos");
		expectTypeOf(listTodos).toEqualTypeOf<
			UnboundEndpoint<"GET /todos", undefined, undefined, undefined>
		>();
	});

	it("rejects input on routes without a body, and plugin overrides", () => {
		// @ts-expect-error GET takes no input
		define("GET /todos", { input: NewTodo });
		// @ts-expect-error HEAD takes no input
		define("HEAD /todos", { input: NewTodo });
		// @ts-expect-error plugin overrides are given when binding
		define("GET /todos", { plugins: { bearer: false } });
	});

	it("binds to the endpoint client.endpoint makes", () => {
		expectTypeOf(
			bind(define("GET /todos/:id", { output: Todo })),
		).toEqualTypeOf(endpoint("GET /todos/:id", { output: Todo }));
		expectTypeOf(
			bind(
				define("POST /todos", {
					input: NewTodo,
					output: Todo,
					error: ApiError,
				}),
			),
		).toEqualTypeOf(
			endpoint("POST /todos", {
				input: NewTodo,
				output: Todo,
				error: ApiError,
			}),
		);
		expectTypeOf(bind(define("DELETE /todos/:id"))).toEqualTypeOf(
			endpoint("DELETE /todos/:id"),
		);
		expectTypeOf(
			bind(define("GET /todos/:id", { output: Todo })),
		).toEqualTypeOf<
			Endpoint<"GET /todos/:id", typeof Todo, Schema.Unknown, undefined, Ps>
		>();
	});

	it("needs params and body as client.endpoint's do", () => {
		const getTodo = bind(define("GET /todos/:id", { output: Todo }));
		getTodo({ params: { id: 1 } });
		// @ts-expect-error params are required
		getTodo();
		// @ts-expect-error GET takes no body
		getTodo({ params: { id: 1 }, body: {} });
		const createTodo = bind(define("POST /todos", { input: NewTodo }));
		createTodo({ body: { title: "x", due: new Date() } });
		// @ts-expect-error the body is required with an input
		createTodo();
		// @ts-expect-error the body is typed by the input
		createTodo({ body: { title: 1, due: new Date() } });
	});

	it("uses the client's default error unless it has its own", () => {
		const list = ApiErrorBind(define("GET /todos"));
		expectTypeOf(list.error).toEqualTypeOf<typeof ApiError>();
		type E = Effect.Error<ReturnType<typeof list>>;
		expectTypeOf<Extract<E, { _tag: "HttpError" }>["body"]>().toEqualTypeOf<
			{ readonly code: string } | undefined
		>();
		const own = ApiErrorBind(define("GET /todos", { error: NewTodo }));
		expectTypeOf(own.error).toEqualTypeOf<typeof NewTodo>();
	});

	it("takes plugin overrides when bound, typed from the client's plugins", () => {
		const login = bind(define("POST /login"), {
			headers: { "x-client": "web" },
			plugins: { bearer: false },
		});
		login({ plugins: { retry: { times: 0 }, timeout: { duration: "1s" } } });
		// @ts-expect-error unknown plugin name
		bind(define("POST /login"), { plugins: { logger: false } });
		// @ts-expect-error bearer only accepts false
		bind(define("POST /login"), { plugins: { bearer: {} } });
	});

	it("is available on a client, with its plugins and default error", () => {
		const getTodo = define("GET /todos/:id", { output: Todo });
		const bound = (api: Client<Ps, typeof ApiError>) =>
			api.bind(getTodo, { plugins: { retry: { times: 1 } } });
		expectTypeOf<ReturnType<typeof bound>>().toEqualTypeOf<
			Endpoint<"GET /todos/:id", typeof Todo, typeof ApiError, undefined, Ps>
		>();
	});
});
