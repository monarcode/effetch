import type * as Schema from "effect/Schema";
import type * as SchemaAST from "effect/SchemaAST";

import type { AnySchema } from "../Options.js";

/**
 * How a 2xx body is read before `output` decodes it: JSON, the text as it
 * is (`Fetch.text()`), the text trimmed and required (`Fetch.text(schema)`),
 * or bytes.
 */
export type BodyFormat = "json" | "text" | "textValue" | "bytes";

/** The annotation `Fetch.text` and `Fetch.bytes` mark a schema with. */
export const bodyFormatKey = "@monarcode/effetch/bodyFormat";

/** The annotations that mark a schema as read as `format`. */
export const bodyFormatAnnotation = (
	format: Exclude<BodyFormat, "json">,
): Schema.Annotations.Annotations => ({ [bodyFormatKey]: format });

const isFormat = (u: unknown): u is Exclude<BodyFormat, "json"> =>
	u === "text" || u === "textValue" || u === "bytes";

/**
 * How `output`'s body is read: the format `Fetch.text` or `Fetch.bytes`
 * marked it with, else JSON. The mark is on the schema's node, or on one
 * of its checks when it had checks when marked, and stays there when more
 * checks or annotations are added later.
 */
export const bodyFormat = (schema: AnySchema): BodyFormat => {
	const ast: SchemaAST.AST = schema.ast;
	const own = ast.annotations?.[bodyFormatKey];
	if (isFormat(own)) {
		return own;
	}
	for (const check of ast.checks ?? []) {
		const marked = check.annotations?.[bodyFormatKey];
		if (isFormat(marked)) {
			return marked;
		}
	}
	return "json";
};

/**
 * The `Accept` header a call with `output` sends, unless one is set. Text
 * prefers `text/*` but takes anything, so a server that only has, say,
 * `application/xml` doesn't answer `406`.
 */
export const acceptFor = (format: BodyFormat): string => {
	switch (format) {
		case "json":
			return "application/json";
		case "text":
		case "textValue":
			return "text/*, */*;q=0.1";
		case "bytes":
			return "*/*";
	}
};
