import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";

import { NetworkError } from "../Errors.js";
import { errorUrl, joinUrl } from "./url.js";

const mapClientError = (
	error: HttpClientError.HttpClientError,
): Effect.Effect<HttpClientResponse.HttpClientResponse, NetworkError> => {
	const { reason } = error;
	switch (reason._tag) {
		case "TransportError":
			return Effect.fail(
				new NetworkError({
					method: reason.request.method,
					url: errorUrl(reason.request.url),
					cause: reason.cause,
				}),
			);
		case "StatusCodeError":
			return Effect.succeed(reason.response);
		default:
			return Effect.die(error);
	}
};

export const mapClientErrors = (
	client: HttpClient.HttpClient,
): HttpClient.HttpClient.With<NetworkError> =>
	HttpClient.transformResponse(client, Effect.catch(mapClientError));

const bodyHeaders = ["content-type", "content-length"];

export const withDefaults = <E>(
	client: HttpClient.HttpClient.With<E>,
	baseUrl: string | undefined,
	headers: Headers.Headers,
): HttpClient.HttpClient.With<E> => {
	const defaults = Headers.removeMany(headers, bodyHeaders);
	return HttpClient.mapRequestInput(client, (request) =>
		HttpClientRequest.setHeaders(
			HttpClientRequest.setUrl(request, joinUrl(baseUrl, request.url)),
			Headers.merge(defaults, request.headers),
		),
	);
};
