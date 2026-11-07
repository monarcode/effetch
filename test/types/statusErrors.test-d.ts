// Type tests build Effects only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

import { describe, expectTypeOf, it } from "vitest";

import { type Client, make } from "../../src/Client.js";
import { endpoint as define } from "../../src/Endpoint.js";
import type {
	BindMethod,
	Endpoint,
	EndpointMethod,
	UnboundEndpoint,
} from "../../src/Endpoint.js";
import type { DecodeError, HttpError, NetworkError } from "../../src/Errors.js";
import type {
	AnySchema,
	BodyMethod,
	CallEffect,
	CallError,
	CallServices,
	NoBodyMethod,
	RequestMethod,
	StatusError,
	StatusErrorMap,
	StatusErrorSchema,
	StatusErrorServices,
	Success,
} from "../../src/Options.js";

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
	message: Schema.String,
}) {}
class InvalidRole extends Schema.TaggedError<InvalidRole>()("InvalidRole", {
	code: Schema.Literal("INVALID_ROLE"),
	message: Schema.String,
}) {}
class RoleTaken extends Schema.TaggedError<RoleTaken>()("RoleTaken", {
	code: Schema.Literal("ROLE_TAKEN"),
	takenBy: Schema.Finite,
}) {}
class SessionExpired extends Schema.TaggedError<SessionExpired>()(
	"SessionExpired",
	{ message: Schema.String },
) {}

class Locale extends Context.Service<Locale, { readonly tag: string }>()(
	"Locale",
) {}
class Localized extends Schema.TaggedError<Localized>()("Localized", {
	message: Schema.String.pipe(
		Schema.decode({
			decode: SchemaGetter.transformEffect((s: string) =>
				Effect.map(Effect.service(Locale), (l) => `${l.tag}:${s}`),
			),
			encode: SchemaGetter.passthrough(),
		}),
	),
}) {}

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const ApiError = Schema.Struct({ code: Schema.String });

type Todo = typeof Todo.Type;
type ApiError = typeof ApiError.Type;
type Ps = [];

/** effetch's own errors for a call with an `output`. */
type Own = NetworkError | DecodeError | HttpError.With<ApiError>;

type Session = { readonly 401: typeof SessionExpired };
declare const get: NoBodyMethod<Ps, typeof ApiError, Session>;
declare const post: BodyMethod<Ps, typeof ApiError, Session>;
declare const request: RequestMethod<Ps, typeof ApiError, Session>;
declare const endpoint: EndpointMethod<Ps, typeof ApiError, Session>;
declare const bind: BindMethod<Ps, typeof ApiError, Session>;
declare const bare: NoBodyMethod<Ps, typeof ApiError>;

describe("StatusErrorMap", () => {
	it("takes a schema or a list of schemas per status", () => {
		expectTypeOf({
			404: TodoNotFound,
			400: [InvalidRole, RoleTaken],
		}).toExtend<StatusErrorMap>();
		// @ts-expect-error not a schema
		bare("/x", { statusErrors: { 404: "TodoNotFound" } });
	});
});

describe("StatusError", () => {
	it("is the union of the schemas' types", () => {
		expectTypeOf<
			StatusError<{ 404: typeof TodoNotFound; 400: [typeof InvalidRole] }>
		>().toEqualTypeOf<TodoNotFound | InvalidRole>();
	});

	it("takes a union of maps", () => {
		expectTypeOf<
			StatusError<{ 404: typeof TodoNotFound } | Session | undefined>
		>().toEqualTypeOf<TodoNotFound | SessionExpired>();
	});

	it("is never without a map", () => {
		expectTypeOf<StatusError<undefined>>().toBeNever();
		expectTypeOf<StatusError<{}>>().toBeNever();
		expectTypeOf<StatusErrorServices<undefined>>().toBeNever();
	});

	it("has services of its own", () => {
		expectTypeOf<
			StatusErrorServices<{ 404: typeof Localized } | Session>
		>().toEqualTypeOf<Locale>();
	});
});

describe("a call", () => {
	it("fails with its own, then the client's errors", () => {
		const call = get("/todos/:id", {
			params: { id: 1 },
			output: Todo,
			statusErrors: { 404: TodoNotFound },
		});
		expectTypeOf(call).toEqualTypeOf<
			Effect.Effect<Todo, Own | TodoNotFound | SessionExpired, never>
		>();
	});

	it("keeps the client's errors without its own", () => {
		const call = get("/x", { output: Todo });
		expectTypeOf<Effect.Error<typeof call>>().toEqualTypeOf<
			Own | SessionExpired
		>();
	});

	it("is unchanged without any map", () => {
		const call = bare("/x", { output: Todo });
		expectTypeOf(call).toEqualTypeOf<Effect.Effect<Todo, Own, never>>();
		const explicit = bare("/x", { output: Todo, statusErrors: undefined });
		expectTypeOf(explicit).toEqualTypeOf<Effect.Effect<Todo, Own, never>>();
	});

	it("works on every method", () => {
		const posted = post("/x", {
			body: {},
			statusErrors: { 400: [InvalidRole, RoleTaken] },
		});
		expectTypeOf<Effect.Error<typeof posted>>().toEqualTypeOf<
			| NetworkError
			| HttpError.With<ApiError>
			| InvalidRole
			| RoleTaken
			| SessionExpired
		>();
		const requested = request("PATCH", "/x", {
			statusErrors: { 404: TodoNotFound },
		});
		expectTypeOf<Effect.Error<typeof requested>>().toEqualTypeOf<
			NetworkError | HttpError.With<ApiError> | TodoNotFound | SessionExpired
		>();
	});

	it("narrows literal fields by tag", () => {
		const call = post("/x", {
			body: {},
			statusErrors: { 400: [InvalidRole, RoleTaken] },
		}).pipe(
			Effect.catchTag("InvalidRole", (error) => {
				expectTypeOf(error.code).toEqualTypeOf<"INVALID_ROLE">();
				return Effect.succeed(error.message);
			}),
		);
		expectTypeOf<Effect.Error<typeof call>>().toEqualTypeOf<
			NetworkError | HttpError.With<ApiError> | RoleTaken | SessionExpired
		>();
	});

	it("requires the services of its errors' schemas", () => {
		const call = get("/x", { statusErrors: { 404: Localized } });
		expectTypeOf<Effect.Services<typeof call>>().toEqualTypeOf<Locale>();
	});

	it("matches CallEffect, CallError and CallServices exactly", () => {
		type Map = { readonly 404: typeof Localized };
		const call = get("/x", {
			output: Todo,
			statusErrors: { 404: Localized } as Map,
		});
		expectTypeOf(call).toEqualTypeOf<
			Effect.Effect<
				Todo,
				CallError<typeof Todo, typeof ApiError, Ps, Map | Session>,
				CallServices<typeof Todo, typeof ApiError, undefined, Map | Session>
			>
		>();
		expectTypeOf(call).toEqualTypeOf<
			CallEffect<
				typeof Todo,
				typeof ApiError,
				Schema.Unknown,
				Ps,
				Map | Session
			>
		>();
	});

	it("matches the aliases on post and request too", () => {
		type Map = {
			readonly 400: readonly [typeof Localized, typeof RoleTaken];
		};
		const statusErrors: Map = { 400: [Localized, RoleTaken] };
		const posted = post("/x", { body: {}, output: Todo, statusErrors });
		expectTypeOf(posted).toEqualTypeOf<
			CallEffect<
				typeof Todo,
				typeof ApiError,
				Schema.Unknown,
				Ps,
				Map | Session
			>
		>();
		const requested = request("PATCH", "/x", { output: Todo, statusErrors });
		expectTypeOf(requested).toEqualTypeOf<
			CallEffect<
				typeof Todo,
				typeof ApiError,
				Schema.Unknown,
				Ps,
				Map | Session
			>
		>();
		expectTypeOf<Effect.Services<typeof requested>>().toEqualTypeOf<Locale>();
	});

	it("ignores keys that aren't statuses", () => {
		const call = bare("/x", { statusErrors: { notFound: TodoNotFound } });
		expectTypeOf<Effect.Error<typeof call>>().toEqualTypeOf<
			NetworkError | HttpError.With<ApiError>
		>();
		expectTypeOf<
			StatusError<{ "404": typeof TodoNotFound }>
		>().toEqualTypeOf<TodoNotFound>();
	});

	it("fits CallEffect in generic code", () => {
		const getAs = <
			O extends AnySchema,
			SE extends StatusErrorMap | undefined,
		>(
			method: NoBodyMethod<Ps, typeof ApiError, SE>,
			output: O,
		): CallEffect<O, typeof ApiError, Schema.Unknown, Ps, SE> =>
			method("/x", { output });
		expectTypeOf(getAs).toBeFunction();
	});
});

describe("an endpoint", () => {
	it("fails with its own, then the client's errors", () => {
		const getTodo = endpoint("GET /todos/:id", {
			output: Todo,
			statusErrors: { 404: TodoNotFound },
		});
		expectTypeOf(getTodo).toEqualTypeOf<
			Endpoint<
				"GET /todos/:id",
				typeof Todo,
				typeof ApiError,
				undefined,
				Ps,
				{ 404: typeof TodoNotFound } | Session
			>
		>();
		const call = getTodo({ params: { id: 1 } });
		expectTypeOf(call).toEqualTypeOf<
			Effect.Effect<Todo, Own | TodoNotFound | SessionExpired, never>
		>();
	});

	it("is unchanged without any map", () => {
		const getTodo = (api: Client<Ps, typeof ApiError>) =>
			api.endpoint("GET /todos/:id", { output: Todo });
		expectTypeOf<ReturnType<typeof getTodo>>().toEqualTypeOf<
			Endpoint<"GET /todos/:id", typeof Todo, typeof ApiError, undefined, Ps>
		>();
	});

	it("exposes the joined map as lists of its schemas", () => {
		const getTodo = endpoint("GET /todos/:id", {
			statusErrors: { 404: TodoNotFound },
		});
		expectTypeOf(getTodo.statusErrors).toEqualTypeOf<{
			readonly [status: number]: ReadonlyArray<
				typeof TodoNotFound | typeof SessionExpired
			>;
		}>();
	});

	it("rejects a per-call map", () => {
		const getTodo = endpoint("GET /todos/:id", { output: Todo });
		// @ts-expect-error the schemas are fixed by the endpoint
		getTodo({ params: { id: 1 }, statusErrors: { 404: TodoNotFound } });
	});

	it("can't be used as an endpoint without its errors", () => {
		const getTodo = endpoint("GET /todos/:id", {
			statusErrors: { 404: TodoNotFound },
		});
		expectTypeOf(getTodo).not.toExtend<
			Endpoint<"GET /todos/:id", undefined, typeof ApiError, undefined, Ps>
		>();
	});

	it("matches CallEffect, CallError and CallServices exactly", () => {
		type Map = { readonly 404: typeof Localized };
		const call = endpoint("GET /x", {
			output: Todo,
			statusErrors: { 404: Localized } as Map,
		})();
		expectTypeOf(call).toEqualTypeOf<
			Effect.Effect<
				Todo,
				CallError<typeof Todo, typeof ApiError, Ps, Map | Session>,
				CallServices<typeof Todo, typeof ApiError, undefined, Map | Session>
			>
		>();
		expectTypeOf(call).toEqualTypeOf<
			CallEffect<typeof Todo, typeof ApiError, undefined, Ps, Map | Session>
		>();
	});
});

describe("a definition", () => {
	const getTodo = define("GET /todos/:id", {
		output: Todo,
		statusErrors: { 404: TodoNotFound },
	});

	it("keeps its map's type", () => {
		expectTypeOf(getTodo).toEqualTypeOf<
			UnboundEndpoint<
				"GET /todos/:id",
				typeof Todo,
				undefined,
				undefined,
				{ 404: typeof TodoNotFound }
			>
		>();
		expectTypeOf(getTodo.statusErrors).toEqualTypeOf<{
			404: typeof TodoNotFound;
		}>();
		expectTypeOf(define("GET /x").statusErrors).toEqualTypeOf<undefined>();
	});

	it("fails, once bound, with its own, then the client's errors", () => {
		const call = bind(getTodo)({ params: { id: 1 } });
		expectTypeOf(call).toEqualTypeOf<
			Effect.Effect<Todo, Own | TodoNotFound | SessionExpired, never>
		>();
		expectTypeOf(call).toEqualTypeOf<
			CallEffect<
				typeof Todo,
				typeof ApiError,
				undefined,
				Ps,
				{ 404: typeof TodoNotFound } | Session
			>
		>();
		const plain = bind(define("GET /todos/:id", { output: Todo }))({
			params: { id: 1 },
		});
		expectTypeOf(plain).toEqualTypeOf<
			Effect.Effect<Todo, Own | SessionExpired, never>
		>();
	});
});

describe("StatusErrorSchema", () => {
	it("is the union of the schemas, under status keys only", () => {
		expectTypeOf<
			StatusErrorSchema<{
				404: typeof TodoNotFound;
				400: [typeof InvalidRole, typeof RoleTaken];
				other: typeof SessionExpired;
			}>
		>().toEqualTypeOf<
			typeof TodoNotFound | typeof InvalidRole | typeof RoleTaken
		>();
		expectTypeOf<StatusErrorSchema<undefined>>().toBeNever();
	});
});

describe("make", () => {
	it("infers the client's map", () => {
		const client = make({
			defaultError: ApiError,
			statusErrors: { 401: SessionExpired },
		});
		expectTypeOf<Effect.Success<typeof client>>().toEqualTypeOf<
			Client<[], typeof ApiError, { 401: typeof SessionExpired }>
		>();
	});

	it("is unchanged without one", () => {
		const client = make({ defaultError: ApiError });
		expectTypeOf<Effect.Success<typeof client>>().toEqualTypeOf<
			Client<[], typeof ApiError>
		>();
		const explicit = make({
			defaultError: ApiError,
			statusErrors: undefined,
		});
		expectTypeOf<Effect.Success<typeof explicit>>().toEqualTypeOf<
			Client<[], typeof ApiError>
		>();
	});

	it("exposes the client's map", () => {
		const statusErrors = (api: Client<Ps, typeof ApiError, Session>) =>
			api.statusErrors;
		expectTypeOf<ReturnType<typeof statusErrors>>().toEqualTypeOf<Session>();
		const none = (api: Client<Ps, typeof ApiError>) => api.statusErrors;
		expectTypeOf<ReturnType<typeof none>>().toEqualTypeOf<undefined>();
	});

	it("can't be used as a client without its errors", () => {
		expectTypeOf<Client<Ps, typeof ApiError, Session>>().not.toExtend<
			Client<Ps, typeof ApiError>
		>();
	});

	it("gives the client's errors to every call", () => {
		const call = (api: Client<Ps, typeof ApiError, Session>) =>
			api.get("/x", { output: Todo });
		expectTypeOf<Effect.Error<ReturnType<typeof call>>>().toEqualTypeOf<
			Own | SessionExpired
		>();
		const success: Success<typeof Todo> = { id: 1, title: "x" };
		expectTypeOf(success).toEqualTypeOf<Todo>();
	});
});
