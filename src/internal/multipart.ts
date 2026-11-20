import * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

import type { AnySchema } from "../Options.js";
import { isBlob, isReactNative } from "./platform.js";

/** The annotation `Fetch.multipart` marks an `input` schema with. */
export const multipartKey = "@monarcode/effetch/multipart";

/** The annotations that mark an `input` schema as sent as multipart. */
export const multipartAnnotation: Schema.Annotations.Annotations = {
	[multipartKey]: true,
};

/**
 * `true` when `schema` was marked by `Fetch.multipart`. The mark is on the
 * schema's node, or on one of its checks when it had checks when marked,
 * and stays there when more checks or annotations are added later.
 */
export const isMultipart = (schema: AnySchema): boolean => {
	const ast: SchemaAST.AST = schema.ast;
	if (ast.annotations?.[multipartKey] === true) {
		return true;
	}
	return (ast.checks ?? []).some(
		(check) => check.annotations?.[multipartKey] === true,
	);
};

/** The annotation `Fetch.UploadFile` carries, to find file fields. */
export const uploadFileKey = "@monarcode/effetch/uploadFile";

/** The media type a React Native file without a `type` is sent with. */
export const defaultFileType = "application/octet-stream";

/** Adds the types a value of `ast` can have to `out`: through unions and lists. */
const addLeafTypes = (ast: SchemaAST.AST, out: Array<SchemaAST.AST>): void => {
	if (SchemaAST.isUnion(ast)) {
		for (const type of ast.types) {
			addLeafTypes(type, out);
		}
	} else if (SchemaAST.isArrays(ast)) {
		for (const type of [...ast.elements, ...ast.rest]) {
			addLeafTypes(type, out);
		}
	} else {
		out.push(ast);
	}
};

/**
 * The fields of an encoded multipart schema, `ast`: an object, or a union
 * of them. `fields` maps each declared field to the types a value of it
 * can have (through unions and lists), and `others` lists those of the
 * index signatures, for the fields it doesn't declare.
 */
export interface FormFields {
	readonly fields: ReadonlyMap<string, ReadonlyArray<SchemaAST.AST>>;
	readonly others: ReadonlyArray<SchemaAST.AST>;
}

const addFormFields = (
	ast: SchemaAST.AST,
	fields: Map<string, Array<SchemaAST.AST>>,
	others: Array<SchemaAST.AST>,
): void => {
	if (SchemaAST.isObjects(ast)) {
		for (const property of ast.propertySignatures) {
			if (typeof property.name === "string") {
				let types = fields.get(property.name);
				if (types === undefined) {
					types = [];
					fields.set(property.name, types);
				}
				addLeafTypes(property.type, types);
			}
		}
		for (const signature of ast.indexSignatures) {
			addLeafTypes(signature.type, others);
		}
	} else if (SchemaAST.isUnion(ast)) {
		for (const type of ast.types) {
			addFormFields(type, fields, others);
		}
	}
};

/** The fields of `ast`, a multipart schema's encoded side (see `FormFields`). */
export const formFieldsOf = (ast: SchemaAST.AST): FormFields => {
	const fields = new Map<string, Array<SchemaAST.AST>>();
	const others: Array<SchemaAST.AST> = [];
	addFormFields(ast, fields, others);
	return { fields, others };
};

/** `true` when `ast` is `Fetch.UploadFile`, maybe with checks or annotations. */
const isUploadFileAst = (ast: SchemaAST.AST): boolean =>
	SchemaAST.isDeclaration(ast) && ast.annotations?.[uploadFileKey] === true;

const fileFieldsCache = new WeakMap<SchemaAST.AST, (name: string) => boolean>();

/**
 * Whether a field of `schema`, a multipart input schema, is a file field:
 * one whose encoded side takes a `Fetch.UploadFile`, alone, in a union or
 * in a list. Only those send a React Native file, `{ uri, name, type }`.
 */
export const fileFieldsOf = (
	schema: AnySchema,
): ((name: string) => boolean) => {
	let isFileField = fileFieldsCache.get(schema.ast);
	if (isFileField === undefined) {
		const { fields, others } = formFieldsOf(SchemaAST.toEncoded(schema.ast));
		const names = new Set<string>();
		for (const [name, types] of fields) {
			if (types.some(isUploadFileAst)) {
				names.add(name);
			}
		}
		const otherFiles = others.some(isUploadFileAst);
		isFileField = (name) =>
			names.has(name) || (otherFiles && !fields.has(name));
		fileFieldsCache.set(schema.ast, isFileField);
	}
	return isFileField;
};

/** React Native's file: what its `FormData` reads from disk by `uri`. */
export interface RuntimeNativeFile {
	readonly uri: string;
	readonly name: string;
	readonly type?: string | undefined;
}

/**
 * `true` for a React Native file: an object, not a `Blob`, with a string
 * `uri` and `name`, and a `type` that's a string when it's there.
 */
export const isNativeFile = (u: unknown): u is RuntimeNativeFile => {
	if (typeof u !== "object" || u === null || isBlob(u)) {
		return false;
	}
	const { uri, name, type } = u as Record<string, unknown>;
	return (
		typeof uri === "string" &&
		typeof name === "string" &&
		(type === undefined || typeof type === "string")
	);
};

/** `true` for a value `Fetch.UploadFile` accepts: a `Blob`, or a native file. */
export const isUploadFile = (u: unknown): boolean =>
	isBlob(u) || isNativeFile(u);

const invalidBody = (message: string): Effect.Effect<never> =>
	Effect.die(new Error(`Invalid request body: ${message}`));

const isDate = (u: unknown): u is Date =>
	Object.prototype.toString.call(u) === "[object Date]";

/** Appends one value of `name`, or says why it can't be sent. */
const appendValue = (
	form: FormData,
	name: string,
	value: unknown,
	isFileField: boolean,
): string | undefined => {
	switch (typeof value) {
		case "string":
			form.append(name, value);
			return undefined;
		case "number":
		case "boolean":
		case "bigint":
			form.append(name, String(value));
			return undefined;
		case "undefined":
			return undefined;
	}
	if (value === null) {
		return undefined;
	}
	if (isBlob(value)) {
		form.append(name, value);
		return undefined;
	}
	if (isFileField && isNativeFile(value)) {
		if (!isReactNative()) {
			return `the field "${name}" is a React Native file (\`{ uri, name, type }\`), which only React Native can send. Elsewhere, send a \`Blob\` or a \`File\``;
		}
		// React Native's `FormData` reads this object's file from disk by
		// `uri`, though its `append` is typed for `Blob`s. Android rejects a
		// file part without a type, so it gets a generic one.
		const file = {
			uri: value.uri,
			name: value.name,
			type: value.type ?? defaultFileType,
		};
		form.append(name, file as unknown as Blob);
		return undefined;
	}
	if (isDate(value)) {
		if (Number.isNaN(value.getTime())) {
			return `the field "${name}" is an invalid Date`;
		}
		form.append(name, value.toISOString());
		return undefined;
	}
	return `the field "${name}" is ${Array.isArray(value) ? "a list inside a list" : "an object"}, which a form can't hold. Send it as a string, such as with \`Schema.fromJsonString\`, or as a file, with \`Fetch.UploadFile\``;
};

/**
 * Builds the `FormData` of a multipart body from the value `input`
 * encoded it to, an object of fields:
 *
 * - strings as they are; numbers, booleans and bigints as strings; a
 *   `Date` as its ISO string;
 * - a `Blob` or `File` as a file part; a React Native file
 *   (`{ uri, name, type }`) as one too, in React Native only and in the
 *   fields `isFileField` accepts (see `fileFieldsOf`), with
 *   `application/octet-stream` when it has no `type`;
 * - a list as one part per item, under the same name;
 * - `null` and `undefined` left out.
 *
 * Anything else, such as a nested object or a list of lists, dies with an
 * `Invalid request body:` defect, as a body that doesn't match `input`
 * does.
 */
export const buildForm = (
	encoded: unknown,
	isFileField: (name: string) => boolean,
): Effect.Effect<FormData> => {
	if (
		typeof encoded !== "object" ||
		encoded === null ||
		Array.isArray(encoded) ||
		isBlob(encoded)
	) {
		return invalidBody(
			"a multipart input schema must encode the body to an object of fields",
		);
	}
	const form = new globalThis.FormData();
	for (const [name, value] of Object.entries(encoded)) {
		const fileField = isFileField(name);
		const values: ReadonlyArray<unknown> = Array.isArray(value)
			? value
			: [value];
		for (const item of values) {
			const problem = appendValue(form, name, item, fileField);
			if (problem !== undefined) {
				return invalidBody(problem);
			}
		}
	}
	return Effect.succeed(form);
};
