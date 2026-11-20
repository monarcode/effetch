import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

import {
	isUploadFile,
	multipartAnnotation,
	uploadFileKey,
} from "./internal/multipart.js";

const noJson = SchemaGetter.forbidden<never, unknown>(
	() =>
		"a file can't be sent as JSON. To upload it, wrap the input schema in `Fetch.multipart`",
);

/**
 * A file picked in React Native: the object React Native's pickers give,
 * and its `FormData` reads from disk by `uri`.
 *
 * - `uri`: where the file is, such as `file:///…` or `content://…`.
 * - `name`: the file name sent with it. A server only treats a part as a
 *   file when it has one, so it's required.
 * - `type`: its media type, such as `"image/jpeg"`. Without it, the part
 *   is sent as `application/octet-stream`, since Android rejects a file
 *   part without a type.
 *
 * Only React Native can send one. Elsewhere, send a `Blob` or a `File`.
 *
 * @example
 * ```ts
 * import type { Fetch } from "@monarcode/effetch";
 *
 * declare const picked: {
 *   readonly uri: string;
 *   readonly fileName: string;
 *   readonly mimeType: string;
 * };
 *
 * const file: Fetch.NativeFile = {
 *   uri: picked.uri,
 *   name: picked.fileName,
 *   type: picked.mimeType,
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface NativeFile {
	/** Where the file is, such as `file:///…` or `content://…`. */
	readonly uri: string;
	/** The file name sent with it, which makes the part a file. */
	readonly name: string;
	/**
	 * The file's media type, such as `"image/jpeg"`:
	 * `application/octet-stream` when it's left out.
	 */
	readonly type?: string | undefined;
}

/**
 * The schema {@link UploadFile} is: a `Blob` (a `File` is one) or a
 * {@link NativeFile}, encoded as it is.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const Avatar: Fetch.UploadFileSchema = Fetch.UploadFile;
 * type Avatar = Schema.Schema.Type<typeof Avatar>; // Blob | Fetch.NativeFile
 * ```
 *
 * @since 0.1.0
 */
export interface UploadFileSchema extends Schema.declare<Blob | NativeFile> {
	/** What `annotate` and `check` return: this schema, so the type stays. */
	readonly Rebuild: UploadFileSchema;
}

/**
 * A file to upload, for a field of a {@link multipart} input schema. It
 * takes the files each platform can send:
 *
 * - in browsers, Node, Bun and Deno, a `Blob` or `File`;
 * - in React Native, a {@link NativeFile}, `{ uri, name, type }`, as its
 *   pickers give it. React Native's `FormData` reads the file from disk by
 *   `uri`, and can't send a `Blob`.
 *
 * Each value is sent as a file part, as it is. Use it rather than
 * `Schema.File`, which only takes a `File`, and which `FetchTest` can't
 * read back from a form.
 *
 * Details:
 *
 * - It checks the value's shape. A `NativeFile` sent outside React Native,
 *   where `FormData` would send `"[object Object]"`, makes the call die
 *   with an `Invalid request body:` defect.
 * - A file has no JSON form: in an `input` schema without
 *   {@link multipart}, it makes the call die.
 * - To check a file's size, add a check. A `NativeFile` has no size until
 *   it's read, so check a `Blob` only (see the example).
 * - The test backend, `FetchTest`, gives it to a handler as a `File`, or
 *   as the `NativeFile` it was sent as in React Native.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * export const uploadDocument = Fetch.endpoint("POST /documents", {
 *   input: Fetch.multipart(
 *     Schema.Struct({
 *       file: Fetch.UploadFile,
 *       kind: Schema.Literals(["PASSPORT", "DRIVERS_LICENSE"]),
 *     }),
 *   ),
 *   output: Schema.Struct({ id: Schema.String }),
 * });
 *
 * // At most 10 MB, for a Blob or File.
 * export const SmallFile = Fetch.UploadFile.check(
 *   Schema.makeFilter(
 *     (file) => !(file instanceof Blob) || file.size < 10_000_000,
 *     { expected: "a file under 10 MB" },
 *   ),
 * );
 * ```
 *
 * @since 0.1.0
 */
export const UploadFile: UploadFileSchema = Schema.declare(
	(u): u is Blob | NativeFile => isUploadFile(u),
	{
		expected: "a file: a Blob, a File, or a React Native { uri, name, type }",
		[uploadFileKey]: true,
		// Sent as it is: a form field that's a file has no string form.
		toCodecStringTree: () => undefined,
		// A file has no JSON form: a JSON body with one fails to encode.
		toCodecJson: () =>
			Schema.link<Blob | NativeFile>()(Schema.Unknown, {
				decode: noJson,
				encode: noJson,
			}),
	},
) as UploadFileSchema;

/**
 * One value of a multipart field, as an `input` schema encodes it: a
 * string, a number, a boolean, a bigint or a `Date` (sent as text), a file
 * (`Blob`, `File` or {@link NativeFile}), or `null` or `undefined` (left
 * out).
 *
 * @example
 * ```ts
 * import type { Fetch } from "@monarcode/effetch";
 *
 * const values: ReadonlyArray<Fetch.MultipartValue> = ["a", 1, true, null];
 * ```
 *
 * @since 0.1.0
 */
export type MultipartValue =
	| string
	| number
	| boolean
	| bigint
	| Date
	| Blob
	| NativeFile
	| null
	| undefined;

/**
 * What a {@link multipart} input schema encodes a body to: an object of
 * fields, each a {@link MultipartValue} or a list of them.
 *
 * @example
 * ```ts
 * import type { Fetch } from "@monarcode/effetch";
 *
 * declare const file: Blob;
 *
 * const fields: Fetch.MultipartFields = { file, tags: ["a", "b"], note: null };
 * ```
 *
 * @since 0.1.0
 */
export type MultipartFields = {
	readonly [name: string]: MultipartValue | ReadonlyArray<MultipartValue>;
};

/**
 * A schema {@link multipart} takes: one whose encoded side is
 * {@link MultipartFields}, such as a `Schema.Struct` of strings, numbers,
 * booleans, dates, lists of them and {@link UploadFile}s.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const Upload: Fetch.MultipartSchema = Schema.Struct({
 *   file: Fetch.UploadFile,
 *   caption: Schema.optional(Schema.String),
 * });
 * ```
 *
 * @since 0.1.0
 */
export type MultipartSchema = Schema.Top & {
	readonly Encoded: MultipartFields;
};

/**
 * Sends a body as `multipart/form-data`, for `input`: the body is typed
 * and checked by `schema`, as for JSON, then sent as `FormData`. Use it
 * for file uploads.
 *
 * The body is encoded with `schema`, then each field of what it encodes
 * to becomes form parts:
 *
 * - a string as it is; a number, boolean or bigint as a string; a `Date`
 *   as its ISO string;
 * - a `Blob` or `File` as a file part, and a {@link NativeFile} too, in a
 *   {@link UploadFile} field (see it for which platform sends which);
 * - a list as one part per item, under the same name;
 * - `null` and `undefined` left out.
 *
 * A form can't hold a nested object or a list of lists: TypeScript
 * rejects most schemas that encode to one, and a value that does at
 * runtime makes the call die. A struct shaped like a {@link NativeFile},
 * `{ uri, name }`, passes TypeScript, but isn't a file unless it's an
 * {@link UploadFile}, so it dies too. To send one, encode it to a string
 * in the schema, such as with `Schema.fromJsonString`.
 *
 * Details:
 *
 * - A body that doesn't match `schema` makes the call die with an
 *   `Invalid request body:` defect, as for JSON.
 * - The request sets no `Content-Type`, so the platform adds the multipart
 *   boundary. A `content-type` header from the call, the endpoint or the
 *   client is removed. One a plugin's `onRequest` sets is kept, and
 *   replaces the boundary.
 * - Each field must encode to a string, number, boolean, bigint, `Date`,
 *   file, `null` or `undefined`, or a list of them. A schema that encodes
 *   to an object, such as `Schema.DateTimeUtc`, needs a string form, such
 *   as `Schema.DateTimeUtcFromString`.
 * - It works wherever `input` does: on methods such as `api.post`, on
 *   `client.endpoint` and `Fetch.endpoint`, and in `api.sse` and
 *   `api.ndjson`.
 * - It returns `schema`, annotated. Pass it to `input` as it is, or with
 *   more checks or annotations. A schema built around it is sent as JSON
 *   again.
 * - `FetchTest` reads the form back into the body a handler gets, decoded
 *   with `schema`, as best it can, since a form has no `null`, `undefined`
 *   or empty list, and every part is a string:
 *   - A field left out comes back missing when it's optional. When it's
 *     required, it comes back as `null` if it takes `null`, then as `[]`
 *     if it's a list, then as `undefined`.
 *   - In a field that takes `null`, the string `"null"` comes back as
 *     `null`, and in `Schema.Union([Schema.String, Schema.Finite])` the
 *     string `"12"` comes back as the number `12`.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const uploadDocument = Fetch.endpoint("POST /documents", {
 *   input: Fetch.multipart(
 *     Schema.Struct({
 *       file: Fetch.UploadFile,
 *       kind: Schema.String,
 *       pages: Schema.optional(Schema.Finite),
 *     }),
 *   ),
 *   output: Schema.Struct({ id: Schema.String }),
 * });
 *
 * declare const api: Fetch.Client;
 * declare const file: File;
 *
 * const program = Effect.gen(function* () {
 *   const upload = api.bind(uploadDocument);
 *   return yield* upload({ body: { file, kind: "PASSPORT", pages: 2 } });
 * });
 * ```
 *
 * @since 0.1.0
 */
export const multipart = <S extends MultipartSchema>(schema: S): S["Rebuild"] =>
	schema.annotate(multipartAnnotation);
