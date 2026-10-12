import * as Effect from "effect/Effect";
import * as HttpBody from "effect/http/HttpBody";
import type * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import type { AnySchema } from "../Options.js";

let formatIssue: SchemaIssue.Formatter<string> | undefined;

const describeFailure = (error: HttpBody.HttpBodyError): string => {
	const { reason, cause } = error;
	if (reason._tag === "SchemaError") {
		formatIssue ??= SchemaIssue.makeFormatterDefault();
		return `it doesn't match the input schema: ${formatIssue(reason.issue)}`;
	}
	return `it can't be serialised as JSON: ${cause instanceof Error ? cause.message : String(cause)}`;
};

const invalidBody = (message: string, cause?: unknown): Effect.Effect<never> =>
	Effect.die(new Error(`Invalid request body: ${message}`, { cause }));

const orDieInvalid = <A, R>(
	self: Effect.Effect<A, HttpBody.HttpBodyError, R>,
): Effect.Effect<A, never, R> =>
	self.pipe(
		Effect.catch((error) => invalidBody(describeFailure(error), error)),
	);

/**
 * True when `value` is an instance of the global constructor `name`.
 *
 * Falls back to the `Object.prototype.toString` tag so values from another
 * realm (an iframe, a `vm` context, a second undici copy) still match.
 * React Native's polyfills have no tag, but they are the global
 * constructors, so `instanceof` covers them.
 */
const isGlobalInstance = (value: unknown, name: string): boolean => {
	const constructor = (globalThis as Record<string, unknown>)[name];
	return (
		(typeof constructor === "function" && value instanceof constructor) ||
		Object.prototype.toString.call(value) === `[object ${name}]`
	);
};

const isBlob = (value: unknown): value is Blob =>
	isGlobalInstance(value, "Blob") || isGlobalInstance(value, "File");

const toBytes = (value: ArrayBuffer | ArrayBufferView): Uint8Array =>
	ArrayBuffer.isView(value)
		? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
		: new Uint8Array(value);

const encodeJson = (body: unknown): Effect.Effect<HttpBody.HttpBody> =>
	Effect.flatMap(orDieInvalid(HttpBody.json(body)), (encoded) =>
		// `JSON.stringify` returns `undefined` for functions, symbols and
		// `toJSON() => undefined`; HttpBody.json then sends an empty body.
		encoded.contentLength === 0
			? invalidBody(
					`it can't be serialised as JSON: ${typeof body} has no JSON representation`,
				)
			: Effect.succeed(encoded),
	);

const encodePlain = (body: unknown): Effect.Effect<HttpBody.HttpBody> => {
	if (HttpBody.isHttpBody(body)) {
		return Effect.succeed(body);
	}
	if (typeof body === "string") {
		return Effect.succeed(HttpBody.text(body));
	}
	if (ArrayBuffer.isView(body) || isGlobalInstance(body, "ArrayBuffer")) {
		return Effect.succeed(
			HttpBody.uint8Array(toBytes(body as ArrayBuffer | ArrayBufferView)),
		);
	}
	if (isBlob(body)) {
		return Effect.succeed(
			HttpBody.raw(body, {
				contentType: body.type === "" ? undefined : body.type,
				contentLength: body.size,
			}),
		);
	}
	if (isGlobalInstance(body, "FormData")) {
		return Effect.succeed(HttpBody.formData(body as FormData));
	}
	if (isGlobalInstance(body, "URLSearchParams")) {
		return Effect.succeed(HttpBody.urlParams(body as URLSearchParams));
	}
	return encodeJson(body);
};

/**
 * Turns the `body` option into an `HttpBody`, or `undefined` for no body.
 *
 * With an `input` schema the body is always encoded with it and sent as JSON.
 * Without one it is sent by runtime type, checked in this order:
 *
 * - `HttpBody`: as-is.
 * - `string`: `text/plain`.
 * - `ArrayBuffer` and any view (`Uint8Array`, `DataView`, …):
 *   `application/octet-stream`, only the viewed bytes.
 * - `Blob` / `File`: as-is, with the blob's own type and size.
 * - `FormData`: as-is, so the platform sets the multipart boundary.
 * - `URLSearchParams`: `application/x-www-form-urlencoded`.
 * - anything else: JSON.
 *
 * Dies (it does not fail) when the body doesn't match `input` or can't be
 * serialised as JSON. The defect is an `Error` whose message starts with
 * `Invalid request body:` and whose `cause` is the underlying error.
 */
export const encodeBody = <I extends AnySchema = Schema.Unknown>(
	body: unknown,
	input?: I | undefined,
): Effect.Effect<
	HttpBody.HttpBody | undefined,
	never,
	I["EncodingServices"]
> => {
	if (body === undefined) {
		return Effect.undefined;
	}
	if (input !== undefined) {
		return orDieInvalid(HttpBody.jsonSchema(input)(body));
	}
	return encodePlain(body);
};
