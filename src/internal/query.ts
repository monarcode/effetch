import * as UrlParams from "effect/http/UrlParams";
import * as Redacted from "effect/Redacted";

import type { QueryInput } from "../Options.js";

/** One query value as `UrlParams` holds it. */
type Param = UrlParams.UrlParams["params"][number][1];

/**
 * A `Redacted` value is kept as it is (Effect 4.1 accepts them in
 * `UrlParams`, unwraps them for the URL and redacts them in its own logs);
 * anything else goes through `String()`.
 *
 * The cast compiles with Effect 4.0 too, where `Param` is `string`. There,
 * only a value cast to `QueryValue` can be `Redacted`, and Effect 4.0 sends
 * it as `<redacted>`, as before 4.1.
 */
const toParam = (value: unknown): Param =>
	(Redacted.isRedacted(value) ? value : String(value)) as Param;

/**
 * Converts the `query` option into `UrlParams`, in key order. Arrays repeat
 * the key; `null` and `undefined` values and array items are dropped.
 *
 * Deliberately not `UrlParams.fromInput(query)`: that sends a `null` value
 * as the string `"null"` and keeps `null` array items.
 */
export const toUrlParams = (
	query: QueryInput | undefined,
): UrlParams.UrlParams => {
	const entries: Array<readonly [string, Param]> = [];
	if (query !== undefined) {
		for (const [key, value] of Object.entries(query)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item !== null && item !== undefined) {
						entries.push([key, toParam(item)]);
					}
				}
			} else if (value !== null && value !== undefined) {
				entries.push([key, toParam(value)]);
			}
		}
	}
	return UrlParams.make(entries);
};
