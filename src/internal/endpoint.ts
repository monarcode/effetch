import * as Headers from "effect/http/Headers";
import * as HttpMethod from "effect/http/HttpMethod";

import type { AnySchema } from "../Options.js";
import { mergeOverrides, type OverrideMap } from "./plugins.js";
import type { Call, RuntimeOptions } from "./request.js";
import { isAbsoluteUrl } from "./url.js";

/** An endpoint's definition, as seen at runtime. */
export interface RuntimeDefinition {
	readonly output?: AnySchema | undefined;
	readonly error?: AnySchema | undefined;
	readonly input?: AnySchema | undefined;
	readonly headers?: Headers.Input | undefined;
	readonly plugins?: OverrideMap | undefined;
}

/** An endpoint, as seen at runtime. */
export interface RuntimeEndpoint {
	(options?: RuntimeOptions): ReturnType<Call>;
	readonly route: string;
	readonly method: HttpMethod.HttpMethod;
	readonly path: string;
}

/**
 * Splits `route` into its method and path, with the same rules as the
 * `EndpointRoute` type: an uppercase method, one space, then a path that
 * starts with `/` or is an absolute `http(s)://` URL.
 *
 * Throws on anything else. The types reject such routes, so this only
 * catches casts and JavaScript callers.
 */
export const parseRoute = (
	route: string,
): { readonly method: HttpMethod.HttpMethod; readonly path: string } => {
	const space = typeof route === "string" ? route.indexOf(" ") : -1;
	const method = space === -1 ? "" : route.slice(0, space);
	const path = space === -1 ? "" : route.slice(space + 1);
	if (
		!HttpMethod.isHttpMethod(method) ||
		!(path.startsWith("/") || isAbsoluteUrl(path))
	) {
		throw new Error(
			`Invalid endpoint route ${JSON.stringify(route)}: expected an uppercase HTTP method, one space and a path that starts with "/" or "http(s)://", such as "GET /users/:id"`,
		);
	}
	return { method, path };
};

/**
 * Makes an endpoint: a function that sends `route` with `definition` and
 * one call's options on top. The definition's schemas are fixed; its
 * headers and plugin overrides are defaults the call can override.
 */
export const makeEndpoint = (
	call: (method: HttpMethod.HttpMethod) => Call,
	route: string,
	definition: RuntimeDefinition = {},
): RuntimeEndpoint => {
	const { method, path } = parseRoute(route);
	const send = call(method);
	const headers =
		definition.headers === undefined
			? undefined
			: Headers.fromInput(definition.headers);
	const endpoint = (options: RuntimeOptions = {}) =>
		send(path, {
			...options,
			output: definition.output,
			error: definition.error,
			input: definition.input,
			headers:
				headers === undefined || options.headers === undefined
					? (options.headers ?? headers)
					: Headers.merge(headers, Headers.fromInput(options.headers)),
			plugins: mergeOverrides(definition.plugins, options.plugins),
		});
	return Object.assign(endpoint, { route, method, path });
};
