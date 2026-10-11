import type { PathParamValue } from "../Path.js";

const hasOwn = (object: object, key: string): boolean =>
	Object.prototype.hasOwnProperty.call(object, key);

/**
 * Replaces each `:name` segment of `path` with the URI-encoded value of
 * `params[name]`. Splits on `/` exactly like `PathParamNames`, so the
 * runtime and the types agree.
 *
 * Only own properties of `params` count, so `:constructor` or `:toString`
 * never pick up inherited members.
 *
 * Throws if a parameter is missing. Callers run it inside an Effect, where
 * the throw becomes a defect.
 */
export const interpolatePath = (
	path: string,
	params: { readonly [name: string]: PathParamValue } | undefined,
): string =>
	path
		.split("/")
		.map((segment) => {
			if (segment.length < 2 || !segment.startsWith(":")) {
				return segment;
			}
			const name = segment.slice(1);
			if (params === undefined || !hasOwn(params, name)) {
				throw new Error(
					`Missing path parameter "${name}" for path "${path}"`,
				);
			}
			return encodeURIComponent(String(params[name]));
		})
		.join("/");
