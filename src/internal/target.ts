import * as Url from "effect/http/Url";
import type * as UrlParams from "effect/http/UrlParams";
import * as Result from "effect/Result";

import type { QueryInput } from "../Options.js";
import type { PathParamValue } from "../Path.js";
import { interpolatePath } from "./path.js";
import { toUrlParams } from "./query.js";
import { errorUrl, isAbsoluteUrl, joinUrl } from "./url.js";

/** Where a call sends its request: the path, params filled in, and query. */
export interface Target {
	readonly path: string;
	readonly urlParams: UrlParams.UrlParams;
}

/**
 * The path and query a call sends to, from its `params` and its `query`
 * (already encoded with a query schema, if any). The call and
 * `endpoint.url` both build their URL from this.
 *
 * Throws if a param is missing (see `interpolatePath`).
 */
export const requestTarget = (
	path: string,
	params: { readonly [name: string]: PathParamValue } | undefined,
	query: QueryInput | undefined,
): Target => ({
	path: interpolatePath(path, params),
	urlParams: toUrlParams(query),
});

/** Stands in for the origin of a relative URL, and is removed afterwards. */
const placeholderOrigin = "http://effetch.invalid";

/**
 * The URL of `target`, after `baseUrl`, as `endpoint.url` gives it.
 *
 * It's built as the call's URL is: the client joins `baseUrl` and the path
 * (`joinUrl`), then Effect's `HttpClient` makes the URL with `Url.make`,
 * which resolves `.` and `..` segments and serializes the whole query
 * string. Using `Url.make` here too keeps the two equal; it uses `URL`, as
 * every call does. A relative URL (no `baseUrl`) is made against a
 * placeholder origin, which is then removed, so it stays relative in every
 * runtime, browsers included.
 *
 * Throws when the URL can't be made.
 */
export const targetUrl = (
	baseUrl: string | undefined,
	target: Target,
): string => {
	const url = joinUrl(baseUrl, target.path);
	// A relative URL that doesn't start with `/` (a `baseUrl` such as `api`)
	// gets one after the placeholder, removed with it.
	const prefix = isAbsoluteUrl(url)
		? ""
		: url.startsWith("/")
			? placeholderOrigin
			: `${placeholderOrigin}/`;
	const result = Url.make(prefix + url, target.urlParams, undefined);
	if (Result.isFailure(result)) {
		throw new Error(`Invalid URL: ${errorUrl(url)}`, {
			cause: result.failure,
		});
	}
	return result.success.href.slice(prefix.length);
};
