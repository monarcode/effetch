import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";

import type { NetworkError } from "../Errors.js";
import type { Plugin } from "../Plugin.js";
import { hasOwn } from "./object.js";

/** A call's `plugins` option, as seen at runtime. */
export interface OverrideMap {
	readonly [name: string]: unknown;
}

type Execute = (
	request: HttpClientRequest.HttpClientRequest,
) => Effect.Effect<HttpClientResponse.HttpClientResponse, unknown, unknown>;

const noOverrides: OverrideMap = {};

/**
 * The `plugins` option of the call being run. Provided around each call;
 * anything else (such as `client.httpClient`) sees no overrides.
 */
export const CurrentOverrides: Context.Reference<OverrideMap> =
	Context.Reference<OverrideMap>("@monarcode/effetch/CurrentOverrides", {
		defaultValue: () => noOverrides,
	});

export const provideOverrides = (
	overrides: OverrideMap | undefined,
): (<A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>) =>
	Effect.provideService(CurrentOverrides, overrides ?? noOverrides);

/**
 * The route of the call being run, such as `"GET /users/:id"`. Provided
 * around each call; anything else (such as `client.httpClient`) sees
 * `undefined`.
 */
export const CurrentRoute: Context.Reference<string | undefined> =
	Context.Reference<string | undefined>("@monarcode/effetch/CurrentRoute", {
		defaultValue: () => undefined,
	});

export const provideRoute = (
	route: string | undefined,
): (<A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>) =>
	Effect.provideService(CurrentRoute, route);

const currentRoute = Effect.service(CurrentRoute);

const overrideOf = (overrides: OverrideMap, name: string): unknown =>
	hasOwn(overrides, name) ? overrides[name] : undefined;

const isRecord = (u: unknown): u is { readonly [key: string]: unknown } =>
	typeof u === "object" && u !== null && !Array.isArray(u);

/**
 * `{ ...defaults, ...override }`, leaving out the override's `undefined`
 * values so they keep their default. Only object options can be
 * overridden; anything else keeps `defaults`.
 */
export const mergeOptions = (defaults: unknown, override: unknown): unknown =>
	isRecord(defaults) && isRecord(override)
		? {
				...defaults,
				...Object.fromEntries(
					Object.entries(override).filter(
						([, value]) => value !== undefined,
					),
				),
			}
		: defaults;

/**
 * An endpoint's `plugins` option with a call's on top, per plugin name. The
 * call's override wins, except that when both are options objects they're
 * merged with {@link mergeOptions}. `Object.fromEntries` defines own
 * properties, so even a plugin named `__proto__` stays a plain key.
 */
export const mergeOverrides = (
	endpoint: OverrideMap | undefined,
	call: OverrideMap | undefined,
): OverrideMap | undefined => {
	if (endpoint === undefined || call === undefined) {
		return call ?? endpoint;
	}
	const names = new Set([...Object.keys(endpoint), ...Object.keys(call)]);
	return Object.fromEntries(
		Array.from(names, (name) => {
			const base = overrideOf(endpoint, name);
			const override = overrideOf(call, name);
			if (override === undefined) {
				return [name, base];
			}
			return [
				name,
				isRecord(base) && isRecord(override)
					? mergeOptions(base, override)
					: override,
			];
		}),
	);
};

const fromExecute = <E, R>(
	execute: (
		request: HttpClientRequest.HttpClientRequest,
	) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>,
): HttpClient.HttpClient.With<E, R> =>
	HttpClient.makeWith(
		Effect.flatMap(execute),
		Effect.succeed as HttpClient.HttpClient.Preprocess<never, never>,
	);

const executeOf =
	<E, R>(client: HttpClient.HttpClient.With<E, R>) =>
	(request: HttpClientRequest.HttpClientRequest) =>
		client.execute(request);

/**
 * One plugin around `inner`: its `wrap` encloses its `onRequest` and
 * `onResponse`, and a call that sets the plugin to `false` goes straight to
 * `inner`.
 *
 * Each layer is a plain `execute` function rather than an `HttpClient`
 * split into Effect's `preprocess` and `postprocess`, so a `wrap` that
 * re-runs its client (a retry) re-runs only what is inside it.
 */
const layer = (plugin: Plugin.Any, inner: Execute): Execute => {
	const { onRequest, onResponse, wrap } = plugin;
	if (
		onRequest === undefined &&
		onResponse === undefined &&
		wrap === undefined
	) {
		return inner;
	}
	const options = Effect.map(Effect.service(CurrentOverrides), (overrides) =>
		mergeOptions(plugin.defaults, overrideOf(overrides, plugin.name)),
	);
	const hooked: Execute =
		onRequest === undefined && onResponse === undefined
			? inner
			: (request) =>
					Effect.gen(function* () {
						const current = yield* options;
						const route = yield* currentRoute;
						const sent =
							onRequest === undefined
								? request
								: yield* onRequest(request, {
										request,
										options: current,
										route,
									});
						const response = yield* inner(sent);
						return onResponse === undefined
							? response
							: yield* onResponse(response, {
									request: sent,
									options: current,
									route,
								});
					});
	const wrapped: Execute =
		wrap === undefined
			? hooked
			: executeOf(
					wrap(
						fromExecute(hooked) as Plugin.Upstream,
						options,
						currentRoute,
					),
				);
	return (request) =>
		Effect.flatMap(Effect.service(CurrentOverrides), (overrides) =>
			overrideOf(overrides, plugin.name) === false
				? inner(request)
				: wrapped(request),
		);
};

/**
 * Runs `effect` with the services captured by `make` filling in whatever the
 * calling fiber doesn't have. The caller's own services and references win,
 * as with Effect's `HttpClient.layerMergedContext`.
 */
export const withContext =
	(context: Context.Context<never>) =>
	<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E> =>
		Effect.updateContext(
			effect,
			(input: Context.Context<never>) =>
				Context.merge(context, input) as Context.Context<R>,
		);

/**
 * The plugins around `client`, `plugins[0]` outermost, run with the captured
 * `context`.
 */
export const applyPlugins = (
	client: HttpClient.HttpClient.With<NetworkError>,
	plugins: ReadonlyArray<Plugin.Any>,
	context: Context.Context<never>,
): HttpClient.HttpClient.With<unknown> => {
	const execute = plugins.reduceRight<Execute>(
		(inner, plugin) => layer(plugin, inner),
		executeOf(client),
	);
	return fromExecute((request) => withContext(context)(execute(request)));
};

/**
 * Runs the `onError` hooks, in array order, for a call that failed or died
 * after `request` was built. Interruption isn't a failure, so it runs none.
 * Plugins skipped by the call are left out. A hook that dies is logged at
 * Debug level and never changes the call's outcome.
 */
export const runErrorHooks = (
	plugins: ReadonlyArray<Plugin.Any>,
	context: Context.Context<never>,
	request: HttpClientRequest.HttpClientRequest,
	cause: Cause.Cause<unknown>,
): Effect.Effect<void> => {
	if (!Cause.hasFails(cause) && !Cause.hasDies(cause)) {
		return Effect.void;
	}
	const error = Cause.squash(cause);
	const hooks = Effect.gen(function* () {
		const overrides = yield* Effect.service(CurrentOverrides);
		const route = yield* currentRoute;
		yield* Effect.forEach(
			plugins,
			(plugin) => {
				const override = overrideOf(overrides, plugin.name);
				if (plugin.onError === undefined || override === false) {
					return Effect.void;
				}
				const options = mergeOptions(plugin.defaults, override);
				return Effect.catchCause(
					plugin.onError(error, { request, options, route }),
					(failure) =>
						Effect.logDebug(
							`effetch: the onError hook of plugin "${plugin.name}" failed`,
							failure,
						),
				);
			},
			{ discard: true },
		);
	});
	return withContext(context)(hooks);
};
