import * as Headers from "effect/http/Headers";
import * as HttpMethod from "effect/http/HttpMethod";
import * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";

import type {
	AnySchema,
	QueryInput,
	QuerySchema,
	ResponseMode,
	StatusErrorMap,
} from "../Options.js";
import type { PathParamValue } from "../Path.js";
import type { StreamFormat } from "../Streams.js";
import { isRecord } from "./object.js";
import { mergeOverrides, type OverrideMap } from "./plugins.js";
import { checkQuerySchema, encodeQuerySync } from "./query.js";
import type { Call, RuntimeOptions } from "./request.js";
import { freezeStatusErrors, joinStatusErrors } from "./statusErrors.js";
import { checkStreamOptions, isStreamFormat, openStream } from "./stream.js";
import { requestTarget, targetUrl } from "./target.js";
import { isAbsoluteUrl } from "./url.js";

/** An endpoint's definition, as seen at runtime. */
export interface RuntimeDefinition {
	readonly output?: AnySchema | undefined;
	readonly error?: AnySchema | undefined;
	readonly statusErrors?: StatusErrorMap | undefined;
	readonly input?: AnySchema | undefined;
	readonly headers?: Headers.Input | undefined;
	readonly plugins?: OverrideMap | undefined;
	readonly responseMode?: ResponseMode | undefined;
	readonly query?: QuerySchema | undefined;
	readonly stream?: StreamFormat | undefined;
}

/**
 * What an endpoint takes from its client's config: the error defaults,
 * and the `baseUrl`, once read, for `url`.
 */
export interface ClientDefaults {
	readonly defaultError?: AnySchema | undefined;
	readonly statusErrors?: StatusErrorMap | undefined;
	readonly baseUrl?: string | undefined;
}

/** What `endpoint.url` takes, as seen at runtime. */
export interface RuntimeUrlOptions {
	readonly params?: { readonly [name: string]: PathParamValue } | undefined;
	readonly query?: QueryInput | undefined;
}

/**
 * The URL a call with `options` sends to, before plugins: `baseUrl`, the
 * path with its params, then the query, encoded with `querySchema` if
 * there is one. Built with the call's own `requestTarget`. Throws when a
 * param is missing or the query can't be encoded.
 */
const endpointUrl = (
	baseUrl: string | undefined,
	path: string,
	querySchema: QuerySchema | undefined,
	options: RuntimeUrlOptions | null | undefined,
): string => {
	const query =
		querySchema === undefined
			? options?.query
			: encodeQuerySync(querySchema, options?.query);
	return targetUrl(baseUrl, requestTarget(path, options?.params, query));
};

/** An endpoint, as seen at runtime. */
export interface RuntimeEndpoint {
	/** A call, or a stream for an endpoint with `stream`. */
	(
		options?: RuntimeOptions,
	): ReturnType<Call> | Stream.Stream<unknown, unknown, unknown>;
	readonly route: string;
	readonly method: HttpMethod.HttpMethod;
	readonly path: string;
	/** The `output` schema, or `undefined` without one. */
	readonly output: AnySchema | undefined;
	/** The `error` schema, else the client's `defaultError`, else `Schema.Unknown`. */
	readonly error: AnySchema;
	/** The endpoint's `statusErrors` joined with the client's, every entry a list. */
	readonly statusErrors: {
		readonly [status: number]: ReadonlyArray<AnySchema>;
	};
	/** The `input` schema, or `undefined` without one. */
	readonly input: AnySchema | undefined;
	/** The `responseMode`, or `undefined` without one. */
	readonly responseMode: ResponseMode | undefined;
	/** The `query` schema, or `undefined` without one. */
	readonly query: QuerySchema | undefined;
	/** The stream format, or `undefined` for calls that return an Effect. */
	readonly stream: StreamFormat | undefined;
	readonly url: (options?: RuntimeUrlOptions) => string;
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
	readonly statusErrors: StatusErrorMap | undefined;
	readonly input: AnySchema | undefined;
	readonly headers: Headers.Headers | undefined;
	readonly responseMode: ResponseMode | undefined;
	readonly query: QuerySchema | undefined;
	readonly stream: StreamFormat | undefined;
	readonly url: (options?: RuntimeUrlOptions) => string;
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
 * Checks a definition's `stream`: one of the formats, and not with what
 * can't be streamed. Throws, naming the route.
 */
const checkStream = (route: string, definition: RuntimeUnboundDefinition) => {
	const { stream } = definition;
	if (stream === undefined) {
		return;
	}
	if (!isStreamFormat(stream)) {
		throw new Error(
			`Invalid endpoint ${JSON.stringify(route)}: stream must be "sse" or "ndjson", got ${JSON.stringify(stream)}`,
		);
	}
	checkStreamOptions(`The endpoint ${route}`, definition);
};

/**
 * Makes an endpoint: a function that sends `route` with `definition` and
 * one call's options on top. The definition's schemas are fixed; its
 * headers and plugin overrides are defaults the call can override.
 *
 * `client` holds the client's `defaultError`, used for the endpoint's
 * `error` property when the definition has none, and its `statusErrors`,
 * joined after the definition's in the `statusErrors` property. Calls fall
 * back to both on their own.
 */
export const makeEndpoint = (
	call: (method: HttpMethod.HttpMethod) => Call,
	client: ClientDefaults,
	route: string,
	definition: RuntimeDefinition = {},
): RuntimeEndpoint => {
	const { method, path } = parseRoute(route);
	checkQuerySchema(definition?.query);
	checkStream(route, definition);
	const send = call(method);
	const headers =
		definition.headers === undefined
			? undefined
			: Headers.fromInput(definition.headers);
	const statusErrors = freezeStatusErrors(definition.statusErrors);
	const optionsOf = (options: RuntimeOptions): RuntimeOptions => ({
		...options,
		output: definition.output,
		error: definition.error,
		statusErrors,
		input: definition.input,
		headers: mergeHeaders(headers, options.headers),
		plugins: mergeOverrides(definition.plugins, options.plugins),
		responseMode: options.responseMode ?? definition.responseMode,
		querySchema: definition.query,
	});
	const { stream } = definition;
	const endpoint =
		stream === undefined
			? (options: RuntimeOptions = {}) => send(path, optionsOf(options))
			: (options: RuntimeOptions = {}) =>
					openStream(
						stream,
						`The endpoint ${route}`,
						(streamOptions) => send(path, streamOptions),
						optionsOf(options),
					);
	return Object.assign(endpoint, {
		route,
		method,
		path,
		output: definition.output,
		error: definition.error ?? client.defaultError ?? Schema.Unknown,
		statusErrors: joinStatusErrors([statusErrors, client.statusErrors]),
		input: definition.input,
		responseMode: definition.responseMode,
		query: definition.query,
		stream,
		url: (options?: RuntimeUrlOptions) =>
			endpointUrl(client.baseUrl, path, definition.query, options),
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
	checkQuerySchema(definition?.query);
	checkStream(route, definition);
	return Object.freeze({
		route,
		method,
		path,
		output: definition.output,
		error: definition.error,
		statusErrors: freezeStatusErrors(definition.statusErrors),
		input: definition.input,
		headers:
			definition.headers === undefined
				? undefined
				: Headers.fromInput(definition.headers),
		responseMode: definition.responseMode,
		query: definition.query,
		stream: definition.stream,
		url: (options?: RuntimeUrlOptions) =>
			endpointUrl(undefined, path, definition.query, options),
	});
};

/** `true` if `u` looks like what `Fetch.endpoint` returns. */
const isUnboundEndpoint = (u: unknown): u is RuntimeUnboundEndpoint =>
	typeof u === "object" &&
	u !== null &&
	typeof (u as { readonly route?: unknown }).route === "string" &&
	typeof (u as { readonly method?: unknown }).method === "string" &&
	typeof (u as { readonly path?: unknown }).path === "string";

/**
 * Binds a definition to a client: the endpoint `makeEndpoint` makes from the
 * same route and definition, with the binding's headers over the
 * definition's and its plugin overrides. Throws when `unbound` isn't a
 * definition, such as an endpoint that's already bound.
 */
export const bindEndpoint = (
	call: (method: HttpMethod.HttpMethod) => Call,
	client: ClientDefaults,
	unbound: RuntimeUnboundEndpoint,
	options: RuntimeBindOptions | null = {},
): RuntimeEndpoint => {
	if (!isUnboundEndpoint(unbound)) {
		throw new Error(
			"bind takes an endpoint definition: pass what Fetch.endpoint returns",
		);
	}
	return makeEndpointFrom(call, client, unbound, options ?? {});
};

const makeEndpointFrom = (
	call: (method: HttpMethod.HttpMethod) => Call,
	client: ClientDefaults,
	unbound: RuntimeUnboundEndpoint,
	options: RuntimeBindOptions,
): RuntimeEndpoint =>
	makeEndpoint(call, client, unbound.route, {
		output: unbound.output,
		error: unbound.error,
		statusErrors: unbound.statusErrors,
		input: unbound.input,
		headers: mergeHeaders(unbound.headers, options.headers),
		plugins: options.plugins,
		responseMode: unbound.responseMode,
		query: unbound.query,
		stream: unbound.stream,
	});

/** A record of definitions, as `bindAll` takes it at runtime. */
export interface RuntimeDefinitions {
	readonly [name: string]: unknown;
}

/** One entry of a record of definitions, checked and split. */
interface Entry {
	readonly name: string;
	readonly unbound: RuntimeUnboundEndpoint;
	readonly options: RuntimeBindOptions | undefined;
	/** Whether it was given as a `[definition, options]` pair. */
	readonly pair: boolean;
}

/**
 * A frozen copy of a binding's options: `headers` as Effect `Headers`, and
 * `plugins` copied down to each override.
 */
const snapshotOptions = (options: RuntimeBindOptions): RuntimeBindOptions => {
	const copy: { headers?: Headers.Input; plugins?: OverrideMap } = {};
	if (options.headers !== undefined) {
		copy.headers = Object.freeze(Headers.fromInput(options.headers));
	}
	if (options.plugins !== undefined) {
		copy.plugins = Object.freeze(
			Object.fromEntries(
				Object.entries(options.plugins).map(([name, override]) => [
					name,
					isRecord(override) ? Object.freeze({ ...override }) : override,
				]),
			),
		) as OverrideMap;
	}
	return Object.freeze(copy);
};

/**
 * Checks and splits every string-keyed entry of `definitions`. Throws when
 * an entry isn't a definition or a `[definition, options]` pair: that's a
 * bug in the calling code. Options are copied and frozen.
 */
const entriesOf = (definitions: RuntimeDefinitions): ReadonlyArray<Entry> =>
	Object.keys(definitions).map((name) => {
		const entry = definitions[name];
		const pair = Array.isArray(entry);
		const [unbound, options] = pair
			? (entry as ReadonlyArray<unknown>)
			: [entry, undefined];
		const valid =
			isUnboundEndpoint(unbound) &&
			(!pair || (entry as ReadonlyArray<unknown>).length === 2) &&
			(options === undefined || options === null || isRecord(options));
		if (!valid) {
			throw new Error(
				`"${name}" isn't an endpoint definition: pass what Fetch.endpoint returns, or a [definition, options] pair`,
			);
		}
		return {
			name,
			unbound,
			options: isRecord(options)
				? snapshotOptions(options as RuntimeBindOptions)
				: undefined,
			pair,
		};
	});

/**
 * A frozen copy of `definitions`, checked, with each pair and its options
 * copied and frozen. For `Fetch.Endpoints`, when a class is declared.
 */
export const snapshotDefinitions = (definitions: unknown): RuntimeDefinitions =>
	Object.freeze(
		Object.fromEntries(
			entriesOf(definitions as RuntimeDefinitions).map(
				({ name, unbound, options, pair }) => [
					name,
					pair ? Object.freeze([unbound, options]) : unbound,
				],
			),
		),
	);

/**
 * Binds every definition in `definitions`, under the same names. Throws
 * when an entry isn't a definition: that's a bug in the calling code.
 */
export const bindAllEndpoints = (
	call: (method: HttpMethod.HttpMethod) => Call,
	client: ClientDefaults,
	definitions: RuntimeDefinitions,
): { readonly [name: string]: RuntimeEndpoint } =>
	// `fromEntries`, so a name such as "__proto__" stays an own key.
	Object.freeze(
		Object.fromEntries(
			entriesOf(definitions).map(({ name, unbound, options }) => [
				name,
				bindEndpoint(call, client, unbound, options),
			]),
		),
	);
