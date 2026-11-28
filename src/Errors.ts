import * as Headers from "effect/http/Headers";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

// The errors encode to JSON, so they can cross to a browser, a worker or an
// RPC client, and decode back into the same classes. What isn't safe or
// isn't JSON stays behind: these fields aren't encoded. Decoding never
// fails on them, so values built in memory still decode as before.

/**
 * `HttpError.headers`: never sent, so `set-cookie` and the like stay put.
 * Anything but an Effect `Headers` value decodes as empty, so headers can't
 * be sent in either.
 */
const headersNotSent = Schema.optionalKey(Schema.Unknown).pipe(
	Schema.decodeTo(Schema.declare(Headers.isHeaders), {
		decode: SchemaGetter.transformOptional((headers) =>
			Option.some(
				Option.isSome(headers) && Headers.isHeaders(headers.value)
					? headers.value
					: Headers.empty,
			),
		),
		encode: SchemaGetter.omit(),
	}),
);

/**
 * `NetworkError.cause` and `DecodeError.issue`: platform values, not JSON,
 * so never sent. They decode as `undefined` when they're missing.
 */
const unknownNotSent = Schema.optionalKey(Schema.Unknown).pipe(
	Schema.decodeTo(Schema.Unknown, {
		decode: SchemaGetter.transformOptional((value) =>
			Option.some(Option.getOrUndefined(value)),
		),
		encode: SchemaGetter.omit(),
	}),
);

const isJson = Schema.is(Schema.Json);

/**
 * `HttpError.body`: sent when it's JSON, as it is without an error schema.
 * A body decoded into something else, such as a class, stays behind, and
 * decodes as `undefined`.
 */
const bodyAsJson = Schema.optionalKey(Schema.Unknown).pipe(
	Schema.decodeTo(Schema.Unknown, {
		decode: SchemaGetter.transformOptional((body) =>
			Option.some(Option.getOrUndefined(body)),
		),
		encode: SchemaGetter.transformOptional((body) =>
			Option.filter(body, (value) => value !== undefined && isJson(value)),
		),
	}),
);

/**
 * The error a call fails with when its request gets no response: a DNS
 * failure, a refused connection, a CORS rejection, a device that's offline,
 * and so on. Its fields:
 *
 * - `method`: the request's HTTP method.
 * - `url`: the request URL without its query string, so secrets in query
 *   parameters stay out of logs.
 * - `cause`: the underlying error from the platform's HTTP client.
 *
 * It encodes to JSON, as its schema: `Schema.toCodecJson(Fetch.NetworkError)`
 * sends `method` and `url`, and decodes a `NetworkError` whose `cause` is
 * `undefined`. So an RPC or a server-rendered page can fail with it.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { Fetch } from "@monarcode/effetch";
 *
 * declare const call: Effect.Effect<string, Fetch.FetchError>;
 *
 * const program = call.pipe(
 *   Effect.catchTag("NetworkError", (error) =>
 *     Effect.succeed(`Offline? ${error.method} ${error.url}`),
 *   ),
 * );
 * ```
 *
 * @since 0.1.0
 */
export class NetworkError extends Schema.TaggedError<NetworkError>()(
	"NetworkError",
	{
		method: Schema.String,
		url: Schema.String,
		cause: unknownNotSent,
	},
) {
	/** `"<method> <url>: network error"`. */
	override get message(): string {
		return `${this.method} ${this.url}: network error`;
	}
}

/**
 * The error a call fails with when the server answers with a status outside
 * 200–299. Its fields:
 *
 * - `method`: the request's HTTP method.
 * - `url`: the request URL without its query string, so secrets in query
 *   parameters stay out of logs.
 * - `status`: the response's status code.
 * - `headers`: the response headers. They're Effect `Headers`, so
 *   sensitive ones (`set-cookie`, `authorization`, …) print as
 *   `<redacted>` when the error is logged or passed to `JSON.stringify`.
 *   The error's JSON encoding leaves them out (see below).
 * - `text`: the raw response body, always (`""` if it couldn't be read).
 * - `body`: the body decoded with the call's `error` schema (or the
 *   client's `defaultError`), or `undefined` if it didn't match. Without an
 *   `error` schema, `body` is the parsed JSON when `text` is valid JSON,
 *   else `undefined`. An empty body is always `undefined`. Reading `body`
 *   never fails the call.
 *
 * Only 2xx counts as success, as in `fetch`'s `response.ok`. 3xx is an
 * error too: `fetch` follows redirects itself, so a 3xx only reaches you
 * with `redirect: "manual"` or a conditional request answered with
 * `304 Not Modified`. Catch it by `status` if you expect one.
 *
 * It encodes to JSON, as its schema, so an RPC or a server-rendered page
 * can fail with it: `Schema.toCodecJson(Fetch.HttpError)` sends `method`,
 * `url`, `status`, `text`, and `body` when it's JSON, and decodes an
 * `HttpError`. The headers are never sent, and decode as empty. A `body`
 * decoded into something other than JSON, such as a class, isn't sent
 * either.
 *
 * Use {@link HttpError.With} for the type of an `HttpError` whose `body` was
 * decoded with a known schema. To handle some statuses at a call, use
 * `Fetch.catchStatus` or `Fetch.optional`; to turn a status into your own
 * error for every call, use `statusErrors`.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { Fetch } from "@monarcode/effetch";
 *
 * declare const call: Effect.Effect<
 *   string,
 *   Fetch.HttpError.With<{ readonly code: string }>
 * >;
 *
 * const program = call.pipe(
 *   Effect.catchTag("HttpError", (error) =>
 *     error.status === 404
 *       ? Effect.succeed("not found")
 *       : Effect.fail(error.body?.code ?? `HTTP ${error.status}`),
 *   ),
 * );
 * ```
 *
 * @since 0.1.0
 */
export class HttpError extends Schema.TaggedError<HttpError>()("HttpError", {
	method: Schema.String,
	url: Schema.String,
	status: Schema.Finite,
	headers: headersNotSent,
	text: Schema.String,
	body: bodyAsJson,
}) {
	/** `"<method> <url>: HTTP <status>"`. */
	override get message(): string {
		return `${this.method} ${this.url}: HTTP ${this.status}`;
	}
}

/**
 * Types related to {@link HttpError}.
 *
 * @example
 * ```ts
 * import type { Fetch } from "@monarcode/effetch";
 *
 * type NotFound = Fetch.HttpError.With<{ readonly resource: string }>;
 * ```
 *
 * @since 0.1.0
 */
export declare namespace HttpError {
	/**
	 * An {@link HttpError} whose `body` was decoded as `B`. `body` is
	 * `undefined` when the response didn't match the error schema. A call
	 * with an `error` schema, or a client with a `defaultError`, fails with
	 * one. Without either, a call fails with a plain `HttpError`.
	 *
	 * @example
	 * ```ts
	 * import type { Fetch } from "@monarcode/effetch";
	 *
	 * type ApiHttpError = Fetch.HttpError.With<{ readonly code: string }>;
	 *
	 * const code = (error: ApiHttpError) => error.body?.code;
	 * ```
	 *
	 * @since 0.1.0
	 */
	export type With<B> = HttpError & { readonly body: B | undefined };
}

/**
 * The error a call fails with when a 2xx response body doesn't match the
 * call's `output` schema, isn't valid JSON, or can't be read, and the error
 * a stream fails with while it's read (see below). Its fields:
 *
 * - `method`: the request's HTTP method.
 * - `url`: the request URL without its query string.
 * - `status`: the response's status code.
 * - `issue`: what went wrong: the schema issue when the body doesn't match
 *   `output`, the `SyntaxError` when the body isn't valid JSON, or the
 *   `HttpClientError` when the body couldn't be read.
 * - `message`: a readable summary of `issue`.
 *
 * It encodes to JSON, as its schema: `Schema.toCodecJson(Fetch.DecodeError)`
 * sends every field but `issue`, and decodes a `DecodeError` whose `issue` is
 * `undefined`.
 *
 * An empty body (204, HEAD, …) is decoded as JSON `null`, so it only
 * passes schemas that accept nothing, such as `Schema.Void`. With
 * `Fetch.text(schema)`, an empty body fails too.
 *
 * A stream (`api.sse`, `api.ndjson` or a `stream` endpoint) fails with a
 * `DecodeError` while it's read: when an event's data or a line doesn't
 * decode (the message names it, as in `Line 3 doesn't match the output
 * schema`), when the body breaks off, and, for `api.sse`, when the
 * response's `Content-Type` isn't `text/event-stream`.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { Fetch } from "@monarcode/effetch";
 *
 * declare const call: Effect.Effect<string, Fetch.FetchError>;
 *
 * const program = call.pipe(
 *   Effect.catchTag("DecodeError", (error) =>
 *     Effect.succeed(`Unexpected response from ${error.url}: ${error.message}`),
 *   ),
 * );
 * ```
 *
 * @since 0.1.0
 */
export class DecodeError extends Schema.TaggedError<DecodeError>()(
	"DecodeError",
	{
		method: Schema.String,
		url: Schema.String,
		status: Schema.Finite,
		issue: unknownNotSent,
		message: Schema.String,
	},
) {}

/**
 * Every error the library itself can fail a call with. Plugins may add
 * their own errors on top of these.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 *
 * const describe = (error: Fetch.FetchError): string => {
 *   switch (error._tag) {
 *     case "NetworkError":
 *       return "Network unavailable";
 *     case "HttpError":
 *       return `Server error ${error.status}`;
 *     case "DecodeError":
 *       return "Unexpected response";
 *   }
 * };
 * ```
 *
 * @since 0.1.0
 */
export type FetchError = NetworkError | HttpError | DecodeError;

/**
 * Checks whether `u` is a {@link NetworkError}, {@link HttpError} or
 * {@link DecodeError}: `true` if it is, `false` otherwise.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 *
 * const report = (error: unknown) => {
 *   if (Fetch.isFetchError(error)) {
 *     console.error(error._tag, error.url);
 *   }
 * };
 * ```
 *
 * @since 0.1.0
 */
export const isFetchError = (u: unknown): u is FetchError =>
	u instanceof NetworkError ||
	u instanceof HttpError ||
	u instanceof DecodeError;
