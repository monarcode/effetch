import type * as Effect from "effect/Effect";
import type * as Headers from "effect/http/Headers";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as HttpMethod from "effect/http/HttpMethod";
import type * as UrlParams from "effect/http/UrlParams";
import type * as Schema from "effect/Schema";

import type { DecodeError, HttpError, NetworkError } from "./Errors.js";
import type { PathParamNames, PathParams, PathParamValue } from "./Path.js";
import type { Plugin } from "./Plugin.js";

/**
 * A single query value. effetch drops `null` and `undefined` (Effect's own
 * `UrlParams` would send `null` as the string `"null"`); other values are
 * converted with `String()`. With Effect 4.1 or later, a value can also be
 * `Redacted`: it's sent as its value, and stays redacted in Effect's own logs
 * and traces.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const page: Fetch.QueryValue = 2;
 * ```
 *
 * @since 0.1.0
 */
export type QueryValue = UrlParams.Coercible;

/**
 * The `query` option: an object whose entries become URL query parameters.
 * Arrays repeat the key (`tags=a&tags=b`); `null` and `undefined` entries
 * and array items are dropped.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const query: Fetch.QueryInput = {
 *   page: 1,
 *   tags: ["a", "b"],
 *   search: undefined, // dropped
 * };
 * // → ?page=1&tags=a&tags=b
 * ```
 *
 * @since 0.1.0
 */
export type QueryInput = {
	readonly [key: string]: QueryValue | ReadonlyArray<QueryValue>;
};

/**
 * The constraint on a `query` of type `Q`: each of `Q`'s own properties must
 * be a {@link QueryValue} or an array of them.
 *
 * Unlike {@link QueryInput}, this has no index signature, so it also accepts
 * values typed with an `interface` (TypeScript never gives interfaces an
 * implicit index signature).
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * interface ListTodosParams {
 *   readonly limit: number;
 *   readonly tags?: ReadonlyArray<string> | undefined;
 * }
 *
 * declare const params: ListTodosParams;
 *
 * const query: Fetch.QueryOf<ListTodosParams> = params;
 * ```
 *
 * @since 0.1.0
 */
export type QueryOf<Q> = {
	readonly [K in keyof Q]: QueryValue | ReadonlyArray<QueryValue>;
};

/**
 * Any Effect schema accepted by the `output`, `error` and `input` options.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const Todo: Fetch.AnySchema = Schema.Struct({ id: Schema.Finite });
 * ```
 *
 * @since 0.1.0
 */
export type AnySchema = Schema.Constraint;

/**
 * The `statusErrors` option: turns error responses into your own errors.
 * Each key is an HTTP status, and its value is the schema of the error that
 * status means, or a list of schemas tried in order. The first schema that
 * decodes the response's JSON body is what the call fails with, in place of
 * an `HttpError`.
 *
 * Usually the schemas are `Schema.TaggedError` classes. Backends don't send
 * a `_tag`, so when a schema has a literal `_tag`, effetch adds it to the
 * body before decoding. A literal field, such as
 * `code: Schema.Literal("INVALID_ROLE")`, is how one 400 becomes your error
 * while other 400s don't.
 *
 * A response that no schema decodes, or whose body is empty or isn't JSON,
 * fails with the `HttpError` it fails with today. Entries for 2xx statuses
 * never apply: a 2xx is decoded with `output`, and neither do keys that
 * aren't statuses. A `Schema.Union` is decoded as it is, without a `_tag`
 * added: list its members instead.
 *
 * Declare a map inline, with a type literal, or with
 * `satisfies Fetch.StatusErrorMap`. A map typed with an `interface` isn't
 * accepted: TypeScript gives interfaces no index signature.
 *
 * A client, an endpoint and a call can each have a map. For a given status,
 * the call's schemas are tried first, then the endpoint's, then the
 * client's.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
 *   message: Schema.String,
 * }) {}
 * class InvalidRole extends Schema.TaggedError<InvalidRole>()("InvalidRole", {
 *   code: Schema.Literal("INVALID_ROLE"),
 *   message: Schema.String,
 * }) {}
 * class RoleTaken extends Schema.TaggedError<RoleTaken>()("RoleTaken", {
 *   code: Schema.Literal("ROLE_TAKEN"),
 *   message: Schema.String,
 * }) {}
 *
 * const statusErrors = {
 *   404: TodoNotFound,
 *   400: [InvalidRole, RoleTaken],
 * } satisfies Fetch.StatusErrorMap;
 * ```
 *
 * @since 0.1.0
 */
export type StatusErrorMap = {
	readonly [status: number]: AnySchema | ReadonlyArray<AnySchema>;
};

/** The `Type` of a `StatusErrorMap` entry's schemas. */
type EntryType<E> =
	E extends ReadonlyArray<infer S extends AnySchema>
		? S["Type"]
		: E extends AnySchema
			? E["Type"]
			: never;

/** The schemas of a `StatusErrorMap` entry. */
type EntrySchema<E> =
	E extends ReadonlyArray<infer S extends AnySchema>
		? S
		: E extends AnySchema
			? E
			: never;

/**
 * The schemas a {@link StatusErrorMap} lists, as a union, under its numeric
 * keys only. `M` can be a union of maps, and `undefined` gives `never`.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
 *   message: Schema.String,
 * }) {}
 *
 * type S = Fetch.StatusErrorSchema<{ 404: typeof TodoNotFound }>;
 * //   ^? typeof TodoNotFound
 * ```
 *
 * @since 0.1.0
 */
export type StatusErrorSchema<M extends StatusErrorMap | undefined> =
	M extends StatusErrorMap ? EntrySchema<M[StatusKey<M>]> : never;

/** The keys of `M` that are statuses: numbers, or numeric strings. */
type StatusKey<M> = Extract<keyof M, number | `${number}`>;

/** The decoding services of a `StatusErrorMap` entry's schemas. */
type EntryServices<E> =
	E extends ReadonlyArray<infer S extends AnySchema>
		? S["DecodingServices"]
		: E extends AnySchema
			? E["DecodingServices"]
			: never;

/**
 * The errors a {@link StatusErrorMap} can fail a call with: the union of its
 * schemas' types. `M` can be a union of maps (the call's, the endpoint's and
 * the client's), and is `undefined` when there are none, which gives
 * `never`.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
 *   message: Schema.String,
 * }) {}
 * class SessionExpired extends Schema.TaggedError<SessionExpired>()("SessionExpired", {
 *   message: Schema.String,
 * }) {}
 *
 * type E = Fetch.StatusError<
 *   { 404: typeof TodoNotFound } | { 401: typeof SessionExpired }
 * >;
 * //   ^? TodoNotFound | SessionExpired
 * ```
 *
 * @since 0.1.0
 */
export type StatusError<M extends StatusErrorMap | undefined> =
	M extends StatusErrorMap ? EntryType<M[StatusKey<M>]> : never;

/**
 * The services decoding a {@link StatusErrorMap}'s errors requires: the
 * union of its schemas' `DecodingServices`. Like {@link StatusError}, `M`
 * can be a union of maps, and `undefined` gives `never`.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
 *   message: Schema.String,
 * }) {}
 *
 * type R = Fetch.StatusErrorServices<{ 404: typeof TodoNotFound }>;
 * //   ^? never
 * ```
 *
 * @since 0.1.0
 */
export type StatusErrorServices<M extends StatusErrorMap | undefined> =
	M extends StatusErrorMap ? EntryServices<M[StatusKey<M>]> : never;

/**
 * The `params` option for path `P`: required (with exactly the path's
 * parameter names) when the path has `:params`, forbidden otherwise.
 *
 * When `P` is plain `string` the names can't be known, so `params` is an
 * optional record.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const withParams: Fetch.ParamsOption<"/todos/:id"> = { params: { id: 1 } };
 * const without: Fetch.ParamsOption<"/todos"> = {};
 * ```
 *
 * @since 0.1.0
 */
export type ParamsOption<P extends string> = string extends P
	? {
			readonly params?:
				| { readonly [name: string]: PathParamValue }
				| undefined;
		}
	: [PathParamNames<P>] extends [never]
		? { readonly params?: undefined }
		: { readonly params: PathParams<P> };

/**
 * Options shared by every method.
 *
 * - `O`: the `output` schema, or `undefined` for the raw response.
 * - `EB`: the `error` schema for non-2xx bodies.
 * - `Ps`: the client's plugins, for the `plugins` override map.
 * - `Q`: the type of `query`, checked with {@link QueryOf}. Defaults to
 *   {@link QueryInput}.
 * - `SE`: the call's `statusErrors` map, or `undefined` without one.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite });
 *
 * const options: Fetch.BaseOptions<typeof Todo, Schema.Unknown, []> = {
 *   query: { expand: "owner" },
 *   headers: { "x-trace": "1" },
 *   output: Todo,
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface BaseOptions<
	O extends AnySchema | undefined,
	EB extends AnySchema,
	Ps extends ReadonlyArray<Plugin.Any>,
	Q extends QueryOf<Q> = QueryInput,
	SE extends StatusErrorMap | undefined = undefined,
> {
	/** Query parameters. Arrays repeat the key; `null`/`undefined` are dropped. */
	readonly query?: Q | undefined;
	/** Headers for this call, merged over the client's headers. */
	readonly headers?: Headers.Input | undefined;
	/**
	 * Decodes the 2xx JSON body with this schema. Without it, the call
	 * succeeds with the raw `HttpClientResponse`.
	 *
	 * With an `output`, the request carries `Accept: application/json`,
	 * unless an `accept` header is set on the call or the client.
	 *
	 * An empty body (204, HEAD, …) is decoded as JSON `null`: use
	 * `Schema.Void` for endpoints that return nothing. Non-2xx responses,
	 * 3xx included, fail with an `HttpError` before this runs.
	 */
	readonly output?: O;
	/** Decodes non-2xx bodies into `HttpError.body`. Overrides the client's. */
	readonly error?: EB | undefined;
	/**
	 * Turns error responses into your own errors, by status (see
	 * {@link StatusErrorMap}). Tried before the client's. A response none of
	 * them decodes fails with an `HttpError`, its body decoded with `error`.
	 */
	// No `| undefined`, unlike the other options: `SE` already allows it, and
	// with it `statusErrors: undefined` infers the constraint, which widens
	// the call's errors to `unknown`.
	readonly statusErrors?: SE;
	/**
	 * Per-request plugin overrides, by plugin name: `false` skips the
	 * plugin's hooks and `wrap` for this call, and a partial of its options
	 * is merged over its `defaults`.
	 */
	readonly plugins?: Plugin.Overrides<Ps> | undefined;
}

/**
 * The `body` and `input` options of methods that send a body.
 *
 * With an `input` schema, `body` is typed as the schema's type and encoded
 * with it before being sent as JSON. Without one (`I` is `Schema.Unknown`),
 * `body` is sent according to its runtime type: `HttpBody`, strings,
 * `ArrayBuffer` and typed arrays, `Blob`/`File`, `FormData` and
 * `URLSearchParams` as-is, anything else as JSON.
 *
 * A body that doesn't match `input`, or can't be serialised as JSON, is a
 * defect (the call dies), not a typed failure.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const NewTodo = Schema.Struct({ title: Schema.String });
 *
 * const options: Fetch.BodyOptions<typeof NewTodo> = {
 *   input: NewTodo,
 *   body: { title: "Write docs" },
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface BodyOptions<I extends AnySchema> {
	/** Encodes `body` with this schema, then sends it as JSON. */
	readonly input?: I | undefined;
	/** The request body. Typed by `input` when given. */
	readonly body?: I["Type"] | undefined;
}

/**
 * Options of methods that don't send a body: `get`, `head`, `options`.
 * The type parameters are those of {@link BaseOptions}.
 *
 * @example
 * ```ts
 * import type * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const options: Fetch.NoBodyRequestOptions<
 *   "/todos/:id", undefined, Schema.Unknown, []
 * > = { params: { id: 1 } };
 * ```
 *
 * @since 0.1.0
 */
export type NoBodyRequestOptions<
	P extends string,
	O extends AnySchema | undefined,
	EB extends AnySchema,
	Ps extends ReadonlyArray<Plugin.Any>,
	Q extends QueryOf<Q> = QueryInput,
	SE extends StatusErrorMap | undefined = undefined,
> = ParamsOption<P> &
	BaseOptions<O, EB, Ps, Q, SE> & {
		readonly body?: undefined;
		readonly input?: undefined;
	};

/**
 * Options of methods that send a body: `post`, `put`, `patch`, `del` and
 * `request`. The type parameters are those of {@link BaseOptions}, and `I`
 * is the `input` schema.
 *
 * @example
 * ```ts
 * import type * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const options: Fetch.RequestOptions<
 *   "/todos/:id", undefined, Schema.Unknown, Schema.Unknown, []
 * > = { params: { id: 1 }, body: { done: true } };
 * ```
 *
 * @since 0.1.0
 */
export type RequestOptions<
	P extends string,
	O extends AnySchema | undefined,
	EB extends AnySchema,
	I extends AnySchema,
	Ps extends ReadonlyArray<Plugin.Any>,
	Q extends QueryOf<Q> = QueryInput,
	SE extends StatusErrorMap | undefined = undefined,
> = ParamsOption<P> & BaseOptions<O, EB, Ps, Q, SE> & BodyOptions<I>;

/**
 * The rest arguments after the path: the options object `T` is required
 * when path `P` has parameters, optional otherwise.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type WithParams = Fetch.Args<"/todos/:id", { params: { id: number } }>;
 * //   ^? [options: { params: { id: number } }]
 * type WithoutParams = Fetch.Args<"/todos", {}>;
 * //   ^? [options?: {}]
 * ```
 *
 * @since 0.1.0
 */
export type Args<P extends string, T> = [PathParamNames<P>] extends [never]
	? [options?: T]
	: [options: T];

/**
 * What a call succeeds with: the `output` schema's type, or the raw
 * `HttpClientResponse` without one. A conditional `output` gives the union.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type Todo = Fetch.Success<Schema.Struct<{ id: Schema.Finite }>>;
 * //   ^? { readonly id: number }
 * ```
 *
 * @since 0.1.0
 */
export type Success<O extends AnySchema | undefined> = O extends AnySchema
	? O["Type"]
	: HttpClientResponse.HttpClientResponse;

/**
 * What a call can fail with: `NetworkError`, `HttpError` (with `body`
 * typed by the `error` schema), `DecodeError` when there's an `output`
 * schema, the plugins' errors, and the errors of the `statusErrors` maps
 * that apply (see {@link StatusError}).
 *
 * - `SE`: the `statusErrors` maps of the call, the endpoint and the client,
 *   as a union. `undefined` (the default) when there are none.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type E = Fetch.CallError<
 *   Schema.Struct<{ id: Schema.Finite }>,
 *   Schema.Struct<{ code: Schema.String }>,
 *   []
 * >;
 * //   ^? NetworkError | DecodeError | HttpError.With<{ readonly code: string }>
 * ```
 *
 * @since 0.1.0
 */
export type CallError<
	O extends AnySchema | undefined,
	EB extends AnySchema,
	Ps extends ReadonlyArray<Plugin.Any>,
	SE extends StatusErrorMap | undefined = undefined,
> =
	| NetworkError
	| HttpError.With<EB["Type"]>
	| (O extends AnySchema ? DecodeError : never)
	| Plugin.Errors<Ps>
	| StatusError<SE>;

/**
 * The services a call requires: those needed to decode `output`, `error`
 * and the `statusErrors` maps' errors, and to encode `input`.
 *
 * - `SE`: the `statusErrors` maps of the call, the endpoint and the client,
 *   as a union. `undefined` (the default) when there are none.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type R = Fetch.CallServices<
 *   Schema.Struct<{ id: Schema.Finite }>,
 *   Schema.Unknown,
 *   Schema.Unknown
 * >;
 * //   ^? never
 * ```
 *
 * @since 0.1.0
 */
export type CallServices<
	O extends AnySchema | undefined,
	EB extends AnySchema,
	I extends AnySchema | undefined,
	SE extends StatusErrorMap | undefined = undefined,
> =
	| (O extends AnySchema ? O["DecodingServices"] : never)
	| EB["DecodingServices"]
	| (I extends AnySchema ? I["EncodingServices"] : never)
	| StatusErrorServices<SE>;

/**
 * The Effect a call returns: it succeeds with {@link Success}, fails with
 * {@link CallError} and requires {@link CallServices}.
 *
 * - `O`: the `output` schema, or `undefined` for the raw response.
 * - `EB`: the `error` schema for non-2xx bodies.
 * - `I`: the `input` schema (`Schema.Unknown` or `undefined` when the call
 *   has none).
 * - `Ps`: the client's plugins.
 * - `SE`: the `statusErrors` maps of the call, the endpoint and the client,
 *   as a union. `undefined` (the default) when there are none.
 *
 * Use it to type functions that return a call. To take a call as an
 * argument, accept any `Effect.Effect<A, E, R>`: TypeScript can't infer
 * these parameters from a call.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type Call = Fetch.CallEffect<
 *   Schema.Struct<{ id: Schema.Finite }>,
 *   Schema.Unknown,
 *   Schema.Unknown,
 *   []
 * >;
 * //   ^? Effect<{ readonly id: number }, NetworkError | DecodeError | HttpError.With<unknown>, never>
 * ```
 *
 * @since 0.1.0
 */
export type CallEffect<
	O extends AnySchema | undefined,
	EB extends AnySchema,
	I extends AnySchema | undefined,
	Ps extends ReadonlyArray<Plugin.Any>,
	SE extends StatusErrorMap | undefined = undefined,
> = Effect.Effect<
	Success<O>,
	// CallError and CallServices, written out: through the aliases, editors
	// print `CallError<…>` rather than the members. The method and endpoint
	// signatures spell them out the same way.
	| NetworkError
	| HttpError.With<EB["Type"]>
	| (O extends AnySchema ? DecodeError : never)
	| Plugin.Errors<Ps>
	| StatusError<SE>,
	| (O extends AnySchema ? O["DecodingServices"] : never)
	| EB["DecodingServices"]
	| (I extends AnySchema ? I["EncodingServices"] : never)
	| StatusErrorServices<SE>
>;

/**
 * The signature of `get`, `head` and `options`: no `body` or `input`.
 *
 * - `Ps`: the client's plugins.
 * - `DefaultEB`: the client's `defaultError` schema, used when a call has
 *   no `error`.
 * - `ClientSE`: the client's `statusErrors` map, or `undefined` without one.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * declare const get: Fetch.NoBodyMethod<[], Schema.Unknown>;
 *
 * const Todo = Schema.Struct({ id: Schema.Finite });
 * const todo = get("/todos/:id", { params: { id: 1 }, output: Todo });
 * ```
 *
 * @since 0.1.0
 */
export interface NoBodyMethod<
	Ps extends ReadonlyArray<Plugin.Any>,
	DefaultEB extends AnySchema,
	ClientSE extends StatusErrorMap | undefined = undefined,
> {
	<
		P extends string,
		O extends AnySchema | undefined = undefined,
		EB extends AnySchema = DefaultEB,
		Q extends QueryOf<Q> = QueryInput,
		SE extends StatusErrorMap | undefined = undefined,
	>(
		path: P,
		...args: Args<P, NoBodyRequestOptions<P, O, EB, Ps, Q, SE>>
	): Effect.Effect<
		Success<O>,
		// CallError and CallServices, written out (see CallEffect)
		| NetworkError
		| HttpError.With<EB["Type"]>
		| (O extends AnySchema ? DecodeError : never)
		| Plugin.Errors<Ps>
		| StatusError<NoInfer<SE>>
		| StatusError<ClientSE>,
		| (O extends AnySchema ? O["DecodingServices"] : never)
		| EB["DecodingServices"]
		| StatusErrorServices<NoInfer<SE>>
		| StatusErrorServices<ClientSE>
	>;
}

/**
 * The signature of `post`, `put`, `patch` and `del`: `body` allowed,
 * typed by `input` when given.
 *
 * - `Ps`: the client's plugins.
 * - `DefaultEB`: the client's `defaultError` schema, used when a call has
 *   no `error`.
 * - `ClientSE`: the client's `statusErrors` map, or `undefined` without one.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * declare const patch: Fetch.BodyMethod<[], Schema.Unknown>;
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, done: Schema.Boolean });
 * const updated = patch("/todos/:id", {
 *   params: { id: 1 },
 *   body: { done: true },
 *   output: Todo,
 * });
 * ```
 *
 * @since 0.1.0
 */
export interface BodyMethod<
	Ps extends ReadonlyArray<Plugin.Any>,
	DefaultEB extends AnySchema,
	ClientSE extends StatusErrorMap | undefined = undefined,
> {
	<
		P extends string,
		O extends AnySchema | undefined = undefined,
		EB extends AnySchema = DefaultEB,
		I extends AnySchema = Schema.Unknown,
		Q extends QueryOf<Q> = QueryInput,
		SE extends StatusErrorMap | undefined = undefined,
	>(
		path: P,
		...args: Args<P, RequestOptions<P, O, EB, I, Ps, Q, SE>>
	): Effect.Effect<
		Success<O>,
		// CallError and CallServices, written out (see CallEffect)
		| NetworkError
		| HttpError.With<EB["Type"]>
		| (O extends AnySchema ? DecodeError : never)
		| Plugin.Errors<Ps>
		| StatusError<NoInfer<SE>>
		| StatusError<ClientSE>,
		| (O extends AnySchema ? O["DecodingServices"] : never)
		| EB["DecodingServices"]
		| (I extends AnySchema ? I["EncodingServices"] : never)
		| StatusErrorServices<NoInfer<SE>>
		| StatusErrorServices<ClientSE>
	>;
}

/**
 * The signature of `request`: any HTTP method, `body` allowed, typed by
 * `input` when given.
 *
 * - `Ps`: the client's plugins.
 * - `DefaultEB`: the client's `defaultError` schema, used when a call has
 *   no `error`.
 * - `ClientSE`: the client's `statusErrors` map, or `undefined` without one.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * declare const request: Fetch.RequestMethod<[], Schema.Unknown>;
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, done: Schema.Boolean });
 * const updated = request("PATCH", "/todos/:id", {
 *   params: { id: 1 },
 *   body: { done: true },
 *   output: Todo,
 * });
 * ```
 *
 * @since 0.1.0
 */
export interface RequestMethod<
	Ps extends ReadonlyArray<Plugin.Any>,
	DefaultEB extends AnySchema,
	ClientSE extends StatusErrorMap | undefined = undefined,
> {
	<
		P extends string,
		O extends AnySchema | undefined = undefined,
		EB extends AnySchema = DefaultEB,
		I extends AnySchema = Schema.Unknown,
		Q extends QueryOf<Q> = QueryInput,
		SE extends StatusErrorMap | undefined = undefined,
	>(
		method: HttpMethod.HttpMethod,
		path: P,
		...args: Args<P, RequestOptions<P, O, EB, I, Ps, Q, SE>>
	): Effect.Effect<
		Success<O>,
		// CallError and CallServices, written out (see CallEffect)
		| NetworkError
		| HttpError.With<EB["Type"]>
		| (O extends AnySchema ? DecodeError : never)
		| Plugin.Errors<Ps>
		| StatusError<NoInfer<SE>>
		| StatusError<ClientSE>,
		| (O extends AnySchema ? O["DecodingServices"] : never)
		| EB["DecodingServices"]
		| (I extends AnySchema ? I["EncodingServices"] : never)
		| StatusErrorServices<NoInfer<SE>>
		| StatusErrorServices<ClientSE>
	>;
}
