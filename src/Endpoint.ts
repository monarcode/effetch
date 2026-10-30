import type * as Effect from "effect/Effect";
import type * as Headers from "effect/http/Headers";
import type * as HttpMethod from "effect/http/HttpMethod";

import type { DecodeError, HttpError, NetworkError } from "./Errors.js";
import type {
	AnySchema,
	ParamsOption,
	QueryInput,
	QueryOf,
	Success,
} from "./Options.js";
import type { Plugin } from "./Plugin.js";

/**
 * The routes `endpoint` accepts: an uppercase HTTP method, one space, then
 * a path that starts with `/` or an absolute `http://` or `https://` URL.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const route: Fetch.EndpointRoute = "GET /users/:id";
 * const absolute: Fetch.EndpointRoute = "POST https://uploads.example.com/files";
 * ```
 *
 * @since 0.1.0
 */
export type EndpointRoute =
	| `${HttpMethod.HttpMethod} /${string}`
	| `${HttpMethod.HttpMethod} http://${string}`
	| `${HttpMethod.HttpMethod} https://${string}`;

/**
 * The type of `endpoint`'s route argument: `R` itself when it's an
 * {@link EndpointRoute}, otherwise the list of `"<METHOD> /"` starts.
 *
 * A misspelled route is then a type error that shows what to write (`"GET
 * /" | "POST /" | …`), and editors suggest the methods as you type.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type Ok = Fetch.ValidRoute<"GET /users/:id">;
 * //   ^? "GET /users/:id"
 * type Typo = Fetch.ValidRoute<"GTE /users">;
 * //   ^? "GET /" | "POST /" | "PUT /" | …
 * ```
 *
 * @since 0.1.0
 */
export type ValidRoute<R extends string> = R extends EndpointRoute
	? R
	: `${HttpMethod.HttpMethod} /`;

/**
 * The HTTP method of route `R` (`"GET /users/:id"` gives `"GET"`).
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type Method = Fetch.RouteMethod<"PATCH /users/:id">;
 * //   ^? "PATCH"
 * ```
 *
 * @since 0.1.0
 */
export type RouteMethod<R extends string> =
	R extends `${infer M extends HttpMethod.HttpMethod} ${string}` ? M : never;

/**
 * The path of route `R`, everything after the method and the space
 * (`"GET /users/:id"` gives `"/users/:id"`).
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type Path = Fetch.RoutePath<"GET /users/:id">;
 * //   ^? "/users/:id"
 * ```
 *
 * @since 0.1.0
 */
export type RoutePath<R extends string> =
	R extends `${HttpMethod.HttpMethod} ${infer P}` ? P : never;

/** True when route `R`'s method never carries a body (Effect's `NoBody`). */
type NoBodyRoute<R extends string> = [RouteMethod<R>] extends [
	HttpMethod.HttpMethod.NoBody,
]
	? true
	: false;

/**
 * What an endpoint is defined with, besides its route. Everything is
 * optional.
 *
 * - `output`: decodes the 2xx JSON body. Without it, the endpoint succeeds
 *   with the raw `HttpClientResponse`.
 * - `error`: decodes non-2xx bodies into `HttpError.body`, replacing the
 *   client's `defaultError`.
 * - `input`: encodes `body` before it's sent as JSON, and makes `body`
 *   required on every call. Not allowed on `GET`, `HEAD`, `OPTIONS` and
 *   `TRACE` endpoints, which take no body.
 * - `headers`: sent with every call, over the client's headers. A call's
 *   own header of the same name wins. Unlike the client's headers, these
 *   can set `content-type`.
 * - `plugins`: per-plugin overrides for every call, as in a call's
 *   `plugins` option. A call's own override for a plugin wins, and when
 *   both give options, they're merged.
 *
 * - `R`: the route, for the method and the path.
 * - `O`, `EB`, `I`: the `output`, `error` and `input` schemas (`O` and `I`
 *   are `undefined` when absent).
 * - `Ps`: the client's plugins.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const Credentials = Schema.Struct({ user: Schema.String, password: Schema.String });
 * const Session = Schema.Struct({ token: Schema.String });
 *
 * const login: Fetch.EndpointDefinition<
 *   "POST /auth/login",
 *   typeof Session,
 *   Schema.Unknown,
 *   typeof Credentials,
 *   [Fetch.Plugin<"bearer">]
 * > = {
 *   input: Credentials,
 *   output: Session,
 *   headers: { "x-client": "web" },
 *   plugins: { bearer: false },
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface EndpointDefinition<
	R extends string,
	O extends AnySchema | undefined,
	EB extends AnySchema,
	I extends AnySchema | undefined,
	Ps extends ReadonlyArray<Plugin.Any>,
> {
	/** Decodes the 2xx JSON body. Without it, calls return the raw response. */
	readonly output?: O;
	/** Decodes non-2xx bodies into `HttpError.body`. Overrides the client's. */
	readonly error?: EB | undefined;
	/** Encodes `body` as JSON, and makes `body` required on every call. */
	readonly input?: NoBodyRoute<R> extends true ? undefined : I;
	/** Headers for every call, over the client's. A call's own header wins. */
	readonly headers?: Headers.Input | undefined;
	/** Plugin overrides for every call. A call's own override wins. */
	readonly plugins?: Plugin.Overrides<Ps> | undefined;
}

/**
 * The `body` option of an endpoint call: not allowed on `GET`, `HEAD`,
 * `OPTIONS` and `TRACE` endpoints, required and typed by the schema when
 * the endpoint has an `input`, and optional otherwise (sent according to
 * its runtime type, like a call's `body`).
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const NewTodo = Schema.Struct({ title: Schema.String });
 *
 * const body: Fetch.EndpointBody<"POST /todos", typeof NewTodo> = {
 *   body: { title: "Write docs" },
 * };
 * const none: Fetch.EndpointBody<"GET /todos", undefined> = {};
 * ```
 *
 * @since 0.1.0
 */
export type EndpointBody<R extends string, I extends AnySchema | undefined> =
	NoBodyRoute<R> extends true
		? { readonly body?: undefined }
		: [I] extends [AnySchema]
			? { readonly body: I["Type"] }
			: { readonly body?: unknown };

/**
 * The options of one endpoint call: `params` for the route's path (see
 * {@link ParamsOption}), `body` (see {@link EndpointBody}), `query`,
 * `headers` and `plugins`. The schemas are fixed by the endpoint.
 *
 * - `Q`: the type of `query`, checked with {@link QueryOf}. Defaults to
 *   {@link QueryInput}.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const options: Fetch.EndpointOptions<"GET /orgs/:org/users", undefined, []> = {
 *   params: { org: "acme" },
 *   query: { page: 2 },
 *   headers: { "x-trace": "1" },
 * };
 * ```
 *
 * @since 0.1.0
 */
export type EndpointOptions<
	R extends string,
	I extends AnySchema | undefined,
	Ps extends ReadonlyArray<Plugin.Any>,
	Q extends QueryOf<Q> = QueryInput,
> = ParamsOption<RoutePath<R>> &
	EndpointBody<R, I> & {
		readonly query?: Q | undefined;
		readonly headers?: Headers.Input | undefined;
		readonly plugins?: Plugin.Overrides<Ps> | undefined;
	};

/**
 * The arguments of an endpoint call: the options object `T` is required
 * when route `R` has path params or the endpoint has an `input` schema,
 * and optional otherwise.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type One = Fetch.EndpointArgs<"GET /todos/:id", undefined, { params: { id: number } }>;
 * //   ^? [options: { params: { id: number } }]
 * type All = Fetch.EndpointArgs<"GET /todos", undefined, {}>;
 * //   ^? [options?: {}]
 * ```
 *
 * @since 0.1.0
 */
export type EndpointArgs<R extends string, I extends AnySchema | undefined, T> =
	Partial<Requirements<R, I>> extends Requirements<R, I>
		? [options?: T]
		: [options: T];

/** The options that can be required: `params` and `body`. */
type Requirements<
	R extends string,
	I extends AnySchema | undefined,
> = ParamsOption<RoutePath<R>> & EndpointBody<R, I>;

/**
 * An endpoint made by `client.endpoint`: a function that sends its request
 * with the options of one call, and returns the same Effect as the
 * equivalent client method.
 *
 * It also carries its `route`, `method` and `path`, for things like log
 * labels and cache keys.
 *
 * - `R`: the route, such as `"GET /users/:id"`.
 * - `O`, `EB`, `I`: the `output`, `error` and `input` schemas (`O` and `I`
 *   are `undefined` when absent).
 * - `Ps`: the client's plugins.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
 *
 * const users = (api: Fetch.Client) => {
 *   const getUser = api.endpoint("GET /users/:id", { output: User });
 *   getUser.route; // "GET /users/:id"
 *   return getUser({ params: { id: 1 } });
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface Endpoint<
	R extends string,
	O extends AnySchema | undefined,
	EB extends AnySchema,
	I extends AnySchema | undefined,
	Ps extends ReadonlyArray<Plugin.Any>,
> {
	<Q extends QueryOf<Q> = QueryInput>(
		...args: EndpointArgs<R, I, EndpointOptions<R, I, Ps, Q>>
	): Effect.Effect<
		Success<O>,
		// CallError and CallServices, written out (see CallEffect)
		| NetworkError
		| HttpError.With<EB["Type"]>
		| (O extends AnySchema ? DecodeError : never)
		| Plugin.Errors<Ps>,
		| (O extends AnySchema ? O["DecodingServices"] : never)
		| EB["DecodingServices"]
		| (I extends AnySchema ? I["EncodingServices"] : never)
	>;
	/** The route the endpoint was defined with, such as `"GET /users/:id"`. */
	readonly route: R;
	/** The route's HTTP method, such as `"GET"`. */
	readonly method: RouteMethod<R>;
	/** The route's path, with its `:params` unfilled, such as `"/users/:id"`. */
	readonly path: RoutePath<R>;
}

/**
 * The signature of `client.endpoint`: defines an {@link Endpoint} from a
 * route and an {@link EndpointDefinition}.
 *
 * - `Ps`: the client's plugins.
 * - `DefaultEB`: the client's `defaultError` schema, used when the
 *   endpoint has no `error`.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * declare const endpoint: Fetch.EndpointMethod<[], Schema.Unknown>;
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const getTodo = endpoint("GET /todos/:id", { output: Todo });
 * ```
 *
 * @since 0.1.0
 */
export interface EndpointMethod<
	Ps extends ReadonlyArray<Plugin.Any>,
	DefaultEB extends AnySchema,
> {
	<
		const R extends string,
		O extends AnySchema | undefined = undefined,
		EB extends AnySchema = DefaultEB,
		I extends AnySchema | undefined = undefined,
	>(
		route: ValidRoute<R>,
		definition?: EndpointDefinition<R, O, EB, I, Ps>,
	): Endpoint<R, O, EB, I, Ps>;
}
