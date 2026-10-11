import * as UrlParams from "effect/http/UrlParams";

import type { QueryInput } from "../Options.js";

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
	const entries: Array<readonly [string, string]> = [];
	if (query !== undefined) {
		for (const [key, value] of Object.entries(query)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item !== null && item !== undefined) {
						entries.push([key, String(item)]);
					}
				}
			} else if (value !== null && value !== undefined) {
				entries.push([key, String(value)]);
			}
		}
	}
	return UrlParams.make(entries);
};
