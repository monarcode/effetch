import * as Schema from "effect/Schema";

import type { AnySchema } from "../Options.js";

/** Decodes a parsed JSON value with `schema`, the way every body is decoded. */
export const decodeJson = <S extends AnySchema>(schema: S) =>
	Schema.decodeUnknownEffect(Schema.toCodecJson(schema));
