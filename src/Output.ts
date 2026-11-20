import * as Schema from "effect/Schema";

import { bodyFormatAnnotation } from "./internal/output.js";

/**
 * A schema whose encoded side is a string, as {@link text} takes: such as
 * `Schema.String`, `Schema.NumberFromString` or a `Schema.Literals` of
 * strings.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type { Fetch } from "@monarcode/effetch";
 *
 * const count: Fetch.TextSchema = Schema.NumberFromString;
 * ```
 *
 * @since 0.1.0
 */
export type TextSchema = Schema.Top & { readonly Encoded: string };

/**
 * Reads a 2xx body as text, for `output`. Use it for plain-text tokens, CSV
 * and other bodies that aren't JSON.
 *
 * - `Fetch.text()` gives the text as it was sent, as a `string`. An empty
 *   body is `""`.
 * - `Fetch.text(schema)` reads a single value, such as a count or a
 *   status: it trims the text, then decodes it with `schema`, whose
 *   encoded side is a string, such as `Schema.NumberFromString`. An empty
 *   body fails, as for JSON.
 *
 * Details:
 *
 * - The request's `Accept` header prefers `text/*` and takes any other
 *   type at a lower priority, unless an `accept` header is set on the
 *   call, the endpoint or the client.
 * - A body that can't be read, or doesn't match `schema`, fails the call
 *   with a `DecodeError`, as for JSON.
 * - It works wherever `output` does: on calls, `client.endpoint` and
 *   `Fetch.endpoint`. `error` and `statusErrors` still read JSON.
 * - In a stream (`api.sse`, `api.ndjson` or a `stream` endpoint), it
 *   gives each event's data, or each line, as text.
 * - Pass the schema it returns to `output` as it is, or with more checks
 *   or annotations. A schema built around it, such as with
 *   `Schema.NullOr` or `Schema.decodeTo`, is read as JSON again.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const program = (api: Fetch.Client) =>
 *   Effect.gen(function* () {
 *     const csv = yield* api.get("/export.csv", { output: Fetch.text() });
 *     //    ^? string
 *     const count = yield* api.get("/todos/count", {
 *       output: Fetch.text(Schema.NumberFromString),
 *     });
 *     //    ^? number
 *     return { csv, count };
 *   });
 * ```
 *
 * @since 0.1.0
 */
export function text(): Schema.String;
/**
 * Reads a 2xx body as a single value, such as a count or a status, for
 * `output`: it trims the text, then decodes it with `schema`, whose
 * encoded side is a string, such as `Schema.NumberFromString` or a
 * `Schema.Literals` of strings.
 *
 * It's {@link text} with a schema: the same `Accept` header and errors.
 * Surrounding whitespace, such as a trailing newline, is ignored, and an
 * empty body fails the call with a `DecodeError`, as for JSON, rather
 * than reaching `schema` (which would read `""` as `0` with
 * `Schema.NumberFromString`).
 *
 * It returns `schema`, annotated. Pass it to `output` as it is, or with
 * more checks or annotations. A schema built around it, such as with
 * `Schema.NullOr` or `Schema.decodeTo`, is read as JSON again.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const Status = Fetch.text(Schema.Literals(["up", "down"]));
 *
 * const health = (api: Fetch.Client) => api.get("/health", { output: Status });
 * ```
 *
 * @since 0.1.0
 */
export function text<S extends TextSchema>(schema: S): S["Rebuild"];
export function text(schema?: Schema.Top): Schema.Top {
	return schema === undefined
		? Schema.String.annotate(bodyFormatAnnotation("text"))
		: schema.annotate(bodyFormatAnnotation("textValue"));
}

/**
 * The schema {@link bytes} returns: a `Uint8Array` over an `ArrayBuffer`,
 * read from the body's bytes.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 *
 * const image: Fetch.BytesSchema = Fetch.bytes();
 * ```
 *
 * @since 0.1.0
 */
export interface BytesSchema extends Schema.instanceOf<
	globalThis.Uint8Array<ArrayBuffer>
> {
	/** What `annotate` and `check` return: this schema, so the type stays. */
	readonly Rebuild: BytesSchema;
}

const Bytes = Schema.instanceOf(globalThis.Uint8Array<ArrayBuffer>, {
	expected: "a Uint8Array",
	...bodyFormatAnnotation("bytes"),
}) as BytesSchema;

/**
 * Reads a 2xx body as bytes, a `Uint8Array`, for `output`. Use it for
 * images, PDFs and other binary bodies. The array is typed
 * `Uint8Array<ArrayBuffer>`, so in browsers, Node, Bun and Deno it can go
 * straight into a `Blob`. React Native's `Blob` doesn't take arrays.
 *
 * Details:
 *
 * - The request's `Accept` header takes any type, unless an `accept`
 *   header is set on the call, the endpoint or the client.
 * - An empty body is a `Uint8Array` of length 0.
 * - The array is a copy: changing or transferring it doesn't change what
 *   the response reads later.
 * - A body that can't be read fails the call with a `DecodeError`, as for
 *   JSON.
 * - It works wherever `output` does, except in a stream (`api.sse`,
 *   `api.ndjson` or a `stream` endpoint), which can't take it. `error`
 *   and `statusErrors` still read JSON.
 * - Pass the schema it returns to `output` as it is. A schema built around
 *   it is read as JSON again.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { Fetch } from "@monarcode/effetch";
 *
 * // In a browser
 * const avatar = (api: Fetch.Client) =>
 *   Effect.gen(function* () {
 *     const [bytes, response] = yield* api.get("/me/avatar", {
 *       output: Fetch.bytes(),
 *       responseMode: "decoded-and-response",
 *     });
 *     return new Blob([bytes], {
 *       type: response.headers["content-type"] ?? "image/png",
 *     });
 *   });
 * ```
 *
 * @since 0.1.0
 */
export const bytes = (): BytesSchema => Bytes;
