import type * as Effect from "effect/Effect";
import type * as Headers from "effect/http/Headers";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as UrlParams from "effect/http/UrlParams";
import type * as Schema from "effect/Schema";

import type { DecodeError, HttpError, NetworkError } from "./Errors.js";
import type { PathParamNames, PathParams, PathParamValue } from "./Path.js";
import type { Plugin } from "./Plugin.js";

/**
 * A single query value. effetch drops `null` and `undefined` (Effect's own
 * `UrlParams` would send `null` as the string `"null"`); other values are
 * converted with `String()`.
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
 * Any Effect schema accepted by the `output`, `error` and `input` options.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const Todo: Fetch.AnySchema = Schema.Struct({ id: Schema.Number });
 * ```
 *
 * @since 0.1.0
 */
export type AnySchema = Schema.Constraint;

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
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Number });
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
> {
	/** Query parameters. Arrays repeat the key; `null`/`undefined` are dropped. */
	readonly query?: QueryInput | undefined;
	/** Headers for this call, merged over the client's headers. */
	readonly headers?: Headers.Input | undefined;
	/**
	 * Decodes the 2xx JSON body with this schema. Without it, the call
	 * succeeds with the raw `HttpClientResponse`.
	 *
	 * An empty body (204, HEAD, …) is decoded as JSON `null`: use
	 * `Schema.Void` for endpoints that return nothing. Non-2xx responses,
	 * 3xx included, fail with an `HttpError` before this runs.
	 */
	readonly output?: O;
	/** Decodes non-2xx bodies into `HttpError.body`. Overrides the client's. */
	readonly error?: EB | undefined;
	/** Per-request plugin overrides: `false` skips a plugin. */
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
> = ParamsOption<P> &
	BaseOptions<O, EB, Ps> & {
		readonly body?: undefined;
		readonly input?: undefined;
	};

/**
 * Options of methods that send a body: `post`, `put`, `patch`, `del` and
 * `request`.
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
> = ParamsOption<P> & BaseOptions<O, EB, Ps> & BodyOptions<I>;

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
 * type Todo = Fetch.Success<Schema.Struct<{ id: Schema.Number }>>;
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
 * schema, and the plugins' errors.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type E = Fetch.CallError<
 *   Schema.Struct<{ id: Schema.Number }>,
 *   Schema.Struct<{ code: Schema.String }>,
 *   []
 * >;
 * //   ^? NetworkError | HttpError.With<{ readonly code: string }> | DecodeError
 * ```
 *
 * @since 0.1.0
 */
export type CallError<
	O extends AnySchema | undefined,
	EB extends AnySchema,
	Ps extends ReadonlyArray<Plugin.Any>,
> =
	| NetworkError
	| HttpError.With<EB["Type"]>
	| (O extends AnySchema ? DecodeError : never)
	| Plugin.Errors<Ps>;

/**
 * The services a call requires: those needed to decode `output` and
 * `error` and to encode `input`. Plugin services are resolved by `make`,
 * so they're not here.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type R = Fetch.CallServices<
 *   Schema.Struct<{ id: Schema.Number }>,
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
	I extends AnySchema,
> =
	| (O extends AnySchema ? O["DecodingServices"] : never)
	| EB["DecodingServices"]
	| I["EncodingServices"];

/**
 * The signature of `get`, `head` and `options`: no `body` or `input`.
 *
 * - `Ps`: the client's plugins.
 * - `DefaultEB`: the client's `error` schema, used when a call has none.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * declare const get: Fetch.NoBodyMethod<[], Schema.Unknown>;
 *
 * const Todo = Schema.Struct({ id: Schema.Number });
 * const todo = get("/todos/:id", { params: { id: 1 }, output: Todo });
 * ```
 *
 * @since 0.1.0
 */
export interface NoBodyMethod<
	Ps extends ReadonlyArray<Plugin.Any>,
	DefaultEB extends AnySchema,
> {
	<
		P extends string,
		O extends AnySchema | undefined = undefined,
		EB extends AnySchema = DefaultEB,
	>(
		path: P,
		...args: Args<P, NoBodyRequestOptions<P, O, EB, Ps>>
	): Effect.Effect<
		Success<O>,
		CallError<O, EB, Ps>,
		CallServices<O, EB, Schema.Unknown>
	>;
}

/**
 * The signature of `post`, `put`, `patch` and `del`: `body` allowed,
 * typed by `input` when given.
 *
 * - `Ps`: the client's plugins.
 * - `DefaultEB`: the client's `error` schema, used when a call has none.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * declare const patch: Fetch.BodyMethod<[], Schema.Unknown>;
 *
 * const Todo = Schema.Struct({ id: Schema.Number, done: Schema.Boolean });
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
> {
	<
		P extends string,
		O extends AnySchema | undefined = undefined,
		EB extends AnySchema = DefaultEB,
		I extends AnySchema = Schema.Unknown,
	>(
		path: P,
		...args: Args<P, RequestOptions<P, O, EB, I, Ps>>
	): Effect.Effect<Success<O>, CallError<O, EB, Ps>, CallServices<O, EB, I>>;
}
