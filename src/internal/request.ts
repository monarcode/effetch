import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import type * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as HttpMethod from "effect/http/HttpMethod";

import type { AnySchema, RequestOptions } from "../Options.js";
import type { Plugin } from "../Plugin.js";
import { encodeBody } from "./body.js";
import { interpolatePath } from "./path.js";
import type { ApplyDefaults } from "./pipeline.js";
import {
	type OverrideMap,
	provideOverrides,
	runErrorHooks,
} from "./plugins.js";
import { toUrlParams } from "./query.js";
import { checkStatus, decodeOutput } from "./response.js";

export type RuntimeOptions = Omit<
	RequestOptions<
		string,
		AnySchema | undefined,
		AnySchema,
		AnySchema,
		ReadonlyArray<Plugin.Any>
	>,
	"plugins"
> & { readonly plugins?: OverrideMap | undefined };

export interface RequesterState {
	readonly errorSchema: AnySchema | undefined;
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

const execute = (
	state: RequesterState,
	request: HttpClientRequest.HttpClientRequest,
	options: RuntimeOptions,
): Effect.Effect<unknown, unknown, unknown> =>
	Effect.gen(function* () {
		const response: HttpClientResponse.HttpClientResponse =
			yield* state.chain.execute(request);
		const checked = yield* checkStatus(
			response,
			options.error ?? state.errorSchema,
		);
		return options.output === undefined
			? checked
			: yield* decodeOutput(checked, options.output);
	});

const send = (
	state: RequesterState,
	method: HttpMethod.HttpMethod,
	path: string,
	options: RuntimeOptions,
): Effect.Effect<unknown, unknown, unknown> =>
	Effect.gen(function* () {
		const request = yield* buildRequest(state, method, path, options);
		return yield* Effect.tapCause(execute(state, request, options), (cause) =>
			runErrorHooks(state.plugins, state.context, request, cause),
		);
	}).pipe(provideOverrides(options.plugins));

export type Call = (
	path: string,
	options?: RuntimeOptions,
) => Effect.Effect<unknown, unknown, unknown>;

export const makeCall =
	(state: RequesterState) =>
	(method: HttpMethod.HttpMethod): Call =>
	(path, options = {}) =>
		send(state, method, path, options);
