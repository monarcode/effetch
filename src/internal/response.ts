import * as Effect from "effect/Effect";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import { DecodeError, HttpError } from "../Errors.js";
import type { AnySchema } from "../Options.js";

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The request URL without its query string or fragment, so secrets such as
 * `?api_key=…` never reach error messages or logs.
 */
const errorUrl = (response: HttpClientResponse.HttpClientResponse): string =>
	response.request.url.split(/[?#]/, 1)[0] ?? "";

/**
 * `undefined` for an empty or whitespace-only body, else the parsed JSON.
 * Throws on invalid JSON. `JSON.parse` never returns `undefined`, so an
 * empty body and a JSON `null` stay distinguishable here.
 */
const parseBody = (text: string): unknown =>
	text.trim() === "" ? undefined : JSON.parse(text);

const decodeJson = <S extends AnySchema>(schema: S) =>
	Schema.decodeUnknownEffect(Schema.toCodecJson(schema));

const readErrorBody = <EB extends AnySchema>(
	text: string,
	schema: EB | undefined,
): Effect.Effect<unknown, never, EB["DecodingServices"]> => {
	let json: unknown;
	try {
		json = parseBody(text);
	} catch {
		return Effect.succeed(undefined);
	}
	if (json === undefined || schema === undefined) {
		return Effect.succeed(json);
	}
	return Effect.orElseSucceed(decodeJson(schema)(json), () => undefined);
};

/**
 * Passes a 2xx response through and fails anything else with an
 * `HttpError`. 3xx counts as an error: `fetch` follows redirects itself, so
 * a 3xx only arrives with `redirect: "manual"` or a conditional request
 * (`304 Not Modified`).
 *
 * The error body is best effort and never fails the call:
 *
 * - `text` is the raw body, or `""` if it couldn't be read.
 * - `body` is the JSON decoded with `errorSchema`, or the parsed JSON
 *   without one. It is `undefined` when the body is empty, isn't JSON or
 *   doesn't match `errorSchema`.
 *
 * `body` is typed by `errorSchema` only when one is definitely given; a
 * schema that may be `undefined` types it as `unknown`.
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
export function checkStatus<EB extends AnySchema>(
	response: HttpClientResponse.HttpClientResponse,
	errorSchema?: EB | undefined,
): Effect.Effect<
	HttpClientResponse.HttpClientResponse,
	HttpError,
	EB["DecodingServices"]
> {
	if (response.status >= 200 && response.status < 300) {
		return Effect.succeed(response);
	}
	return Effect.gen(function* () {
		const text = yield* Effect.orElseSucceed(response.text, () => "");
		const body = yield* readErrorBody(text, errorSchema);
		return yield* Effect.fail(
			new HttpError({
				method: response.request.method,
				url: errorUrl(response),
				status: response.status,
				headers: response.headers,
				text,
				body,
			}),
		);
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
			url: errorUrl(response),
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
