import * as Effect from "effect/Effect";
import * as HttpBody from "effect/http/HttpBody";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import type { AnySchema } from "../Options.js";
import { buildForm, fileFieldsOf, isMultipart } from "./multipart.js";
import { isBlob, isGlobalInstance } from "./platform.js";

export { isBlob, isGlobalInstance } from "./platform.js";

let formatIssue: SchemaIssue.Formatter<string> | undefined;

const describeFailure = (error: HttpBody.HttpBodyError): string => {
	const { reason, cause } = error;
	if (reason._tag === "SchemaError") {
		return doesNotMatch(reason.issue);
	}
	return `it can't be serialised as JSON: ${cause instanceof Error ? cause.message : String(cause)}`;
};

const invalidBody = (message: string, cause?: unknown): Effect.Effect<never> =>
	Effect.die(new Error(`Invalid request body: ${message}`, { cause }));

const doesNotMatch = (issue: SchemaIssue.Issue): string => {
	formatIssue ??= SchemaIssue.makeFormatterDefault();
	return `it doesn't match the input schema: ${formatIssue(issue)}`;
};

const orDieInvalid = <A, R>(
	self: Effect.Effect<A, HttpBody.HttpBodyError, R>,
): Effect.Effect<A, never, R> =>
	self.pipe(
		Effect.catch((error) => invalidBody(describeFailure(error), error)),
	);

export const toBytes = (value: ArrayBuffer | ArrayBufferView): Uint8Array =>
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
 * Encodes `body` with a `Fetch.multipart` input schema, then sends the
 * fields it encodes to as `FormData` (see `buildForm`). The `FormData` body
 * sets no `Content-Type`, so the platform adds the multipart boundary.
 */
const encodeMultipart = <I extends AnySchema>(
	body: unknown,
	input: I,
): Effect.Effect<HttpBody.HttpBody, never, I["EncodingServices"]> =>
	Schema.encodeUnknownEffect(input)(body).pipe(
		Effect.catch((error) => invalidBody(doesNotMatch(error.issue), error)),
		Effect.flatMap((encoded) => buildForm(encoded, fileFieldsOf(input))),
		Effect.map(HttpBody.formData),
	);

/**
 * Turns the `body` option into an `HttpBody`, or `undefined` for no body.
 *
 * With an `input` schema the body is always encoded with it: sent as
 * `FormData` when `Fetch.multipart` marked the schema (see `buildForm`),
 * and as JSON otherwise. Without one it is sent by runtime type, checked
 * in this order:
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
 * Dies (it does not fail) when the body doesn't match `input`, can't be
 * serialised as JSON, or, for multipart, encodes to something a form can't
 * hold. The defect is an `Error` whose message starts with
 * `Invalid request body:` and whose `cause`, when there is one, is the
 * underlying error.
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
		return isMultipart(input)
			? encodeMultipart(body, input)
			: orDieInvalid(HttpBody.jsonSchema(input)(body));
	}
	return encodePlain(body);
};
