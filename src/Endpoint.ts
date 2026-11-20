import type * as Effect from "effect/Effect";
import type * as Headers from "effect/http/Headers";
import type * as HttpMethod from "effect/http/HttpMethod";
import type * as Stream from "effect/Stream";

import type { DecodeError, HttpError, NetworkError } from "./Errors.js";
import {
	makeUnboundEndpoint,
	type RuntimeUnboundDefinition,
} from "./internal/endpoint.js";
import type {
	AnySchema,
	ParamsOption,
	QueryInput,
	QueryOf,
	QuerySchema,
	ResponseMode,
	StatusError,
	StatusErrorMap,
	StatusErrorSchema,
	StatusErrorServices,
	Success,
} from "./Options.js";
import type { BytesSchema } from "./Output.js";
import type { Plugin } from "./Plugin.js";
import type { StreamElement, StreamFormat } from "./Streams.js";

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

/**
 * What a definition with `stream` can't have, as defining it throws: a
 * `responseMode`, or a `Fetch.bytes()` output.
 */
type StreamDefinitionCheck<O, St> = [St] extends [StreamFormat]
	? {
			/** A stream gives the body's values: it can't take a `responseMode`. */
			readonly responseMode?: undefined;
		} & ([O] extends [BytesSchema]
			? {
					/** `Fetch.bytes()` can't decode a stream's values. */
					readonly output?: never;
				}
			: {})
	: {};

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
 * - `output`: decodes the 2xx body, read as JSON, or as text or bytes with
 *   `Fetch.text()` and `Fetch.bytes()`. Without it, the endpoint succeeds
 *   with the raw `HttpClientResponse`.
 * - `error`: decodes non-2xx bodies into `HttpError.body`, replacing the
 *   client's `defaultError`.
 * - `statusErrors`: turns error responses into your own errors, by status
 *   (see {@link StatusErrorMap}). Tried before the client's.
 * - `input`: encodes `body` before it's sent as JSON, and makes `body`
 *   required on every call. Not allowed on `GET`, `HEAD`, `OPTIONS` and
 *   `TRACE` endpoints, which take no body.
 * - `headers`: sent with every call, over the client's headers. A call's
 *   own header of the same name wins. Unlike the client's headers, these
 *   can set `content-type`.
 * - `plugins`: per-plugin overrides for every call, as in a call's
 *   `plugins` option. A call's own override for a plugin wins, and when
 *   both give options, they're merged.
 * - `responseMode`: what every call succeeds with (see
 *   {@link ResponseMode}). A call's own `responseMode` wins.
 * - `query`: a schema for the query parameters (see {@link QuerySchema}).
 *   Each call's `query` is then typed by it, and encoded with it.
 * - `stream`: `"sse"` or `"ndjson"` makes every call return a `Stream` of
 *   the body's values (see {@link StreamFormat}).
 *
 * - `R`: the route, for the method and the path.
 * - `O`, `EB`, `I`: the `output`, `error` and `input` schemas (`O` and `I`
 *   are `undefined` when absent).
 * - `Ps`: the client's plugins.
 * - `SE`: the `statusErrors` map, or `undefined` without one.
 * - `M`: the `responseMode`, or `undefined` without one.
 * - `QS`: the `query` schema, or `undefined` without one.
 * - `St`: the `stream` format, or `undefined` without one.
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
	SE extends StatusErrorMap | undefined = undefined,
	M extends ResponseMode | undefined = undefined,
	QS extends QuerySchema | undefined = undefined,
	St extends StreamFormat | undefined = undefined,
> {
	/** Decodes the 2xx body. Without it, calls return the raw response. */
	readonly output?: O;
	/** Decodes non-2xx bodies into `HttpError.body`. Overrides the client's. */
	readonly error?: EB | undefined;
	/** Your own errors for error responses, by status. Tried before the client's. */
	// No `| undefined`, unlike the other options: `SE` already allows it, and
	// with it `statusErrors: undefined` infers the constraint, which widens
	// the call's errors to `unknown`.
	readonly statusErrors?: SE;
	/**
	 * Encodes `body` with this schema, and makes `body` required on every
	 * call. Sent as JSON, or as `multipart/form-data` when the schema is
	 * wrapped in `Fetch.multipart`.
	 */
	readonly input?: NoBodyRoute<R> extends true ? undefined : I;
	/** Headers for every call, over the client's. A call's own header wins. */
	readonly headers?: Headers.Input | undefined;
	/** Plugin overrides for every call. A call's own override wins. */
	readonly plugins?: Plugin.Overrides<Ps> | undefined;
	/** What every call succeeds with. A call's own `responseMode` wins. */
	readonly responseMode?: M;
	/**
	 * Types and encodes each call's `query`, and makes it required when the
	 * schema has required fields. See {@link QuerySchema}.
	 */
	readonly query?: QS;
	/**
	 * Makes every call a `Stream` of the response body's values, as
	 * `api.sse` or `api.ndjson` gives them (see {@link StreamFormat} and
	 * {@link StreamElement}), with `output` decoding each value. Can't be
	 * used with `responseMode` or a `Fetch.bytes()` output: defining such
	 * an endpoint throws.
	 *
	 * @stability unstable: SSE is parsed with Effect's `encoding/Sse`,
	 * which Effect marks unstable.
	 */
	readonly stream?: St;
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
 * The `query` option of an endpoint call. With a `query` schema (see
 * {@link QuerySchema}), it's typed by the schema's `Type`, and required when
 * that has required fields. Without one, it's any {@link QueryInput}, typed
 * as `Q`.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const Page = Schema.Struct({ page: Schema.Finite });
 *
 * const typed: Fetch.EndpointQuery<typeof Page> = { query: { page: 2 } };
 * const plain: Fetch.EndpointQuery<undefined> = { query: { search: "docs" } };
 * ```
 *
 * @since 0.1.0
 */
export type EndpointQuery<
	QS extends QuerySchema | undefined,
	Q extends QueryOf<Q> = QueryInput,
> = [QS] extends [QuerySchema]
	? {} extends QS["Type"]
		? { readonly query?: QS["Type"] | undefined }
		: { readonly query: QS["Type"] }
	: { readonly query?: Q | undefined };

/**
 * The options of one endpoint call: `params` for the route's path (see
 * {@link ParamsOption}), `body` (see {@link EndpointBody}), `query`,
 * `headers`, `plugins` and `responseMode`. The schemas are fixed by the
 * endpoint.
 *
 * - `Q`: the type of `query` without a query schema, checked with
 *   {@link QueryOf}. Defaults to {@link QueryInput}.
 * - `M`: the call's {@link ResponseMode}, which wins over the endpoint's,
 *   or `undefined` without one.
 * - `QS`: the endpoint's `query` schema, which types `query` (see
 *   {@link EndpointQuery}), or `undefined` without one.
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
	M extends ResponseMode | undefined = undefined,
	QS extends QuerySchema | undefined = undefined,
> = ParamsOption<RoutePath<R>> &
	EndpointBody<R, I> &
	EndpointQuery<QS, Q> & {
		readonly headers?: Headers.Input | undefined;
		readonly plugins?: Plugin.Overrides<Ps> | undefined;
		readonly responseMode?: M;
	};

/**
 * The arguments of an endpoint call: the options object `T` is required
 * when route `R` has path params, the endpoint has an `input` schema, or
 * its `query` schema `QS` has required fields, and optional otherwise.
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
export type EndpointArgs<
	R extends string,
	I extends AnySchema | undefined,
	T,
	QS extends QuerySchema | undefined = undefined,
> =
	Partial<Requirements<R, I, QS>> extends Requirements<R, I, QS>
		? [options?: T]
		: [options: T];

/** The options that can be required: `params`, `body` and `query`. */
type Requirements<
	R extends string,
	I extends AnySchema | undefined,
	QS extends QuerySchema | undefined,
> = ParamsOption<RoutePath<R>> & EndpointBody<R, I> & EndpointQuery<QS>;

/**
 * What `endpoint.url` takes: `params` for the route's path (see
 * {@link ParamsOption}) and `query` (see {@link EndpointQuery}), as a call
 * takes them.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const options: Fetch.EndpointUrlOptions<"GET /files/:id", undefined> = {
 *   params: { id: "a1" },
 *   query: { download: 1 },
 * };
 * ```
 *
 * @since 0.1.0
 */
export type EndpointUrlOptions<
	R extends string,
	QS extends QuerySchema | undefined,
	Q extends QueryOf<Q> = QueryInput,
> = ParamsOption<RoutePath<R>> & EndpointQuery<QS, Q>;

/**
 * The arguments of `endpoint.url`: its {@link EndpointUrlOptions}, which
 * can be left out when nothing in them is required.
 *
 * A query schema whose encoding needs services can't be encoded by `url`,
 * which runs synchronously, so then `url` takes only a message saying so,
 * and no call to it compiles.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const args: Fetch.EndpointUrlArgs<"GET /files/:id", undefined> = [
 *   { params: { id: "a1" } },
 * ];
 * ```
 *
 * @since 0.1.0
 */
export type EndpointUrlArgs<
	R extends string,
	QS extends QuerySchema | undefined,
	Q extends QueryOf<Q> = QueryInput,
> = [QS extends AnySchema ? QS["EncodingServices"] : never] extends [never]
	? EndpointArgs<R, undefined, EndpointUrlOptions<R, QS, Q>, QS>
	: [
			unsupported: "endpoint.url can't encode a query schema whose encoding needs services",
		];

/**
 * An endpoint made by `client.endpoint` or `client.bind`: a function that
 * sends its request with the options of one call, and returns the same
 * Effect as the equivalent client method. With `stream`, it returns a
 * `Stream` of the body's values instead, as `api.sse` and `api.ndjson`
 * do. To page through a list endpoint, pass it to `Fetch.paginate`.
 *
 * It also carries its `route`, `method` and `path`, for things like log
 * labels and cache keys, and its `output`, `error`, `statusErrors` and
 * `input` schemas, for things like decoding cached data or building test
 * fixtures. `url(options)` gives the URL a call would send to.
 *
 * - `R`: the route, such as `"GET /users/:id"`.
 * - `O`, `EB`, `I`: the `output`, `error` and `input` schemas (`O` and `I`
 *   are `undefined` when absent).
 * - `Ps`: the client's plugins.
 * - `SE`: the `statusErrors` maps of the endpoint and the client, as a
 *   union, or `undefined` without any.
 * - `M`: the endpoint's {@link ResponseMode}, or `undefined` without one.
 *   A call's own `responseMode` wins.
 * - `QS`: the endpoint's `query` schema, or `undefined` without one.
 * - `St`: the endpoint's {@link StreamFormat}, or `undefined` without one.
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
 *   getUser.output; // User
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
	SE extends StatusErrorMap | undefined = undefined,
	M extends ResponseMode | undefined = undefined,
	QS extends QuerySchema | undefined = undefined,
	St extends StreamFormat | undefined = undefined,
> {
	<
		Q extends QueryOf<Q> = QueryInput,
		// A stream endpoint's calls can't take a responseMode.
		CM extends ([St] extends [StreamFormat]
			? undefined
			: ResponseMode | undefined) = undefined,
	>(
		...args: EndpointArgs<R, I, EndpointOptions<R, I, Ps, Q, CM, QS>, QS>
	): [St] extends [StreamFormat]
		? Stream.Stream<
				StreamElement<St, O>,
				// CallError and CallServices, written out (see CallEffect), with
				// DecodeError always: reading the stream can fail.
				| NetworkError
				| HttpError.With<EB["Type"]>
				| DecodeError
				| Plugin.Errors<Ps>
				| StatusError<SE>,
				| (O extends AnySchema ? O["DecodingServices"] : never)
				| EB["DecodingServices"]
				| (I extends AnySchema ? I["EncodingServices"] : never)
				| StatusErrorServices<SE>
				| (QS extends AnySchema ? QS["EncodingServices"] : never)
			>
		: Effect.Effect<
				// The call's mode, else the endpoint's.
				Success<O, NoInfer<CM extends undefined ? M : CM>>,
				// CallError and CallServices, written out (see CallEffect)
				| NetworkError
				| HttpError.With<EB["Type"]>
				| (O extends AnySchema ? DecodeError : never)
				| Plugin.Errors<Ps>
				| StatusError<SE>,
				| (O extends AnySchema ? O["DecodingServices"] : never)
				| EB["DecodingServices"]
				| (I extends AnySchema ? I["EncodingServices"] : never)
				| StatusErrorServices<SE>
				| (QS extends AnySchema ? QS["EncodingServices"] : never)
			>;
	/** The route the endpoint was defined with, such as `"GET /users/:id"`. */
	readonly route: R;
	/** The route's HTTP method, such as `"GET"`. */
	readonly method: RouteMethod<R>;
	/** The route's path, with its `:params` unfilled, such as `"/users/:id"`. */
	readonly path: RoutePath<R>;
	/** The schema the response is decoded with, or `undefined` without `output`. */
	readonly output: O;
	/**
	 * The schema `HttpError.body` is decoded with: the endpoint's `error`, or
	 * else the client's `defaultError`, or else `Schema.Unknown`.
	 */
	readonly error: EB;
	/**
	 * The schemas error responses are tried against, by status: for each
	 * status, the endpoint's `statusErrors`, then the client's, in the order
	 * they're tried. Empty when neither has any.
	 */
	readonly statusErrors: {
		readonly [status: number]: ReadonlyArray<StatusErrorSchema<SE>>;
	};
	/** The schema the body is encoded with, or `undefined` without `input`. */
	readonly input: I;
	/** What calls succeed with, or `undefined` for the decoded body alone. */
	readonly responseMode: M;
	/** The schema `query` is typed and encoded with, or `undefined` without one. */
	readonly query: QS;
	/**
	 * The {@link StreamFormat} calls stream the body in, or `undefined` for
	 * calls that return an `Effect`.
	 */
	readonly stream: St;
	/**
	 * Builds the URL a call with these `params` and `query` sends to,
	 * without sending anything: the client's `baseUrl`, the path with its
	 * params filled in, then the query string. Use it for links, `<img>`
	 * sources, downloads and cache keys.
	 *
	 * It's the URL before plugins run: a plugin that changes the request's
	 * URL isn't reflected. It throws when a param is missing, or the query
	 * doesn't match the `query` schema, as the call dies then. It can't be
	 * called when the query schema's encoding needs services (see
	 * {@link EndpointUrlArgs}).
	 */
	url<Q extends QueryOf<Q> = QueryInput>(
		...args: EndpointUrlArgs<R, QS, Q>
	): string;
}

/**
 * The signature of `client.endpoint`: defines an {@link Endpoint} from a
 * route and an {@link EndpointDefinition}.
 *
 * - `Ps`: the client's plugins.
 * - `DefaultEB`: the client's `defaultError` schema, used when the
 *   endpoint has no `error`.
 * - `ClientSE`: the client's `statusErrors` map, or `undefined` without one.
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
	ClientSE extends StatusErrorMap | undefined = undefined,
> {
	<
		const R extends string,
		O extends AnySchema | undefined = undefined,
		EB extends AnySchema = DefaultEB,
		I extends AnySchema | undefined = undefined,
		SE extends StatusErrorMap | undefined = undefined,
		M extends ResponseMode | undefined = undefined,
		QS extends QuerySchema | undefined = undefined,
		St extends StreamFormat | undefined = undefined,
	>(
		route: ValidRoute<R>,
		definition?: EndpointDefinition<R, O, EB, I, Ps, SE, M, QS, St> &
			StreamDefinitionCheck<O, St>,
		// `NoInfer`: as in `Fetch.endpoint`, the type parameters come from
		// `definition` alone, not from the type the endpoint is used as.
	): NoInfer<Endpoint<R, O, EB, I, Ps, SE | ClientSE, M, QS, St>>;
}

/**
 * What {@link endpoint} defines an endpoint with, besides its route: an
 * {@link EndpointDefinition} without `plugins`. Everything is optional.
 *
 * - `output`: decodes the 2xx body, read as JSON, or as text or bytes with
 *   `Fetch.text()` and `Fetch.bytes()`. Without it, the endpoint succeeds
 *   with the raw `HttpClientResponse`.
 * - `error`: decodes non-2xx bodies into `HttpError.body`. Without it, the
 *   endpoint uses the `defaultError` of the client it's bound to.
 * - `statusErrors`: turns error responses into your own errors, by status
 *   (see {@link StatusErrorMap}). Tried before those of the client it's
 *   bound to.
 * - `input`: encodes `body` before it's sent as JSON, and makes `body`
 *   required on every call. Not allowed on `GET`, `HEAD`, `OPTIONS` and
 *   `TRACE` endpoints, which take no body.
 * - `headers`: sent with every call, over the client's headers. Headers
 *   given when binding, then a call's own, win over them. Unlike the
 *   client's headers, these can set `content-type`.
 * - `responseMode`: what every call succeeds with (see
 *   {@link ResponseMode}). A call's own `responseMode` wins.
 * - `query`: a schema for the query parameters (see {@link QuerySchema}).
 *   Each call's `query` is then typed by it, and encoded with it.
 * - `stream`: `"sse"` or `"ndjson"` makes every call return a `Stream` of
 *   the body's values (see {@link StreamFormat}).
 *
 * Plugin overrides are given when binding, in {@link BindOptions}: a
 * definition doesn't know which plugins a client has.
 *
 * - `R`: the route, for the method and the path.
 * - `O`, `EB`, `I`: the `output`, `error` and `input` schemas (`undefined`
 *   when absent).
 * - `SE`: the `statusErrors` map, or `undefined` without one.
 * - `M`: the `responseMode`, or `undefined` without one.
 * - `QS`: the `query` schema, or `undefined` without one.
 * - `St`: the `stream` format, or `undefined` without one.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, done: Schema.Boolean });
 * const TodoPatch = Schema.Struct({ done: Schema.Boolean });
 *
 * const update: Fetch.UnboundDefinition<
 *   "PATCH /todos/:id",
 *   typeof Todo,
 *   undefined,
 *   typeof TodoPatch
 * > = {
 *   input: TodoPatch,
 *   output: Todo,
 *   headers: { "content-type": "application/merge-patch+json" },
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface UnboundDefinition<
	R extends string,
	O extends AnySchema | undefined,
	EB extends AnySchema | undefined,
	I extends AnySchema | undefined,
	SE extends StatusErrorMap | undefined = undefined,
	M extends ResponseMode | undefined = undefined,
	QS extends QuerySchema | undefined = undefined,
	St extends StreamFormat | undefined = undefined,
> {
	/** Decodes the 2xx body. Without it, calls return the raw response. */
	readonly output?: O;
	/** Decodes non-2xx bodies into `HttpError.body`. Without it, the client's `defaultError` does. */
	readonly error?: EB;
	/** Your own errors for error responses, by status. Tried before the client's. */
	// No `| undefined`, unlike the other options: `SE` already allows it, and
	// with it `statusErrors: undefined` infers the constraint, which widens
	// the call's errors to `unknown`.
	readonly statusErrors?: SE;
	/**
	 * Encodes `body` with this schema, and makes `body` required on every
	 * call. Sent as JSON, or as `multipart/form-data` when the schema is
	 * wrapped in `Fetch.multipart`.
	 */
	readonly input?: NoBodyRoute<R> extends true ? undefined : I;
	/** Headers for every call, over the client's. Binding and call headers win. */
	readonly headers?: Headers.Input | undefined;
	/** What every call succeeds with. A call's own `responseMode` wins. */
	readonly responseMode?: M;
	/**
	 * Types and encodes each call's `query`, and makes it required when the
	 * schema has required fields. See {@link QuerySchema}.
	 */
	readonly query?: QS;
	/**
	 * Makes every call a `Stream` of the response body's values, as
	 * `api.sse` or `api.ndjson` gives them (see {@link StreamFormat} and
	 * {@link StreamElement}), with `output` decoding each value. Can't be
	 * used with `responseMode` or a `Fetch.bytes()` output: defining such
	 * an endpoint throws.
	 *
	 * @stability unstable: SSE is parsed with Effect's `encoding/Sse`,
	 * which Effect marks unstable.
	 */
	readonly stream?: St;
}

/**
 * An endpoint defined without a client, by {@link endpoint}: its route,
 * schemas and headers, as plain data. `client.bind` turns it into an
 * {@link Endpoint} of that client, the same one `client.endpoint` makes
 * from the same route and definition.
 *
 * It needs no client, so it can be exported from module level next to its
 * schemas, read by code that has no client (cache keys, test fixtures,
 * tools), and bound to more than one client.
 *
 * - `R`: the route, such as `"GET /users/:id"`.
 * - `O`, `EB`, `I`: the `output`, `error` and `input` schemas (`undefined`
 *   when absent; without `error`, the bound endpoint uses the client's
 *   `defaultError`).
 * - `SE`: the `statusErrors` map, or `undefined` without one.
 * - `M`: the `responseMode`, or `undefined` without one.
 * - `QS`: the `query` schema, or `undefined` without one.
 * - `St`: the `stream` format, or `undefined` without one.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
 *
 * export const getUser = Fetch.endpoint("GET /users/:id", { output: User });
 * getUser.route; // "GET /users/:id"
 * getUser.output; // User
 *
 * const user = (api: Fetch.Client, id: number) =>
 *   api.bind(getUser)({ params: { id } });
 * ```
 *
 * @since 0.1.0
 */
export interface UnboundEndpoint<
	R extends string,
	O extends AnySchema | undefined,
	EB extends AnySchema | undefined,
	I extends AnySchema | undefined,
	SE extends StatusErrorMap | undefined = undefined,
	M extends ResponseMode | undefined = undefined,
	QS extends QuerySchema | undefined = undefined,
	St extends StreamFormat | undefined = undefined,
> {
	/** The route the endpoint was defined with, such as `"GET /users/:id"`. */
	readonly route: R;
	/** The route's HTTP method, such as `"GET"`. */
	readonly method: RouteMethod<R>;
	/** The route's path, with its `:params` unfilled, such as `"/users/:id"`. */
	readonly path: RoutePath<R>;
	/** The schema the response is decoded with, or `undefined` without `output`. */
	readonly output: O;
	/**
	 * The schema `HttpError.body` is decoded with, or `undefined` to use the
	 * `defaultError` of the client it's bound to.
	 */
	readonly error: EB;
	/**
	 * The `statusErrors` map, as given, or `undefined` without one. Once
	 * bound, the client's are tried after it.
	 */
	readonly statusErrors: SE;
	/** The schema the body is encoded with, or `undefined` without `input`. */
	readonly input: I;
	/** The headers sent with every call, or `undefined` without any. */
	readonly headers: Headers.Headers | undefined;
	/** What calls succeed with, or `undefined` for the decoded body alone. */
	readonly responseMode: M;
	/** The schema `query` is typed and encoded with, or `undefined` without one. */
	readonly query: QS;
	/**
	 * The {@link StreamFormat} calls stream the body in, or `undefined` for
	 * calls that return an `Effect`.
	 */
	readonly stream: St;
	/**
	 * Builds the path a call with these `params` and `query` sends to,
	 * relative, without a client's `baseUrl`: the path with its params
	 * filled in, then the query string. A route with an absolute URL gives
	 * that URL. Once bound, the endpoint's `url` adds the client's
	 * `baseUrl`.
	 *
	 * It throws when a param is missing, or the query doesn't match the
	 * `query` schema. It can't be called when the query schema's encoding
	 * needs services (see {@link EndpointUrlArgs}).
	 */
	url<Q extends QueryOf<Q> = QueryInput>(
		...args: EndpointUrlArgs<R, QS, Q>
	): string;
}

/**
 * What `client.bind` takes besides the definition: headers and plugin
 * overrides for every call of the bound endpoint.
 *
 * - `headers`: sent with every call, over the definition's headers. A
 *   call's own header of the same name wins.
 * - `plugins`: per-plugin overrides, as in a call's `plugins` option,
 *   checked against the client's plugins. A call's own override for a
 *   plugin wins, and when both give options, they're merged.
 *
 * - `Ps`: the client's plugins.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const options: Fetch.BindOptions<[Fetch.Plugin<"bearer">]> = {
 *   headers: { "x-client": "web" },
 *   plugins: { bearer: false },
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface BindOptions<Ps extends ReadonlyArray<Plugin.Any>> {
	/** Headers for every call, over the definition's. A call's own header wins. */
	readonly headers?: Headers.Input | undefined;
	/** Plugin overrides for every call. A call's own override wins. */
	readonly plugins?: Plugin.Overrides<Ps> | undefined;
}

/**
 * The signature of `client.bind`: turns an {@link UnboundEndpoint} into an
 * {@link Endpoint} of the client, the same one `client.endpoint` makes from
 * the same route and definition.
 *
 * - `Ps`: the client's plugins.
 * - `DefaultEB`: the client's `defaultError` schema, used when the
 *   definition has no `error`.
 * - `ClientSE`: the client's `statusErrors` map, or `undefined` without one.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * declare const bind: Fetch.BindMethod<[], Schema.Unknown>;
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const getTodo = bind(Fetch.endpoint("GET /todos/:id", { output: Todo }));
 * ```
 *
 * @since 0.1.0
 */
export interface BindMethod<
	Ps extends ReadonlyArray<Plugin.Any>,
	DefaultEB extends AnySchema,
	ClientSE extends StatusErrorMap | undefined = undefined,
> {
	<
		R extends string,
		O extends AnySchema | undefined,
		EB extends AnySchema | undefined,
		I extends AnySchema | undefined,
		SE extends StatusErrorMap | undefined,
		// No default on M: with one, a definition written inline in the call
		// loses its literal types. QS has none to match.
		M extends ResponseMode | undefined,
		QS extends QuerySchema | undefined,
		// A default, unlike M and QS, so explicit type arguments written
		// before streams still work. The definition infers it.
		St extends StreamFormat | undefined = undefined,
	>(
		definition: UnboundEndpoint<R, O, EB, I, SE, M, QS, St>,
		options?: BindOptions<Ps>,
	): Endpoint<
		R,
		O,
		EB extends AnySchema ? EB : DefaultEB,
		I,
		Ps,
		SE | ClientSE,
		M,
		QS,
		St
	>;
}

/**
 * Any {@link UnboundEndpoint}, whatever its route and schemas. Use it to
 * constrain a parameter that takes definitions.
 *
 * @example
 * ```ts
 * import * as Fetch from "@monarcode/effetch";
 *
 * const routes = (definitions: ReadonlyArray<Fetch.AnyUnboundEndpoint>) =>
 *   definitions.map((definition) => definition.route);
 * ```
 *
 * @since 0.1.0
 */
// `any`: `UnboundEndpoint` is invariant in its route and schemas (`url`
// takes them), so only `any` accepts every definition. The route, method
// and path are typed again, so they aren't `any` too, and `url` takes
// whatever a definition's `url` takes.
export interface AnyUnboundEndpoint extends Omit<
	// oxlint-disable-next-line no-explicit-any
	UnboundEndpoint<any, any, any, any, any, any, any, any>,
	"route" | "method" | "path" | "url"
> {
	/** The route the endpoint was defined with, such as `"GET /users/:id"`. */
	readonly route: string;
	/** The route's HTTP method, such as `"GET"`. */
	readonly method: HttpMethod.HttpMethod;
	/** The route's path, with its `:params` unfilled, such as `"/users/:id"`. */
	readonly path: string;
	/** Builds the URL a call sends to. Its arguments depend on the route. */
	readonly url: (...args: never) => string;
}

/**
 * How `client.bindAll` and `Fetch.Endpoints` check one entry of a record of
 * definitions, given the entry's own type `E` and the client's plugins
 * `Ps`. An entry is a definition made with {@link endpoint}, or a pair of
 * a definition and the {@link BindOptions} to bind it with. A pair's
 * options are checked as `client.bind` checks them, so a misspelt option
 * or plugin name is an error.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const getTodo = Fetch.endpoint("GET /todos/:id", {
 *   output: Schema.Struct({ id: Schema.Finite }),
 * });
 *
 * const entry: Fetch.EndpointEntry<
 *   readonly [typeof getTodo, object],
 *   []
 * > = [getTodo, { headers: { "x-client": "web" } }];
 * ```
 *
 * @since 0.1.0
 */
export type EndpointEntry<
	E,
	Ps extends ReadonlyArray<Plugin.Any>,
> = E extends readonly [infer U extends AnyUnboundEndpoint, unknown]
	? readonly [U, BindOptions<Ps>]
	: E extends AnyUnboundEndpoint
		? E
		: AnyUnboundEndpoint | readonly [AnyUnboundEndpoint, BindOptions<Ps>];

/**
 * What `client.bindAll` and `Fetch.Endpoints` take: a record of
 * definitions made with {@link endpoint}, by the name each endpoint gets,
 * each entry checked by {@link EndpointEntry}. `D` is the record's own
 * type, and `Ps` the client's plugins. Names are strings: symbol keys are
 * left out.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 *
 * const definitions = {
 *   list: Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) }),
 *   get: [
 *     Fetch.endpoint("GET /todos/:id", { output: Todo }),
 *     { headers: { "x-client": "web" } },
 *   ],
 * } as const;
 *
 * const checked: Fetch.EndpointDefinitions<typeof definitions, []> = definitions;
 * ```
 *
 * @since 0.1.0
 */
export type EndpointDefinitions<D, Ps extends ReadonlyArray<Plugin.Any>> = {
	readonly [K in keyof D]: EndpointEntry<D[K], Ps>;
};

/**
 * The endpoint a client makes from one entry of
 * {@link EndpointDefinitions}: what `client.bind` returns for that
 * definition. `Ps`, `DefaultEB` and `ClientSE` are the client's, as in
 * {@link BindMethod}.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
 *
 * type GetTodo = Fetch.BoundEndpoint<typeof getTodo, [], Schema.Unknown>;
 * ```
 *
 * @since 0.1.0
 */
export type BoundEndpoint<
	D,
	Ps extends ReadonlyArray<Plugin.Any>,
	DefaultEB extends AnySchema,
	ClientSE extends StatusErrorMap | undefined = undefined,
> = D extends readonly [infer U, unknown]
	? BoundEndpoint<U, Ps, DefaultEB, ClientSE>
	: D extends UnboundEndpoint<
				infer R,
				infer O,
				infer EB,
				infer I,
				infer SE,
				infer M,
				infer QS,
				infer St
		  >
		? Endpoint<
				R,
				O,
				EB extends AnySchema ? EB : DefaultEB,
				I,
				Ps,
				SE | ClientSE,
				M,
				QS,
				St
			>
		: never;

/**
 * The endpoints `client.bindAll` makes from a record of
 * {@link EndpointDefinitions}: one {@link Endpoint} for each entry, under
 * the same name.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const definitions = {
 *   list: Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) }),
 *   get: Fetch.endpoint("GET /todos/:id", { output: Todo }),
 * };
 *
 * type Todos = Fetch.BoundEndpoints<typeof definitions, [], Schema.Unknown>;
 * ```
 *
 * @since 0.1.0
 */
export type BoundEndpoints<
	D,
	Ps extends ReadonlyArray<Plugin.Any>,
	DefaultEB extends AnySchema,
	ClientSE extends StatusErrorMap | undefined = undefined,
> = {
	readonly [K in keyof D as K extends symbol ? never : K]: BoundEndpoint<
		D[K],
		Ps,
		DefaultEB,
		ClientSE
	>;
};

/**
 * The signature of `client.bindAll`: binds a record of definitions at
 * once, as `client.bind` binds each one. `Ps`, `DefaultEB` and `ClientSE`
 * are the client's, as in {@link BindMethod}.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * declare const bindAll: Fetch.BindAllMethod<[], Schema.Unknown>;
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const todos = bindAll({
 *   list: Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) }),
 *   get: Fetch.endpoint("GET /todos/:id", { output: Todo }),
 * });
 * ```
 *
 * @since 0.1.0
 */
export interface BindAllMethod<
	Ps extends ReadonlyArray<Plugin.Any>,
	DefaultEB extends AnySchema,
	ClientSE extends StatusErrorMap | undefined = undefined,
> {
	<const D>(
		definitions: EndpointDefinitions<D, Ps>,
	): BoundEndpoints<D, Ps, DefaultEB, ClientSE>;
}

/**
 * Defines an endpoint without a client: a route like `"GET /users/:id"` and
 * the schemas and headers to call it with. You get back plain data, an
 * {@link UnboundEndpoint}, that you can export from module level next to
 * its schemas. `client.bind(definition)` turns it into an {@link Endpoint}
 * of that client: the same one `client.endpoint(route, definition)` makes.
 *
 * - The route is checked as you type, as with `client.endpoint`. A route
 *   that isn't valid (which the types prevent) throws here, when the
 *   module loads.
 * - With an `input` schema, `body` is required on every call and typed by
 *   it. `GET`, `HEAD`, `OPTIONS` and `TRACE` endpoints take no `input`.
 * - Without `error`, the endpoint uses the `defaultError` of the client
 *   it's bound to.
 * - `statusErrors` (see {@link StatusErrorMap}) are tried before those of
 *   the client it's bound to.
 * - With a `query` schema (see {@link QuerySchema}), each call's `query` is
 *   typed and encoded by it, and required when the schema has required
 *   fields.
 * - With `stream: "sse"` or `stream: "ndjson"`, each call of the bound
 *   endpoint returns a `Stream` of the body's values. A `stream` that
 *   isn't one of those, or that comes with `responseMode` or a
 *   `Fetch.bytes()` output, throws here.
 * - Plugin overrides are given when binding: a definition doesn't know
 *   which plugins a client has.
 * - `definition.url(options)` builds the URL a call would go to, without
 *   the client's `baseUrl`.
 *
 * Use it when endpoints should be listed next to their schemas, read
 * without a client, or bound to more than one client. Otherwise
 * `client.endpoint` does the same in one step.
 *
 * To bind several definitions at once, use `client.bindAll`. To share a
 * module's endpoints as a service, use `Fetch.Endpoints`. To test code
 * that calls them, answer them with `FetchTest.respond` from
 * `@monarcode/effetch/test`.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 * import { bearer } from "@monarcode/effetch/plugins";
 *
 * const Credentials = Schema.Struct({ user: Schema.String, password: Schema.String });
 * const Session = Schema.Struct({ token: Schema.String });
 * const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
 *
 * // At module level, without a client.
 * export const login = Fetch.endpoint("POST /auth/login", {
 *   input: Credentials,
 *   output: Session,
 * });
 * export const getUser = Fetch.endpoint("GET /users/:id", { output: User });
 * export const listUsers = Fetch.endpoint("GET /users", {
 *   query: Schema.Struct({ page: Schema.optional(Schema.Finite) }),
 *   output: Schema.Array(User),
 * });
 *
 * // Bound once there is a client, and shared as a service.
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 *   plugins: [bearer({ token: "token" })],
 * }) {}
 *
 * class UserApi extends Fetch.Endpoints<UserApi>()("UserApi", Api, {
 *   login: [login, { plugins: { bearer: false } }],
 *   get: getUser,
 *   list: listUsers,
 * }) {}
 *
 * const program = Effect.gen(function* () {
 *   const users = yield* UserApi;
 *   return yield* users.list({ query: { page: 2 } });
 * });
 * ```
 *
 * @since 0.1.0
 */
export function endpoint<
	const R extends string,
	O extends AnySchema | undefined = undefined,
	EB extends AnySchema | undefined = undefined,
	I extends AnySchema | undefined = undefined,
	SE extends StatusErrorMap | undefined = undefined,
	M extends ResponseMode | undefined = undefined,
	QS extends QuerySchema | undefined = undefined,
	St extends StreamFormat | undefined = undefined,
>(
	route: ValidRoute<R>,
	definition?: UnboundDefinition<R, O, EB, I, SE, M, QS, St> &
		StreamDefinitionCheck<O, St>,
	// `NoInfer`: the type parameters come from `definition` alone. Inside a
	// `[definition, options]` pair, the surrounding type would otherwise
	// fill in the unset ones, typing the endpoint as a stream.
): NoInfer<UnboundEndpoint<R, O, EB, I, SE, M, QS, St>>;
// `unknown`: the typed `url` takes no arguments when the query schema needs
// services, which the runtime `url` can't be checked against.
export function endpoint(
	route: string,
	definition?: RuntimeUnboundDefinition,
): unknown {
	return makeUnboundEndpoint(route, definition);
}
