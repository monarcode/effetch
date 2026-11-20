import type * as HttpMethod from "effect/http/HttpMethod";
import type * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";

import type { DecodeError, HttpError, NetworkError } from "./Errors.js";
import type {
	AnySchema,
	Args,
	BaseOptions,
	BodyOptions,
	ParamsOption,
	QueryInput,
	QueryOf,
	StatusError,
	StatusErrorMap,
	StatusErrorServices,
} from "./Options.js";
import type { BytesSchema } from "./Output.js";
import type { Plugin } from "./Plugin.js";

/**
 * How a streamed response body is split into values:
 *
 * - `"sse"`: Server-Sent Events (`text/event-stream`), one value per
 *   event (see {@link SseEvent}).
 * - `"ndjson"`: newline-delimited JSON (`application/x-ndjson`), one value
 *   per line.
 *
 * @example
 * ```ts
 * import type { Fetch } from "@monarcode/effetch";
 *
 * const format: Fetch.StreamFormat = "sse";
 * ```
 *
 * @since 0.1.0
 */
export type StreamFormat = "sse" | "ndjson";

/**
 * One Server-Sent Event, as `api.sse` and SSE endpoints give it (see
 * {@link StreamElement}).
 *
 * - `event`: the event's name, `"message"` when the server sends none.
 * - `id`: the last event ID the server sent, which carries over to the
 *   events after it, or `undefined`.
 * - `data`: the event's data, decoded with `output`: as JSON, or as text
 *   with `Fetch.text()`. Without `output`, the text as it was sent.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Schema from "effect/Schema";
 * import * as Stream from "effect/Stream";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const Progress = Schema.Struct({ percent: Schema.Finite });
 *
 * const logProgress = (api: Fetch.Client) =>
 *   api.sse("/jobs/1/events", { output: Progress }).pipe(
 *     Stream.runForEach((event: Fetch.SseEvent<{ readonly percent: number }>) =>
 *       Effect.log(`${event.event}: ${event.data.percent}%`),
 *     ),
 *   );
 * ```
 *
 * @since 0.1.0
 */
export interface SseEvent<A> {
	/** The event's name, `"message"` when the server sends none. */
	readonly event: string;
	/** The last event ID the server sent, or `undefined`. */
	readonly id: string | undefined;
	/** The event's data, decoded with `output`. */
	readonly data: A;
}

/**
 * What a stream in format `St` gives for each value, with the `output`
 * schema `O`:
 *
 * - `"sse"`: an {@link SseEvent} whose `data` has `O`'s type, or is a
 *   `string` without `output`;
 * - `"ndjson"`: `O`'s type, or `unknown` (the parsed JSON) without
 *   `output`.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type { Fetch } from "@monarcode/effetch";
 *
 * const Row = Schema.Struct({ id: Schema.Finite });
 *
 * type Event = Fetch.StreamElement<"sse", typeof Row>;
 * //   ^? SseEvent<{ readonly id: number }>
 * type Line = Fetch.StreamElement<"ndjson", typeof Row>;
 * //   ^? { readonly id: number }
 * ```
 *
 * @since 0.1.0
 */
export type StreamElement<
	St extends StreamFormat,
	O extends AnySchema | undefined,
> = St extends "sse"
	? SseEvent<[O] extends [AnySchema] ? O["Type"] : string>
	: [O] extends [AnySchema]
		? O["Type"]
		: unknown;

/**
 * The options of `api.sse` and `api.ndjson`: those of a call, without
 * `responseMode`, and with `method`.
 *
 * - `method`: the request's method. Defaults to `"GET"`. Streaming APIs
 *   that take a request body, such as those of language models, use
 *   `"POST"`. `GET`, `HEAD`, `OPTIONS` and `TRACE` take no `body` or `input`.
 * - `output`: decodes each value (see {@link StreamElement}). `Fetch.text()`
 *   gives each value's text; `Fetch.bytes()` can't be used.
 * - `params`, `query`, `headers`, `body`, `input`, `error`, `statusErrors`
 *   and `plugins`: as for any call.
 *
 * The type parameters are those of `RequestOptions`, and `M`, the
 * request's method.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type { Fetch } from "@monarcode/effetch";
 *
 * const Prompt = Schema.Struct({ prompt: Schema.String });
 *
 * const options: Fetch.StreamOptions<"/completions", undefined, Schema.Unknown, typeof Prompt, []> = {
 *   method: "POST",
 *   input: Prompt,
 *   body: { prompt: "Hello" },
 * };
 * ```
 *
 * @since 0.1.0
 */
export type StreamOptions<
	P extends string,
	O extends AnySchema | undefined,
	EB extends AnySchema,
	I extends AnySchema,
	Ps extends ReadonlyArray<Plugin.Any>,
	Q extends QueryOf<Q> = QueryInput,
	SE extends StatusErrorMap | undefined = undefined,
	M extends HttpMethod.HttpMethod = HttpMethod.HttpMethod,
> = ParamsOption<P> &
	Omit<BaseOptions<O, EB, Ps, Q, SE>, "responseMode"> &
	([M] extends [HttpMethod.HttpMethod.NoBody]
		? {
				/** This method takes no body. */
				readonly body?: undefined;
				/** This method takes no body. */
				readonly input?: undefined;
			}
		: BodyOptions<I>) & {
		/** The request's method. Defaults to `"GET"`. */
		readonly method?: M | undefined;
		/** Can't be used with a stream. */
		readonly responseMode?: undefined;
	} & ([O] extends [BytesSchema]
		? {
				/** `Fetch.bytes()` can't decode a stream's values. */
				readonly output?: never;
			}
		: {});

/**
 * The signature of `api.sse` and `api.ndjson`: sends a request, and gives
 * its response body as a `Stream` of values in format `St`, each a
 * {@link StreamElement}. It takes {@link StreamOptions}.
 *
 * - `St`: the {@link StreamFormat}.
 * - `Ps`: the client's plugins.
 * - `DefaultEB`: the client's `defaultError` schema.
 * - `ClientSE`: the client's `statusErrors` map, or `undefined`.
 *
 * The stream fails with `NetworkError` when no response arrives,
 * `HttpError` or a `statusErrors` error for an error status, and the
 * plugins' errors, as a call does, before it gives anything. Once it has
 * started, it fails with a `DecodeError` when a value doesn't match
 * `output`, or the body can't be read to the end, after the values before
 * it. A `204` or `205` response gives an empty stream.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type { Fetch } from "@monarcode/effetch";
 *
 * declare const ndjson: Fetch.StreamMethod<"ndjson", [], Schema.Unknown>;
 *
 * const Row = Schema.Struct({ id: Schema.Finite });
 * const rows = ndjson("/export", { output: Row });
 * ```
 *
 * @since 0.1.0
 */
export interface StreamMethod<
	St extends StreamFormat,
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
		M extends HttpMethod.HttpMethod = "GET",
	>(
		path: P,
		...args: Args<P, StreamOptions<P, O, EB, I, Ps, Q, SE, M>>
	): Stream.Stream<
		StreamElement<St, O>,
		// CallError and CallServices, written out (see CallEffect), with
		// DecodeError always: reading the stream can fail.
		| NetworkError
		| HttpError.With<EB["Type"]>
		| DecodeError
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
