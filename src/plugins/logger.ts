import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpClient from "effect/http/HttpClient";

import { errorUrl } from "../internal/url.js";
import { type Plugin, plugin } from "../Plugin.js";

/**
 * Options for {@link logger}.
 *
 * - `level`: the log level of every entry, `"Debug"` (the default) or
 *   `"Info"`. Effect's default logger hides Debug entries unless the
 *   minimum log level allows them.
 *
 * @example
 * ```ts
 * import type { LoggerOptions } from "@monarcode/effetch/plugins";
 *
 * const options: LoggerOptions = { level: "Info" };
 * ```
 *
 * @since 0.1.0
 */
export interface LoggerOptions {
	/** The level of every entry. Defaults to `"Debug"`. */
	readonly level?: "Debug" | "Info" | undefined;
}

/**
 * The plugin made by {@link logger}. Calls can only skip it
 * (`plugins: { logger: false }`).
 *
 * @example
 * ```ts
 * import { logger, type LoggerPlugin } from "@monarcode/effetch/plugins";
 *
 * const log: LoggerPlugin = logger();
 * ```
 *
 * @since 0.1.0
 */
export type LoggerPlugin = Plugin<"logger">;

/**
 * Logs one entry per call with Effect's logger: the method, the URL, the
 * status and how long the response took, e.g.
 * `GET https://api.example.com/todos 200 (35ms)`, or `… failed (35ms)`
 * with the failure's cause.
 *
 * The same values are log annotations (`method`, `url`, `status`,
 * `durationMs`), along with `route`: the call's method and unfilled path,
 * such as `GET /users/:id`, the same for every call to that path, to group
 * entries by (left out for requests sent through `client.httpClient`). The
 * URL has no query string, and no headers are logged, so tokens and
 * cookies stay out of logs. The duration is measured with
 * Effect's `Clock` until the response headers arrive, in whole
 * milliseconds.
 *
 * Put it first in the plugin list, so it sees the whole call, retries
 * included.
 *
 * @example
 * ```ts
 * import * as Fetch from "@monarcode/effetch";
 * import { logger } from "@monarcode/effetch/plugins";
 *
 * const makeApi = Fetch.make({
 *   baseUrl: "https://api.example.com",
 *   plugins: [logger({ level: "Info" })],
 * });
 * ```
 *
 * @since 0.1.0
 */
export const logger = (options: LoggerOptions = {}): LoggerPlugin => {
	const log = options.level === "Info" ? Effect.logInfo : Effect.logDebug;
	return plugin({
		name: "logger",
		wrap: (client, _options, currentRoute) =>
			HttpClient.transform(client, (response, request) =>
				Effect.gen(function* () {
					const start = yield* Clock.currentTimeMillis;
					const exit = yield* Effect.exit(response);
					const durationMs = Math.round(
						(yield* Clock.currentTimeMillis) - start,
					);
					const method = request.method;
					const url = errorUrl(request.url);
					const route = yield* currentRoute;
					const call = route === undefined ? {} : { route };
					if (Exit.isSuccess(exit)) {
						const { status } = exit.value;
						yield* Effect.annotateLogs(
							log(`${method} ${url} ${status} (${durationMs}ms)`),
							{ method, url, ...call, status, durationMs },
						);
					} else if (!Cause.hasInterruptsOnly(exit.cause)) {
						yield* Effect.annotateLogs(
							log(
								`${method} ${url} failed (${durationMs}ms)`,
								exit.cause,
							),
							{ method, url, ...call, durationMs },
						);
					}
					return yield* exit;
				}),
			),
	});
};
