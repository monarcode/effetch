import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

import { DecodeError, HttpError, NetworkError } from "./Errors.js";
import { parseErrorBody, readErrorBody } from "./internal/response.js";
import { joinStatusErrors, tagOf } from "./internal/statusErrors.js";
import type {
	AnySchema,
	CallError,
	StatusError,
	StatusErrorMap,
	StatusErrorSchema,
} from "./Options.js";
import type { StreamFormat } from "./Streams.js";

/**
 * Where {@link errorCodec} reads a call's error schemas from: anything
 * with the `output`, `error` and `statusErrors` an endpoint has.
 *
 * - An endpoint, bound to a client. It already carries the client's
 *   `defaultError` and `statusErrors`.
 * - A definition made with `Fetch.endpoint`, at module level. It only knows
 *   its own schemas, so give the client as `client`.
 * - The schemas themselves, for calls made with the plain methods:
 *   `{ error: ApiError, statusErrors: { 404: NotFound } }`.
 *
 * `output` and `stream` decide whether a `DecodeError` is one of the
 * errors' types: an endpoint or definition with neither has none. Leave
 * `output` out of an object of your own to include it.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const ApiError = Schema.Struct({ code: Schema.String });
 *
 * const source: Fetch.ErrorCodecSource = { error: ApiError };
 * ```
 *
 * @since 0.1.0
 */
export interface ErrorCodecSource {
	/** The schema the call's response is decoded with, if it has one. */
	readonly output?: AnySchema | undefined;
	/** The schema `HttpError.body` is decoded with. */
	readonly error?: AnySchema | undefined;
	/** The errors that statuses turn into. */
	readonly statusErrors?: StatusErrorMap | undefined;
	/** How the call streams its body, if it does. */
	readonly stream?: StreamFormat | undefined;
}

/**
 * The client {@link errorCodec} takes the `defaultError` and
 * `statusErrors` of: a `Fetch.Service` class, or anything with a `config`
 * like one.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 *
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 * }) {}
 *
 * const client: Fetch.ErrorCodecClient = Api;
 * ```
 *
 * @since 0.1.0
 */
export interface ErrorCodecClient {
	/** The client's config, as `Fetch.Service` classes keep it. */
	readonly config: {
		readonly defaultError?: AnySchema | undefined;
		readonly statusErrors?: StatusErrorMap | undefined;
	};
}

/**
 * Options for {@link errorCodec}.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 * import { TimeoutError } from "@monarcode/effetch/plugins";
 *
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 * }) {}
 *
 * const options = { client: Api, errors: [TimeoutError] } satisfies Fetch.ErrorCodecOptions<
 *   typeof Api,
 *   [typeof TimeoutError]
 * >;
 * ```
 *
 * @since 0.1.0
 */
export interface ErrorCodecOptions<
	C extends ErrorCodecClient | undefined = undefined,
	Es extends ReadonlyArray<AnySchema> = [],
> {
	/**
	 * The client whose `defaultError` and `statusErrors` to use. Its
	 * `defaultError` is used when the source has no `error` of its own, and
	 * its `statusErrors` are tried after the source's. A bound endpoint
	 * already has both.
	 */
	readonly client?: C | undefined;
	/**
	 * More errors to send, such as plugins' errors (`TimeoutError`), which
	 * endpoints and clients don't list. Each must be a schema that encodes.
	 */
	readonly errors?: Es | undefined;
}

/**
 * What {@link errorCodec} returns: a codec, the schema for the errors a
 * call can fail with, `E`, whose JSON encoding can cross to a browser, a
 * worker or an RPC client. `RD` and `RE` are the services its schemas
 * need to decode and encode, `never` for most.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 *
 * declare const errors: Fetch.ErrorCodec<Fetch.NetworkError | Fetch.HttpError>;
 * ```
 *
 * @since 0.1.0
 */
export type ErrorCodec<E, RD = never, RE = never> = Schema.Codec<
	E,
	unknown,
	RD,
	RE
>;

/**
 * The errors {@link errorCodec} describes for a source `S`, a client `C`
 * and more errors `Es`: the call's errors, as {@link CallError} gives them,
 * without the plugins' errors, plus `Es`.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type { Fetch } from "@monarcode/effetch";
 *
 * type E = Fetch.ErrorCodecErrors<
 *   { readonly error: Schema.Struct<{ readonly code: Schema.String }> },
 *   undefined,
 *   []
 * >;
 * //   ^? NetworkError | HttpError.With<{ readonly code: string }> | DecodeError
 * ```
 *
 * @since 0.1.0
 */
export type ErrorCodecErrors<
	S extends ErrorCodecSource,
	C extends ErrorCodecClient | undefined,
	Es extends ReadonlyArray<AnySchema>,
> =
	| CallError<OutputOf<S>, BodyOf<S, C>, [], StatusErrorsOf<S, C>>
	| Es[number]["Type"];

/**
 * `undefined` when `S` has no `output` and doesn't stream, so the errors
 * have no `DecodeError`. A stream fails with one while it's read.
 */
type OutputOf<S> = S extends {
	readonly output: undefined;
	readonly stream?: undefined;
}
	? undefined
	: AnySchema;

/** A schema, or `Schema.Unknown` for `undefined` or nothing. */
type SchemaOrUnknown<EB> = [Exclude<EB, undefined>] extends [never]
	? Schema.Unknown
	: Exclude<EB, undefined> extends AnySchema
		? Exclude<EB, undefined>
		: Schema.Unknown;

/** The schema `HttpError.body` is decoded with: the source's, else the client's. */
type BodyOf<S, C> = S extends { readonly error: infer EB extends AnySchema }
	? EB
	: C extends { readonly config: { readonly defaultError?: infer EB } }
		? SchemaOrUnknown<EB>
		: Schema.Unknown;

/** The source's `statusErrors` maps, and the client's. */
type StatusErrorsOf<S, C> =
	| (S extends { readonly statusErrors: infer SE }
			? Extract<SE, StatusErrorMap>
			: never)
	| (C extends { readonly config: { readonly statusErrors?: infer SE } }
			? Extract<SE, StatusErrorMap>
			: never);

/**
 * An `HttpError` as it's sent: no headers, so `set-cookie` and the like
 * stay put, and no `body`, which is decoded again from `text` with `body`,
 * as the call decoded it.
 */
const httpErrorFromText = (body: AnySchema | undefined) =>
	Schema.TaggedStruct("HttpError", {
		method: Schema.String,
		url: Schema.String,
		status: Schema.Finite,
		text: Schema.String,
	}).pipe(
		Schema.decodeTo(
			Schema.instanceOf(HttpError),
			SchemaTransformation.transformEffect({
				decode: ({ method, url, status, text }) =>
					Effect.map(
						readErrorBody(parseErrorBody(text), body),
						(decoded) =>
							new HttpError({
								method,
								url,
								status,
								text,
								headers: Headers.empty,
								body: decoded,
							}),
					),
				encode: (error) =>
					Effect.succeed({
						_tag: "HttpError" as const,
						method: error.method,
						url: error.url,
						status: error.status,
						text: error.text,
					}),
			}),
		),
	);

/** The `_tag` that sets apart the errors whose schemas have no `_tag`. */
const untaggedTag = "effetch/UntaggedError";

/**
 * An error whose schema has no literal `_tag`, sent with its place among
 * them, `index`, so it decodes with its own schema. Without that, two such
 * schemas with the same fields would decode as whichever comes first.
 */
const untagged = (schema: AnySchema, index: number) =>
	Schema.Struct({
		_tag: Schema.Literal(untaggedTag),
		index: Schema.Literal(index),
		error: schema as Schema.Top,
	}).pipe(
		Schema.decodeTo(
			Schema.toType(schema as Schema.Top),
			SchemaTransformation.transform({
				decode: ({ error }) => error,
				encode: (error) => ({
					_tag: untaggedTag as typeof untaggedTag,
					index,
					error,
				}),
			}),
		),
	);

/**
 * Builds a codec for every error a call can fail with: a schema whose JSON
 * encoding (`Schema.toCodecJson`) turns each error into JSON, and decodes
 * it back into the same class, typed as the call types it. Use it to send a
 * call's failures where only data goes: to the browser from a
 * server-rendered page, to an RPC client, to a worker.
 *
 * Give it where the call's schemas are:
 *
 * - an endpoint bound to a client: `Fetch.errorCodec(todos.get)`;
 * - a definition and its client, at module level:
 *   `Fetch.errorCodec(getTodo, { client: Api })`;
 * - the schemas themselves, for the plain methods:
 *   `Fetch.errorCodec({ error: ApiError, statusErrors: { 404: NotFound } })`.
 *
 * What's sent:
 *
 * - An `HttpError` goes with its `method`, `url`, `status` and `text`. Its
 *   `body` is decoded again from `text`, with the call's error schema, so
 *   it's typed on the other side too. The headers aren't sent, and decode
 *   as empty.
 * - A `NetworkError` goes without its `cause`, and a `DecodeError` without
 *   its `issue`. Both decode as `undefined`.
 * - The `statusErrors` errors, and the `errors` you add, go as their own
 *   schemas encode them. One whose schema has no `_tag` goes with its place
 *   in the list, so it decodes with its own schema.
 *
 * Plugins' errors aren't on an endpoint or a client, so add the ones a call
 * can fail with as `errors`, such as `TimeoutError`.
 *
 * The request URL, the response text and a `DecodeError`'s `message`,
 * which can quote the response body, are sent. Keep secrets out of the URLs
 * your server calls and out of the backend's responses, or catch the error
 * and send one of your own.
 *
 * @example
 * ```ts
 * import * as Rpc from "effect/rpc/Rpc";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 * import { TimeoutError, timeout } from "@monarcode/effetch/plugins";
 *
 * class ApiProblem extends Schema.Class<ApiProblem>("ApiProblem")({
 *   code: Schema.String,
 * }) {}
 *
 * class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
 *   "TodoNotFound",
 *   { id: Schema.Finite },
 * ) {}
 *
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 *   defaultError: ApiProblem,
 *   statusErrors: { 404: TodoNotFound },
 *   plugins: [timeout({ duration: "5 seconds" })],
 * }) {}
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
 *
 * // An RPC that fails with what the call fails with.
 * export const GetTodo = Rpc.make("GetTodo", {
 *   payload: { id: Schema.Finite },
 *   success: Todo,
 *   error: Fetch.errorCodec(getTodo, { client: Api, errors: [TimeoutError] }),
 * });
 * ```
 *
 * @since 0.1.0
 */
// The return type writes out the members of ErrorCodecErrors, so a hover shows
// the errors rather than the alias (as the call signatures do with
// CallError). Keep the two in sync: the type tests check they're equal.
export function errorCodec<
	S extends ErrorCodecSource,
	C extends ErrorCodecClient | undefined = undefined,
	const Es extends ReadonlyArray<AnySchema> = [],
>(
	source: S,
	options?: ErrorCodecOptions<C, Es>,
): ErrorCodec<
	| NetworkError
	| ([unknown] extends [BodyOf<S, C>["Type"]]
			? 0 extends 1 & BodyOf<S, C>["Type"]
				? HttpError.With<BodyOf<S, C>["Type"]>
				: HttpError
			: HttpError.With<BodyOf<S, C>["Type"]>)
	| (S extends { readonly output: undefined; readonly stream?: undefined }
			? never
			: DecodeError)
	| StatusError<StatusErrorsOf<S, C>>
	| Es[number]["Type"],
	| BodyOf<S, C>["DecodingServices"]
	| StatusErrorSchema<StatusErrorsOf<S, C>>["DecodingServices"]
	| Es[number]["DecodingServices"],
	| StatusErrorSchema<StatusErrorsOf<S, C>>["EncodingServices"]
	| Es[number]["EncodingServices"]
>;
export function errorCodec(
	source: ErrorCodecSource,
	options?: ErrorCodecOptions<
		ErrorCodecClient | undefined,
		ReadonlyArray<AnySchema>
	>,
): unknown {
	const config = options?.client?.config;
	// The schemas statuses turn into, read as calls read them (the source's,
	// then the client's), then the errors added. Each once.
	const others = new Set<AnySchema>([
		...Object.values(
			joinStatusErrors([source.statusErrors, config?.statusErrors]),
		).flat(),
		...(options?.errors ?? []),
	]);
	const tagged = [...others].filter((schema) => tagOf(schema) !== undefined);
	const rest = [...others].filter((schema) => tagOf(schema) === undefined);
	// Effetch's own errors first, then the other tagged ones, then the rest,
	// each under its index: a schema without a `_tag` can then neither take
	// another's value when encoding, nor its JSON when decoding. A
	// `DecodeError` is always decoded, though the type leaves it out for a
	// call that can't fail with one.
	const members: ReadonlyArray<AnySchema> = [
		httpErrorFromText(source.error ?? config?.defaultError),
		NetworkError,
		DecodeError,
		...tagged,
		...rest.map(untagged),
	];
	return Schema.Union(members as unknown as ReadonlyArray<Schema.Top>);
}
