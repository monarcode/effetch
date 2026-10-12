import * as Headers from "effect/http/Headers";
import * as Schema from "effect/Schema";

/**
 * The request never produced a response: DNS failure, connection refused,
 * CORS rejection, the device is offline, and so on.
 *
 * `cause` is the underlying error from the platform's HTTP client.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Fetch from "@monarcode/effetch";
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
		cause: Schema.Unknown,
	},
) {
	/** `"<method> <url>: network error"`. */
	override get message(): string {
		return `${this.method} ${this.url}: network error`;
	}
}

/**
 * The server answered with a non-2xx status.
 *
 * Only 2xx counts as success, as in `fetch`'s `response.ok`. 3xx is an
 * error too: `fetch` follows redirects itself, so a 3xx only reaches you
 * with `redirect: "manual"` or a conditional request answered with
 * `304 Not Modified`. Catch it by `status` if you expect one.
 *
 * - `url` is the request URL without its query string, so secrets in query
 *   parameters stay out of logs.
 * - `headers` are the response headers. They're Effect `Headers`, so
 *   sensitive ones (`set-cookie`, `authorization`, …) print as
 *   `<redacted>` when the error is logged or serialised.
 * - `text` is always the raw response body (`""` if it couldn't be read).
 * - `body` is the body decoded with the call's (or client's) `error` schema,
 *   or `undefined` if it didn't match. Without an `error` schema, `body` is
 *   the parsed JSON when `text` is valid JSON, else `undefined`. An empty
 *   body is always `undefined`. Reading `body` never fails the call.
 *
 * Use {@link HttpError.With} for the type of an `HttpError` whose `body` was
 * decoded with a known schema.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Fetch from "@monarcode/effetch";
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
	headers: Schema.declare(Headers.isHeaders),
	text: Schema.String,
	body: Schema.Unknown,
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
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type NotFound = Fetch.HttpError.With<{ readonly resource: string }>;
 * ```
 *
 * @since 0.1.0
 */
export declare namespace HttpError {
	/**
	 * An {@link HttpError} whose `body` was decoded as `B`. `body` is
	 * `undefined` when the response didn't match the error schema.
	 *
	 * @example
	 * ```ts
	 * import type * as Fetch from "@monarcode/effetch";
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
 * A 2xx response body didn't match the call's `output` schema, wasn't valid
 * JSON, or couldn't be read.
 *
 * `issue` is what went wrong and `message` is a readable summary of it:
 *
 * - the schema issue when the body doesn't match `output`,
 * - the `SyntaxError` when the body isn't valid JSON,
 * - the `HttpClientError` when the body couldn't be read.
 *
 * An empty body (204, HEAD, …) is decoded as JSON `null`, so it only
 * passes schemas that accept nothing, such as `Schema.Void`.
 *
 * `url` is the request URL without its query string.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Fetch from "@monarcode/effetch";
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
		issue: Schema.Unknown,
		message: Schema.String,
	},
) {}

/**
 * Every error the library itself can fail a call with. Plugins may add
 * their own errors on top of these.
 *
 * @example
 * ```ts
 * import * as Fetch from "@monarcode/effetch";
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
 * Returns `true` if `u` is a {@link NetworkError}, {@link HttpError} or
 * {@link DecodeError}.
 *
 * @example
 * ```ts
 * import * as Fetch from "@monarcode/effetch";
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
