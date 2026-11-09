import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Exit from "effect/Exit";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Predicate from "effect/Predicate";

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

/**
 * Where a call with `onExit` hooks keeps the response its `onExit` hooks
 * get: the last one the network sent, or the one the plugin chain returned
 * once it has. Each network attempt clears it first, so after a retry it's
 * the last attempt's.
 */
export interface ResponseBox {
	current: HttpClientResponse.HttpClientResponse | undefined;
}

/**
 * The {@link ResponseBox} of the call being run, if it has `onExit` hooks.
 * Provided around each call (`undefined` without hooks, and for
 * `client.httpClient`), so a call made inside another doesn't write to its
 * box.
 */
export const CurrentResponseBox: Context.Reference<ResponseBox | undefined> =
	Context.Reference<ResponseBox | undefined>(
		"@monarcode/effetch/CurrentResponseBox",
		{ defaultValue: () => undefined },
	);

export const provideResponseBox = (
	box: ResponseBox | undefined,
): (<A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>) =>
	Effect.provideService(CurrentResponseBox, box);

/**
 * `client`'s `execute`, recording each response in the call's
 * {@link ResponseBox}, if it has one.
 */
const recordResponses =
	<E, R>(client: HttpClient.HttpClient.With<E, R>) =>
	(
		request: HttpClientRequest.HttpClientRequest,
	): Effect.Effect<HttpClientResponse.HttpClientResponse, E, R> =>
		Effect.flatMap(Effect.service(CurrentResponseBox), (box) => {
			if (box === undefined) {
				return client.execute(request);
			}
			box.current = undefined;
			return Effect.tap(client.execute(request), (response) =>
				Effect.sync(() => {
					box.current = response;
				}),
			);
		});

const overrideOf = (overrides: OverrideMap, name: string): unknown =>
	hasOwn(overrides, name) ? overrides[name] : undefined;

/**
 * `{ ...defaults, ...override }`, leaving out the override's `undefined`
 * values so they keep their default. Only object options can be
 * overridden; anything else keeps `defaults`.
 */
export const mergeOptions = (defaults: unknown, override: unknown): unknown =>
	Predicate.isObject(defaults) && Predicate.isObject(override)
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
				Predicate.isObject(base) && Predicate.isObject(override)
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
		recordResponses(client),
	);
	return fromExecute((request) => withContext(context)(execute(request)));
};

/**
 * Runs one kind of observing hook (`onError` or `onExit`) of each plugin,
 * in array order, leaving out plugins the call skips. A hook that dies is
 * logged at Debug level and never changes the call's outcome.
 */
const runHooks = <H>(
	plugins: ReadonlyArray<Plugin.Any>,
	context: Context.Context<never>,
	name: "onError" | "onExit",
	run: (
		hook: H,
		options: unknown,
		route: string | undefined,
	) => Effect.Effect<void, never, unknown>,
): Effect.Effect<void> => {
	const hooks = Effect.gen(function* () {
		const overrides = yield* Effect.service(CurrentOverrides);
		const route = yield* currentRoute;
		yield* Effect.forEach(
			plugins,
			(plugin) => {
				const hook = plugin[name] as H | undefined;
				const override = overrideOf(overrides, plugin.name);
				if (hook === undefined || override === false) {
					return Effect.void;
				}
				const options = mergeOptions(plugin.defaults, override);
				return Effect.catchCause(run(hook, options, route), (failure) =>
					Effect.logDebug(
						`effetch: the ${name} hook of plugin "${plugin.name}" failed`,
						failure,
					),
				);
			},
			{ discard: true },
		);
	});
	return withContext(context)(hooks);
};

/**
 * Runs the `onError` hooks for a call that failed or died after `request`
 * was built. Interruption isn't a failure, so it runs none.
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
	return runHooks<Plugin.OnError<unknown, unknown>>(
		plugins,
		context,
		"onError",
		(hook, options, route) => hook(error, { request, options, route }),
	);
};

/** What the `onExit` hooks receive besides the `Exit`, options and route. */
export interface ExitDetails {
	readonly request: HttpClientRequest.HttpClientRequest;
	readonly response: HttpClientResponse.HttpClientResponse | undefined;
	readonly durationMs: number;
}

/** `true` if any plugin has an `onExit` hook. */
export const hasExitHooks = (plugins: ReadonlyArray<Plugin.Any>): boolean =>
	plugins.some((plugin) => plugin.onExit !== undefined);

/** Runs the `onExit` hooks for a call that ended after `request` was built. */
export const runExitHooks = (
	plugins: ReadonlyArray<Plugin.Any>,
	context: Context.Context<never>,
	exit: Exit.Exit<unknown, unknown>,
	details: ExitDetails,
	route: string,
): Effect.Effect<void> =>
	runHooks<Plugin.OnExit<unknown, unknown>>(
		plugins,
		context,
		"onExit",
		(hook, options) => hook(exit, { ...details, options, route }),
	);
