import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

import type { AnySchema, StatusErrorMap } from "../Options.js";
import { decodeJson } from "./json.js";
import { hasOwn } from "./object.js";

/** A `StatusErrorMap` entry as a list. */
const entryList = (
	entry: AnySchema | ReadonlyArray<AnySchema> | undefined,
): ReadonlyArray<AnySchema> =>
	entry === undefined
		? []
		: Array.isArray(entry)
			? entry
			: [entry as AnySchema];

/** `true` for the keys of a map that are statuses, such as `"404"`. */
const isStatusKey = (key: string): boolean => /^\d+$/.test(key);

/**
 * A frozen copy of `map`, with the same shape: a list entry is copied and
 * frozen too. Maps are copied where they're given (`make`, an endpoint's
 * definition), so changing the original later changes nothing.
 */
export const freezeStatusErrors = <M extends StatusErrorMap | undefined>(
	map: M,
): M =>
	map === undefined
		? map
		: (Object.freeze(
				Object.fromEntries(
					Object.entries(map).map(([status, entry]) => [
						status,
						Array.isArray(entry) ? Object.freeze([...entry]) : entry,
					]),
				),
			) as M);

/**
 * The schemas to try for `status`, in order: each map's entry for it, the
 * first map's first. A schema listed twice is tried once.
 */
export const statusErrorsFor = (
	status: number,
	maps: ReadonlyArray<StatusErrorMap | undefined>,
): ReadonlyArray<AnySchema> => {
	const schemas = maps.flatMap((map) =>
		map === undefined ? [] : entryList(map[status]),
	);
	return schemas.length < 2 ? schemas : [...new Set(schemas)];
};

/** A joined map without any status. */
const empty: { readonly [status: number]: ReadonlyArray<AnySchema> } =
	Object.freeze({});

/**
 * The maps joined into one, every entry a list: for each status, the first
 * map's schemas, then the next map's. Keys that aren't statuses are left
 * out, as they never apply. Frozen, as it's only read.
 */
export const joinStatusErrors = (
	maps: ReadonlyArray<StatusErrorMap | undefined>,
): { readonly [status: number]: ReadonlyArray<AnySchema> } => {
	const statuses = new Set(
		maps.flatMap((map) =>
			map === undefined ? [] : Object.keys(map).filter(isStatusKey),
		),
	);
	if (statuses.size === 0) {
		return empty;
	}
	const joined: Record<string, ReadonlyArray<AnySchema>> = {};
	for (const status of statuses) {
		joined[status] = Object.freeze(statusErrorsFor(Number(status), maps));
	}
	return Object.freeze(joined);
};

/** The `_tag` of each schema seen, or `null` for a schema without one. */
const tags = new WeakMap<AnySchema, string | null>();

/**
 * The literal `_tag` the schema's JSON form has, such as `"InvalidRole"`
 * for a `Schema.TaggedError` class, or `undefined` without one. It's read
 * from the encoded side, so it also works through `Schema.encodeKeys` and
 * `Schema.tagDefaultOmit`.
 */
export const tagOf = (schema: AnySchema): string | undefined => {
	let tag = tags.get(schema);
	if (tag === undefined) {
		tag = null;
		const encoded = SchemaAST.toEncoded(Schema.toCodecJson(schema).ast);
		if (SchemaAST.isObjects(encoded)) {
			const property = encoded.propertySignatures.find(
				(signature) => signature.name === "_tag",
			);
			if (
				property !== undefined &&
				SchemaAST.isLiteral(property.type) &&
				typeof property.type.literal === "string"
			) {
				tag = property.type.literal;
			}
		}
		tags.set(schema, tag);
	}
	return tag ?? undefined;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Decodes an error body with one `statusErrors` schema: some error when it
 * matches, none when it doesn't. Backends don't send a `_tag`, so when the
 * schema has a literal one and the body is an object without one, it's
 * added first. A schema that dies while decoding is a defect.
 */
export const decodeStatusError = <S extends AnySchema>(
	schema: S,
	json: unknown,
): Effect.Effect<Option.Option<S["Type"]>, never, S["DecodingServices"]> => {
	const tag = tagOf(schema);
	const body =
		tag !== undefined && isRecord(json) && !hasOwn(json, "_tag")
			? { ...json, _tag: tag }
			: json;
	return Effect.option(decodeJson(schema)(body));
};
