import * as UrlParams from "effect/http/UrlParams";
import * as Redacted from "effect/Redacted";

import type * as Fetch from "../../src/index.js";

/**
 * A `Redacted` query value. Effect 4.1's types accept one, but CI also runs
 * the tests with Effect 4.0, the oldest supported version, whose types don't.
 */
export const redacted = (value: string): Fetch.QueryValue =>
	Redacted.make(value) as never;

/**
 * Whether the installed Effect sends a `Redacted` query value as its value
 * (4.1 and later). Effect 4.0 sends `<redacted>`.
 */
export const supportsRedactedQuery =
	UrlParams.toString(
		UrlParams.make([["key", Redacted.make("value") as never]]),
	) === "key=value";
