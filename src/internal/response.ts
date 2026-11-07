import * as Effect from "effect/Effect";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Option from "effect/Option";

import { DecodeError, HttpError } from "../Errors.js";
import type { AnySchema, StatusErrorMap } from "../Options.js";
import { decodeJson } from "./json.js";
import { decodeStatusError, statusErrorsFor } from "./statusErrors.js";
import { errorUrl } from "./url.js";

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * `undefined` for an empty or whitespace-only body, else the parsed JSON.
 * Throws on invalid JSON. `JSON.parse` never returns `undefined`, so an
 * empty body and a JSON `null` stay distinguishable here.
 */
const parseBody = (text: string): unknown =>
	text.trim() === "" ? undefined : JSON.parse(text);

/** The parsed JSON of an error body, or `undefined` when it's empty or isn't JSON. */
const parseErrorBody = (text: string): unknown => {
	try {
		return parseBody(text);
	} catch {
		return undefined;
	}
};

const readErrorBody = <EB extends AnySchema>(
	json: unknown,
	schema: EB | undefined,
): Effect.Effect<unknown, never, EB["DecodingServices"]> =>
	json === undefined || schema === undefined
		? Effect.succeed(json)
		: Effect.orElseSucceed(decodeJson(schema)(json), () => undefined);

/**
 * Passes a 2xx response through and fails anything else, with an error of
 * `statusErrors` or an `HttpError`. 3xx counts as an error: `fetch` follows
 * redirects itself, so a 3xx only arrives with `redirect: "manual"` or a
 * conditional request (`304 Not Modified`).
 *
 * `statusErrors` are the maps to try, in order (the call's, the
 * endpoint's, the client's). When the body is JSON, the schemas listed for
 * the status are tried in turn, and the first one that decodes it is what
 * the call fails with.
 *
 * Otherwise it fails with an `HttpError`, whose body is best effort and
 * never fails the call:
 *
 * - `text` is the raw body, or `""` if it couldn't be read.
 * - `body` is the JSON decoded with `errorSchema`, or the parsed JSON
 *   without one. It is `undefined` when the body is empty, isn't JSON or
 *   doesn't match `errorSchema`.
 *
 * `body` is typed by `errorSchema` only when one is definitely given; a
 * schema that may be `undefined` types it as `unknown`. With
 * `statusErrors`, the error is `unknown`.
 */
export function checkStatus(
	response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<
	HttpClientResponse.HttpClientResponse,
	HttpError.With<unknown>
>;
export function checkStatus<EB extends AnySchema>(
	response: HttpClientResponse.HttpClientResponse,
	errorSchema: EB,
): Effect.Effect<
	HttpClientResponse.HttpClientResponse,
	HttpError.With<EB["Type"]>,
	EB["DecodingServices"]
>;
export function checkStatus<EB extends AnySchema>(
	response: HttpClientResponse.HttpClientResponse,
	errorSchema: EB | undefined,
): Effect.Effect<
	HttpClientResponse.HttpClientResponse,
	HttpError.With<unknown>,
	EB["DecodingServices"]
>;
export function checkStatus(
	response: HttpClientResponse.HttpClientResponse,
	errorSchema: AnySchema | undefined,
	statusErrors: ReadonlyArray<StatusErrorMap | undefined>,
): Effect.Effect<HttpClientResponse.HttpClientResponse, unknown, unknown>;
export function checkStatus(
	response: HttpClientResponse.HttpClientResponse,
	errorSchema?: AnySchema | undefined,
	statusErrors: ReadonlyArray<StatusErrorMap | undefined> = [],
): Effect.Effect<HttpClientResponse.HttpClientResponse, unknown, unknown> {
	if (response.status >= 200 && response.status < 300) {
		return Effect.succeed(response);
	}
	return Effect.gen(function* () {
		const text = yield* Effect.orElseSucceed(response.text, () => "");
		const json = parseErrorBody(text);
		if (json !== undefined) {
			for (const schema of statusErrorsFor(response.status, statusErrors)) {
				const error = yield* decodeStatusError(schema, json);
				if (Option.isSome(error)) {
					return yield* Effect.fail(error.value);
				}
			}
		}
		const body = yield* readErrorBody(json, errorSchema);
		return yield* new HttpError({
			method: response.request.method,
			url: errorUrl(response.request.url),
			status: response.status,
			headers: response.headers,
			text,
			body,
		});
	});
}

/**
 * Decodes a 2xx response body with `output`.
 *
 * An empty or whitespace-only body (204, 205, HEAD, …) is decoded as JSON
 * `null`, which `Schema.Void`, `Schema.Undefined` and `Schema.NullOr`
 * accept. A JSON `null` body is therefore indistinguishable from an empty
 * one.
 *
 * Fails with a `DecodeError` whose `issue` is:
 *
 * - the `HttpClientError` when the body can't be read,
 * - the `SyntaxError` when it isn't valid JSON,
 * - the schema issue when it doesn't match `output`.
 */
export const decodeOutput = <O extends AnySchema>(
	response: HttpClientResponse.HttpClientResponse,
	output: O,
): Effect.Effect<O["Type"], DecodeError, O["DecodingServices"]> => {
	const failure = (issue: unknown, message: string) =>
		new DecodeError({
			method: response.request.method,
			url: errorUrl(response.request.url),
			status: response.status,
			issue,
			message,
		});
	return Effect.gen(function* () {
		const text = yield* Effect.mapError(response.text, (error) =>
			failure(
				error,
				`Failed to read the response body: ${messageOf(error.cause ?? error)}`,
			),
		);
		const json = yield* Effect.try({
			try: () => parseBody(text),
			catch: (cause) =>
				failure(
					cause,
					`The response body isn't valid JSON: ${messageOf(cause)}`,
				),
		});
		return yield* Effect.mapError(decodeJson(output)(json ?? null), (error) =>
			failure(
				error.issue,
				json === undefined
					? `The response body is empty, but the output schema requires a value: ${error.message}`
					: error.message,
			),
		);
	});
};
