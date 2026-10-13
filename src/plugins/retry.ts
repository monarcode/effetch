import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as HttpMethod from "effect/http/HttpMethod";
import * as Schedule from "effect/Schedule";

import { NetworkError } from "../Errors.js";
import { type Plugin, plugin } from "../Plugin.js";

/**
 * Options for {@link retry}.
 *
 * - `times`: how many times to retry, after the first attempt. Defaults to
 *   `2`. Calls can override it.
 * - `schedule`: the delays between attempts. Defaults to an exponential
 *   backoff from 200ms, with jitter. `times` still caps the retries.
 * - `methods`: the methods that are retried. Defaults to the idempotent
 *   ones: `GET`, `HEAD`, `OPTIONS`, `PUT` and `DELETE`.
 * - `statuses`: the response statuses that are retried. Defaults to `408`,
 *   `429`, `500`, `502`, `503` and `504`.
 *
 * @example
 * ```ts
 * import * as Schedule from "effect/Schedule";
 * import type { RetryOptions } from "@monarcode/effetch/plugins";
 *
 * const options: RetryOptions = {
 *   times: 3,
 *   schedule: Schedule.spaced("1 second"),
 *   methods: ["GET"],
 *   statuses: [503],
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface RetryOptions {
	/** How many times to retry after the first attempt. Defaults to `2`. */
	readonly times?: number | undefined;
	/** The delays between attempts. Defaults to jittered exponential backoff. */
	readonly schedule?: Schedule.Schedule<unknown, unknown> | undefined;
	/** The methods that are retried. Defaults to the idempotent ones. */
	readonly methods?: ReadonlyArray<HttpMethod.HttpMethod> | undefined;
	/** The statuses that are retried. Defaults to 408, 429, 500, 502–504. */
	readonly statuses?: ReadonlyArray<number> | undefined;
}

/**
 * The plugin made by {@link retry}. It adds no errors; calls can override
 * `times` or skip it.
 *
 * @example
 * ```ts
 * import { retry, type RetryPlugin } from "@monarcode/effetch/plugins";
 *
 * const retryTwice: RetryPlugin = retry();
 * ```
 *
 * @since 0.1.0
 */
export type RetryPlugin = Plugin<
	"retry",
	never,
	never,
	{ readonly times: number }
>;

const idempotentMethods: ReadonlyArray<HttpMethod.HttpMethod> = [
	"GET",
	"HEAD",
	"OPTIONS",
	"PUT",
	"DELETE",
];

const transientStatuses: ReadonlyArray<number> = [408, 429, 500, 502, 503, 504];

class RetryableStatus extends Data.TaggedError("RetryableStatus")<{
	readonly response: HttpClientResponse.HttpClientResponse;
}> {}

/**
 * Retries a call that failed with a `NetworkError` or got a retryable
 * status, for the configured methods only (idempotent ones by default, so
 * a `POST` is never sent twice).
 *
 * When the retries run out, the last response is returned unchanged, so a
 * `503` still ends as an `HttpError` with that response's body, and the
 * last `NetworkError` is the call's error. Other failures, a timeout from
 * the `timeout` plugin included, aren't retried.
 *
 * It retries everything after it in the plugin list. Put it before
 * `timeout` and `bearer`, so each attempt gets its own time limit and a
 * fresh token.
 *
 * @example
 * ```ts
 * import * as Fetch from "@monarcode/effetch";
 * import { retry } from "@monarcode/effetch/plugins";
 *
 * const makeApi = Fetch.make({
 *   baseUrl: "https://api.example.com",
 *   plugins: [retry({ times: 3 })],
 * });
 *
 * // Per call: api.get("/health", { plugins: { retry: { times: 0 } } })
 * ```
 *
 * @since 0.1.0
 */
export const retry = (options: RetryOptions = {}): RetryPlugin => {
	const methods = new Set<string>(options.methods ?? idempotentMethods);
	const statuses = new Set(options.statuses ?? transientStatuses);
	const schedule =
		options.schedule ?? Schedule.jittered(Schedule.exponential("200 millis"));
	return plugin({
		name: "retry",
		defaults: { times: options.times ?? 2 },
		wrap: (client, callOptions) =>
			HttpClient.transform(client, (response, request) =>
				Effect.gen(function* () {
					const { times } = yield* callOptions;
					if (!(times > 0) || !methods.has(request.method)) {
						return yield* response;
					}
					const attempt = Effect.flatMap(response, (received) =>
						statuses.has(received.status)
							? Effect.fail(new RetryableStatus({ response: received }))
							: Effect.succeed(received),
					);
					return yield* attempt.pipe(
						Effect.retry({
							schedule,
							times,
							while: (error) =>
								error instanceof RetryableStatus ||
								error instanceof NetworkError,
						}),
						Effect.catchTag("RetryableStatus", (error) =>
							Effect.succeed(error.response),
						),
					);
				}),
			),
	});
};
