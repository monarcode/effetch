import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import type * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as HttpMethod from "effect/http/HttpMethod";

import type { DecodeError, HttpError, NetworkError } from "../Errors.js";
import type { AnySchema, RequestOptions } from "../Options.js";
import type { Plugin } from "../Plugin.js";
import { encodeBody } from "./body.js";
import { interpolatePath } from "./path.js";
import { toUrlParams } from "./query.js";
import { checkStatus, decodeOutput } from "./response.js";

export type RuntimeOptions = RequestOptions<
	string,
	AnySchema | undefined,
	AnySchema,
	AnySchema,
	ReadonlyArray<Plugin.Any>
>;

export interface RequesterState {
	readonly hasDefaultAccept: boolean;
	readonly errorSchema: AnySchema | undefined;
	readonly httpClient: HttpClient.HttpClient.With<NetworkError>;
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
		if (
			options.output !== undefined &&
			!state.hasDefaultAccept &&
			!Headers.has(request.headers, "accept")
		) {
			request = HttpClientRequest.acceptJson(request);
		}
		return request;
	});

const send = (
	state: RequesterState,
	method: HttpMethod.HttpMethod,
	path: string,
	options: RuntimeOptions,
): Effect.Effect<unknown, NetworkError | HttpError | DecodeError, unknown> =>
	Effect.gen(function* () {
		const request = yield* buildRequest(state, method, path, options);
		const response: HttpClientResponse.HttpClientResponse =
			yield* state.httpClient.execute(request);
		const checked = yield* checkStatus(
			response,
			options.error ?? state.errorSchema,
		);
		return options.output === undefined
			? checked
			: yield* decodeOutput(checked, options.output);
	});

export const makeCall =
	(state: RequesterState) =>
	(method: HttpMethod.HttpMethod) =>
	(path: string, options: RuntimeOptions = {}) =>
		send(state, method, path, options);
