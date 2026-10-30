import * as Headers from "effect/http/Headers";
import * as HttpMethod from "effect/http/HttpMethod";
import * as Schema from "effect/Schema";

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
	/** The `output` schema, or `undefined` without one. */
	readonly output: AnySchema | undefined;
	/** The `error` schema, else the client's `defaultError`, else `Schema.Unknown`. */
	readonly error: AnySchema;
	/** The `input` schema, or `undefined` without one. */
	readonly input: AnySchema | undefined;
}

/** A definition made without a client, as seen at runtime: no plugins. */
export type RuntimeUnboundDefinition = Omit<RuntimeDefinition, "plugins">;

/** An endpoint defined without a client, as seen at runtime. */
export interface RuntimeUnboundEndpoint {
	readonly route: string;
	readonly method: HttpMethod.HttpMethod;
	readonly path: string;
	readonly output: AnySchema | undefined;
	readonly error: AnySchema | undefined;
	readonly input: AnySchema | undefined;
	readonly headers: Headers.Headers | undefined;
}

/** What a definition is bound with, as seen at runtime. */
export interface RuntimeBindOptions {
	readonly headers?: Headers.Input | undefined;
	readonly plugins?: OverrideMap | undefined;
}

/** `over` merged over `base`, where either may be absent. */
const mergeHeaders = (
	base: Headers.Headers | undefined,
	over: Headers.Input | undefined,
): Headers.Input | undefined =>
	base === undefined || over === undefined
		? (over ?? base)
		: Headers.merge(base, Headers.fromInput(over));

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
 *
 * `defaultError` is the client's, used for the endpoint's `error` property
 * when the definition has none. Calls fall back to it on their own.
 */
export const makeEndpoint = (
	call: (method: HttpMethod.HttpMethod) => Call,
	defaultError: AnySchema | undefined,
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
			headers: mergeHeaders(headers, options.headers),
			plugins: mergeOverrides(definition.plugins, options.plugins),
		});
	return Object.assign(endpoint, {
		route,
		method,
		path,
		output: definition.output,
		error: definition.error ?? defaultError ?? Schema.Unknown,
		input: definition.input,
	});
};

/**
 * Defines an endpoint without a client: the route, checked now, and the
 * definition as frozen data, for `bindEndpoint` to turn into an endpoint.
 */
export const makeUnboundEndpoint = (
	route: string,
	definition: RuntimeUnboundDefinition = {},
): RuntimeUnboundEndpoint => {
	const { method, path } = parseRoute(route);
	return Object.freeze({
		route,
		method,
		path,
		output: definition.output,
		error: definition.error,
		input: definition.input,
		headers:
			definition.headers === undefined
				? undefined
				: Headers.fromInput(definition.headers),
	});
};

/**
 * Binds a definition to a client: the endpoint `makeEndpoint` makes from the
 * same route and definition, with the binding's headers over the
 * definition's and its plugin overrides.
 */
export const bindEndpoint = (
	call: (method: HttpMethod.HttpMethod) => Call,
	defaultError: AnySchema | undefined,
	unbound: RuntimeUnboundEndpoint,
	options: RuntimeBindOptions = {},
): RuntimeEndpoint =>
	makeEndpoint(call, defaultError, unbound.route, {
		output: unbound.output,
		error: unbound.error,
		input: unbound.input,
		headers: mergeHeaders(unbound.headers, options.headers),
		plugins: options.plugins,
	});
