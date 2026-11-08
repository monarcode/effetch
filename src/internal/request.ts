import * as Clock from "effect/Clock";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import type * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as HttpMethod from "effect/http/HttpMethod";

import type {
	AnySchema,
	QueryInput,
	RequestOptions,
	StatusErrorMap,
} from "../Options.js";
import type { Plugin } from "../Plugin.js";
import { encodeBody } from "./body.js";
import { interpolatePath } from "./path.js";
import type { ApplyDefaults } from "./pipeline.js";
import {
	hasExitHooks,
	type OverrideMap,
	provideOverrides,
	provideResponseBox,
	provideRoute,
	type ResponseBox,
	runErrorHooks,
	runExitHooks,
} from "./plugins.js";
import { toUrlParams } from "./query.js";
import { checkStatus, decodeOutput } from "./response.js";

export type RuntimeOptions = Omit<
	RequestOptions<
		string,
		AnySchema | undefined,
		AnySchema,
		AnySchema,
		ReadonlyArray<Plugin.Any>,
		QueryInput,
		StatusErrorMap | undefined
	>,
	"plugins"
> & { readonly plugins?: OverrideMap | undefined };

export interface RequesterState {
	readonly errorSchema: AnySchema | undefined;
	/** The client's `statusErrors`, tried after the call's or endpoint's. */
	readonly statusErrors: StatusErrorMap | undefined;
	readonly applyDefaults: ApplyDefaults;
	readonly chain: HttpClient.HttpClient.With<unknown>;
	readonly plugins: ReadonlyArray<Plugin.Any>;
	readonly context: Context.Context<never>;
}

const buildRequest = (
	state: RequesterState,
	method: HttpMethod.HttpMethod,
	path: string,
	options: RuntimeOptions,
): Effect.Effect<HttpClientRequest.HttpClientRequest, never, unknown> =>
	Effect.gen(function* () {
		if (
			options.body !== undefined &&
			(method === "GET" || method === "HEAD")
		) {
			return yield* Effect.die(
				new Error(`A ${method} request can't have a body`),
			);
		}
		let request = HttpClientRequest.make(method)(
			interpolatePath(path, options.params),
			{ urlParams: toUrlParams(options.query) },
		);
		const body = yield* encodeBody(options.body, options.input);
		if (body !== undefined) {
			request = HttpClientRequest.setBody(request, body);
		}
		if (options.headers !== undefined) {
			request = HttpClientRequest.setHeaders(request, options.headers);
		}
		request = state.applyDefaults(request);
		if (
			options.output !== undefined &&
			!Headers.has(request.headers, "accept")
		) {
			request = HttpClientRequest.acceptJson(request);
		}
		return request;
	});

/** Checks the response's status, then decodes its body with `output`. */
const handle = (
	state: RequesterState,
	response: HttpClientResponse.HttpClientResponse,
	options: RuntimeOptions,
): Effect.Effect<unknown, unknown, unknown> =>
	Effect.gen(function* () {
		const checked = yield* checkStatus(
			response,
			options.error ?? state.errorSchema,
			[options.statusErrors, state.statusErrors],
		);
		return options.output === undefined
			? checked
			: yield* decodeOutput(checked, options.output);
	});

/**
 * Sends `request` through the plugin chain, then handles the response.
 * With a `box`, the response the chain returns is recorded in it.
 */
const execute = (
	state: RequesterState,
	request: HttpClientRequest.HttpClientRequest,
	options: RuntimeOptions,
	box?: ResponseBox | undefined,
): Effect.Effect<unknown, unknown, unknown> =>
	Effect.flatMap(state.chain.execute(request), (response) => {
		if (box !== undefined) {
			box.current = response;
		}
		return handle(state, response, options);
	});

/**
 * Runs `call` (the call's {@link execute}, with its `onError` hooks), then
 * the `onExit` hooks, whatever the outcome. The duration stops when the
 * response is handled, so the `onError` hooks don't count.
 */
const withExitHooks = (
	state: RequesterState,
	request: HttpClientRequest.HttpClientRequest,
	route: string,
	run: (
		execute: Effect.Effect<unknown, unknown, unknown>,
	) => Effect.Effect<unknown, unknown, unknown>,
	call: (box: ResponseBox) => Effect.Effect<unknown, unknown, unknown>,
): Effect.Effect<unknown, unknown, unknown> =>
	Effect.gen(function* () {
		const box: ResponseBox = { current: undefined };
		const start = yield* Clock.currentTimeMillis;
		let end = start;
		const timed = call(box).pipe(
			provideResponseBox(box),
			Effect.onExit(() =>
				Effect.map(Clock.currentTimeMillis, (now) => {
					end = now;
				}),
			),
		);
		return yield* Effect.onExit(run(timed), (exit) =>
			runExitHooks(
				state.plugins,
				state.context,
				exit,
				{
					request,
					response: box.current,
					durationMs: Math.round(end - start),
				},
				route,
			),
		);
	});

const send = (
	state: RequesterState,
	method: HttpMethod.HttpMethod,
	path: string,
	options: RuntimeOptions,
): Effect.Effect<unknown, unknown, unknown> => {
	const route = `${method} ${path}`;
	return Effect.gen(function* () {
		const request = yield* buildRequest(state, method, path, options);
		const withErrorHooks = (
			effect: Effect.Effect<unknown, unknown, unknown>,
		) =>
			Effect.tapCause(effect, (cause) =>
				runErrorHooks(state.plugins, state.context, request, cause),
			);
		return yield* hasExitHooks(state.plugins)
			? withExitHooks(state, request, route, withErrorHooks, (box) =>
					execute(state, request, options, box),
				)
			: withErrorHooks(execute(state, request, options));
	}).pipe(
		provideOverrides(options.plugins),
		provideRoute(route),
		// A call inside another (from a plugin) doesn't record in its box.
		provideResponseBox(undefined),
	);
};

export type Call = (
	path: string,
	options?: RuntimeOptions,
) => Effect.Effect<unknown, unknown, unknown>;

export const makeCall =
	(state: RequesterState) =>
	(method: HttpMethod.HttpMethod): Call =>
	(path, options = {}) =>
		send(state, method, path, options);
