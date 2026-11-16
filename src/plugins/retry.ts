import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as HttpMethod from "effect/http/HttpMethod";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import { NetworkError } from "../Errors.js";
import { errorUrl } from "../internal/url.js";
import { type Plugin, plugin } from "../Plugin.js";
import { TimeoutError } from "./timeout.js";

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
 * - `retryAfter`: whether to wait as long as a retried response's
 *   `Retry-After` header asks, in place of the schedule's next delay.
 *   `true` caps the wait at 1 minute, and `{ max }` at `max`. Defaults to
 *   `false`.
 *
 * For a time limit on the whole call, see {@link RetryBudgetOptions}.
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
 *   retryAfter: { max: "30 seconds" },
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
	/** Wait as `Retry-After` asks, up to 1 minute or `max`. Defaults to `false`. */
	readonly retryAfter?: boolean | { readonly max: Duration.Input } | undefined;
}

/**
 * Options for {@link retry} with a time limit for the whole call:
 * {@link RetryOptions}, plus `budget`.
 *
 * `budget` is how long the call may take, every attempt and every wait
 * between them included. Calls can override it.
 *
 * - When the budget runs out during an attempt, the attempt is
 *   interrupted, and the call fails with `TimeoutError`.
 * - When the wait before the next retry would end at or after the budget,
 *   no more retries are made: the call ends with its last response or
 *   `NetworkError`, as when the retries run out.
 *
 * Options whose `budget` may be `undefined` also give a
 * {@link RetryBudgetPlugin}: there's no limit until a call sets one.
 *
 * @example
 * ```ts
 * import type { RetryBudgetOptions } from "@monarcode/effetch/plugins";
 *
 * const options: RetryBudgetOptions = { times: 5, budget: "30 seconds" };
 * ```
 *
 * @since 0.1.0
 */
export interface RetryBudgetOptions extends RetryOptions {
	/** How long the whole call may take, retries and waits included. */
	readonly budget?: Duration.Input | undefined;
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

/**
 * The plugin made by {@link retry} with a `budget`. It fails with
 * `TimeoutError` when the budget runs out during an attempt. Calls can
 * override `times` and `budget`, or skip it.
 *
 * @example
 * ```ts
 * import { retry, type RetryBudgetPlugin } from "@monarcode/effetch/plugins";
 *
 * const withBudget: RetryBudgetPlugin = retry({ budget: "30 seconds" });
 * ```
 *
 * @since 0.1.0
 */
export type RetryBudgetPlugin = Plugin<
	"retry",
	TimeoutError,
	never,
	{ readonly times: number; readonly budget: Duration.Input }
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

const httpDate = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,? /i;

/**
 * How long a response's `Retry-After` header asks to wait, in
 * milliseconds, given the current time: whole seconds, or an HTTP date.
 * `undefined` when there's no header, or it can't be read.
 */
const retryAfterMillis = (
	response: HttpClientResponse.HttpClientResponse,
	now: number,
): number | undefined => {
	const value = Option.getOrUndefined(
		Headers.get(response.headers, "retry-after"),
	);
	if (value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	if (/^\d+$/.test(trimmed)) {
		return Number(trimmed) * 1000;
	}
	// Every HTTP-date form starts with the day's name. Anything else, such
	// as "1.5", isn't given to Date.parse, which reads some numbers as dates.
	if (!httpDate.test(trimmed)) {
		return undefined;
	}
	const date = Date.parse(trimmed);
	return Number.isNaN(date) ? undefined : Math.max(0, date - now);
};

/**
 * The wait a retried response's `Retry-After` header asks for, capped at
 * `max`, or `undefined` to keep the schedule's delay.
 */
const afterHeader = (
	input: unknown,
	now: number,
	max: number,
): number | undefined => {
	if (!(input instanceof RetryableStatus)) {
		return undefined;
	}
	const wait = retryAfterMillis(input.response, now);
	return wait === undefined ? undefined : Math.min(wait, max);
};

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
 * With `retryAfter`, a retried response that says how long to wait
 * (`Retry-After: 120`, or an HTTP date) is retried after that long,
 * capped, rather than after the schedule's delay.
 *
 * To limit the whole call, retries and waits included, pass a `budget`
 * (see {@link RetryBudgetOptions}).
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
 *
 * // Wait as Retry-After asks, up to 30 seconds.
 * const makeOtherApi = Fetch.make({
 *   baseUrl: "https://api.example.com",
 *   plugins: [retry({ times: 5, retryAfter: { max: "30 seconds" } })],
 * });
 * ```
 *
 * @since 0.1.0
 */
export function retry(
	options?: RetryOptions & { readonly budget?: undefined },
): RetryPlugin;
/**
 * Retries a call that failed with a `NetworkError` or got a retryable
 * status, as {@link retry} without a budget does, within a time limit for
 * the whole call: `budget`, every attempt and wait included.
 *
 * - No retry is made when its wait would end at or after the budget: the call
 *   ends with its last response or `NetworkError`, as when the retries run
 *   out.
 * - When the budget runs out during an attempt, the attempt is interrupted,
 *   and the call fails with `TimeoutError`.
 * - The budget also limits calls that aren't retried, such as a `POST`, or
 *   a call with `times: 0`.
 *
 * Calls can override `times` and `budget`, or skip the plugin. Use
 * `timeout` too to limit each attempt.
 *
 * @example
 * ```ts
 * import * as Fetch from "@monarcode/effetch";
 * import { retry, timeout } from "@monarcode/effetch/plugins";
 *
 * // 10 seconds per attempt, 30 seconds in all.
 * const makeApi = Fetch.make({
 *   baseUrl: "https://api.example.com",
 *   plugins: [
 *     retry({ times: 5, budget: "30 seconds" }),
 *     timeout({ duration: "10 seconds" }),
 *   ],
 * });
 *
 * // Per call: api.get("/report", { plugins: { retry: { budget: "2 minutes" } } })
 * ```
 *
 * @since 0.1.0
 */
export function retry(options: RetryBudgetOptions): RetryBudgetPlugin;
export function retry(
	options: RetryOptions & {
		readonly budget?: Duration.Input | undefined;
	} = {},
): RetryPlugin | RetryBudgetPlugin {
	const methods = new Set<string>(options.methods ?? idempotentMethods);
	const statuses = new Set(options.statuses ?? transientStatuses);
	const base =
		options.schedule ?? Schedule.jittered(Schedule.exponential("200 millis"));
	const maxRetryAfter =
		options.retryAfter === undefined || options.retryAfter === false
			? undefined
			: Duration.toMillis(
					Duration.fromInputUnsafe(
						options.retryAfter === true
							? "1 minute"
							: options.retryAfter.max,
					),
				);
	const schedule =
		maxRetryAfter === undefined
			? base
			: Schedule.modifyDelay(base, ({ input, duration, now }) =>
					Effect.succeed(
						afterHeader(input, now, maxRetryAfter) ?? duration,
					),
				);
	const defaults =
		options.budget === undefined
			? { times: options.times ?? 2 }
			: { times: options.times ?? 2, budget: options.budget };
	return plugin({
		name: "retry",
		defaults: defaults as {
			readonly times: number;
			readonly budget: Duration.Input;
		},
		wrap: (client, callOptions) =>
			HttpClient.transform(client, (response, request) =>
				Effect.gen(function* () {
					const { times, budget } = yield* callOptions;
					const retrying = times > 0 && methods.has(request.method);
					if (!retrying && budget === undefined) {
						return yield* response;
					}
					const attempt = Effect.flatMap(response, (received) =>
						statuses.has(received.status)
							? Effect.fail(new RetryableStatus({ response: received }))
							: Effect.succeed(received),
					);
					const budgetMillis =
						budget === undefined
							? undefined
							: Duration.toMillis(Duration.fromInputUnsafe(budget));
					const start = yield* Clock.currentTimeMillis;
					// Stop before a wait that would end at or after the budget, which
					// would leave the next attempt no time.
					const bounded =
						budgetMillis === undefined
							? schedule
							: Schedule.while(
									schedule,
									({ now, duration }) =>
										now - start + Duration.toMillis(duration) <
										budgetMillis,
								);
					const retried = retrying
						? attempt.pipe(
								Effect.retry({
									schedule: bounded,
									times,
									while: (error) =>
										error instanceof RetryableStatus ||
										error instanceof NetworkError,
								}),
								Effect.catchTag("RetryableStatus", (error) =>
									Effect.succeed(error.response),
								),
							)
						: response;
					return yield* budgetMillis === undefined
						? retried
						: Effect.timeoutOrElse(retried, {
								duration: Duration.millis(budgetMillis),
								orElse: () =>
									Effect.fail(
										new TimeoutError({
											method: request.method,
											url: errorUrl(request.url),
											duration: Duration.format(
												Duration.millis(budgetMillis),
											),
										}),
									),
							});
				}),
			),
	});
}
