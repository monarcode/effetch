import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as Schema from "effect/Schema";

import { errorUrl } from "../internal/url.js";
import { type Plugin, plugin } from "../Plugin.js";

/**
 * No response arrived within the {@link timeout} plugin's duration. The
 * request was aborted.
 *
 * - `url` is the request URL without its query string.
 * - `duration` is the limit that was exceeded, formatted (`"10s"`).
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import type { TimeoutError } from "@monarcode/effetch/plugins";
 *
 * declare const call: Effect.Effect<string, TimeoutError>;
 *
 * const program = call.pipe(
 *   Effect.catchTag("TimeoutError", (error) =>
 *     Effect.succeed(`Gave up on ${error.url} after ${error.duration}`),
 *   ),
 * );
 * ```
 *
 * @since 0.1.0
 */
export class TimeoutError extends Schema.TaggedError<TimeoutError>()(
	"TimeoutError",
	{
		method: Schema.String,
		url: Schema.String,
		duration: Schema.String,
	},
) {
	/** `"<method> <url>: timed out after <duration>"`. */
	override get message(): string {
		return `${this.method} ${this.url}: timed out after ${this.duration}`;
	}
}

/**
 * Options for {@link timeout}, and what a call can override:
 * `plugins: { timeout: { duration } }`.
 *
 * @example
 * ```ts
 * import type { TimeoutOptions } from "@monarcode/effetch/plugins";
 *
 * const options: TimeoutOptions = { duration: "10 seconds" };
 * ```
 *
 * @since 0.1.0
 */
export interface TimeoutOptions {
	/** How long to wait for the response headers. */
	readonly duration: Duration.Input;
}

/**
 * The plugin made by {@link timeout}: it adds {@link TimeoutError}, and
 * calls can override its `duration` or skip it.
 *
 * @example
 * ```ts
 * import { timeout, type TimeoutPlugin } from "@monarcode/effetch/plugins";
 *
 * const tenSeconds: TimeoutPlugin = timeout({ duration: "10 seconds" });
 * ```
 *
 * @since 0.1.0
 */
export type TimeoutPlugin = Plugin<
	"timeout",
	TimeoutError,
	never,
	TimeoutOptions
>;

/**
 * Fails the call with a {@link TimeoutError}, and aborts the request, when
 * the response headers don't arrive within `duration`.
 *
 * It covers the plugins after it in the list, but not reading the body: a
 * large response that starts in time isn't cut off while it downloads.
 * Put it after `retry` so each attempt gets the full duration. A timed-out
 * attempt isn't retried.
 *
 * @example
 * ```ts
 * import * as Fetch from "@monarcode/effetch";
 * import { timeout } from "@monarcode/effetch/plugins";
 *
 * const make = Fetch.make({
 *   baseUrl: "https://api.example.com",
 *   plugins: [timeout({ duration: "10 seconds" })],
 * });
 *
 * // Per call:
 * // api.get("/export", { plugins: { timeout: { duration: "2 minutes" } } })
 * ```
 *
 * @since 0.1.0
 */
export const timeout = (options: TimeoutOptions): TimeoutPlugin =>
	plugin({
		name: "timeout",
		defaults: { duration: options.duration },
		wrap: (client, callOptions) =>
			HttpClient.transform(client, (response, request) =>
				Effect.gen(function* () {
					const { duration } = yield* callOptions;
					return yield* Effect.timeoutOrElse(response, {
						duration,
						orElse: () =>
							Effect.fail(
								new TimeoutError({
									method: request.method,
									url: errorUrl(request.url),
									duration: Duration.format(
										Duration.fromInputUnsafe(duration),
									),
								}),
							),
					});
				}),
			),
	});
