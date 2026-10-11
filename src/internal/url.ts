const absoluteUrl = /^https?:\/\//i;

/**
 * True for `http://` and `https://` URLs only. Protocol-relative (`//host`)
 * and other schemes are treated as paths, so a request can't switch host or
 * protocol by accident.
 */
export const isAbsoluteUrl = (path: string): boolean => absoluteUrl.test(path);

/**
 * Joins `base` and `path` with exactly one `/`. An absolute `path` (see
 * `isAbsoluteUrl`) is returned unchanged, as is any `path` when there's no
 * `base`. Uses string operations, not `new URL()`, for React Native.
 */
export const joinUrl = (base: string | undefined, path: string): string =>
	base === undefined || isAbsoluteUrl(path)
		? path
		: base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");

/**
 * `url` without its query string or fragment, so secrets such as
 * `?api_key=…` never reach error messages or logs.
 */
export const errorUrl = (url: string): string => url.split(/[?#]/, 1)[0] ?? "";

/** True if `url` contains a query string or a fragment. */
export const hasQueryOrFragment = (url: string): boolean => /[?#]/.test(url);
