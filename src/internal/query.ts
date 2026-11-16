import * as Effect from "effect/Effect";
import * as UrlParams from "effect/http/UrlParams";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import type { QueryInput, QuerySchema } from "../Options.js";
import { messageOf } from "./message.js";
import { isRecord } from "./object.js";

/** One query value as `UrlParams` holds it. */
type Param = UrlParams.UrlParams["params"][number][1];

/**
 * A `Redacted` value is kept as it is (Effect 4.1 accepts them in
 * `UrlParams`, unwraps them for the URL and redacts them in its own logs);
 * anything else goes through `String()`.
 *
 * The cast compiles with Effect 4.0 too, where `Param` is `string`. There,
 * only a value cast to `QueryValue` can be `Redacted`, and Effect 4.0 sends
 * it as `<redacted>`, as before 4.1.
 */
const toParam = (value: unknown): Param =>
	(Redacted.isRedacted(value) ? value : String(value)) as Param;

/**
 * Converts the `query` option into `UrlParams`, in key order. Arrays repeat
 * the key; `null` and `undefined` values and array items are dropped.
 *
 * Deliberately not `UrlParams.fromInput(query)`: that sends a `null` value
 * as the string `"null"` and keeps `null` array items.
 */
export const toUrlParams = (
	query: QueryInput | undefined,
): UrlParams.UrlParams => {
	const entries: Array<readonly [string, Param]> = [];
	if (query !== undefined) {
		for (const [key, value] of Object.entries(query)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item !== null && item !== undefined) {
						entries.push([key, toParam(item)]);
					}
				}
			} else if (value !== null && value !== undefined) {
				entries.push([key, toParam(value)]);
			}
		}
	}
	return UrlParams.make(entries);
};

/** The string-tree codec of each query schema, derived once. */
type QueryCodec = Schema.Codec<unknown, unknown, unknown, unknown>;

const codecs = new WeakMap<QuerySchema, QueryCodec>();

const invalidQuery = (message: string, cause?: unknown): Error =>
	new Error(`Invalid query: ${message}`, { cause });

/**
 * The codec that encodes each field of `schema` to a string. Throws when
 * a field's schema has no string encoding, such as
 * `Schema.instanceOf(Uint8Array)`.
 */
export const codecOf = (schema: QuerySchema): QueryCodec => {
	let codec = codecs.get(schema);
	if (codec === undefined) {
		try {
			codec = Schema.toCodecStringTree(schema);
		} catch (error) {
			throw new Error(
				`Invalid query schema: it can't be encoded to strings: ${messageOf(error)}`,
				{ cause: error },
			);
		}
		codecs.set(schema, codec);
	}
	return codec;
};

/**
 * Checks, when an endpoint is defined, that its query schema can be
 * encoded to strings, so a bad schema throws when the module loads rather
 * than on the first call.
 */
export const checkQuerySchema = (schema: QuerySchema | undefined): void => {
	if (schema !== undefined) {
		codecOf(schema);
	}
};

/** What `toUrlParams` sends: a string, number, boolean or bigint. */
const isScalar = (u: unknown): boolean =>
	typeof u === "string" ||
	typeof u === "number" ||
	typeof u === "boolean" ||
	typeof u === "bigint";

const isEmpty = (u: unknown): boolean => u === null || u === undefined;

/**
 * Whether a `Redacted` query value stays redacted in `UrlParams` and is
 * sent as its value (Effect 4.1 and later). Effect 4.0 sends `<redacted>`.
 */
let keepsRedacted: boolean | undefined;
const redactedIsSent = (): boolean =>
	(keepsRedacted ??=
		UrlParams.toString(
			UrlParams.make([["k", Redacted.make("v") as never]]),
		) === "k=v");

/**
 * The revealed values of the `Redacted` fields of `query`, and of the
 * `Redacted` items of its array fields, as strings.
 */
const secretsOf = (query: unknown): ReadonlySet<string> => {
	const secrets = new Set<string>();
	if (typeof query === "object" && query !== null) {
		for (const value of Object.values(query)) {
			for (const item of Array.isArray(value) ? value : [value]) {
				if (Redacted.isRedacted(item)) {
					secrets.add(String(Redacted.value(item)));
				}
			}
		}
	}
	return secrets;
};

/**
 * The query to send from what the schema encoded `query` to: scalars, or
 * arrays of them, with `null` and `undefined` dropped later by
 * `toUrlParams`. Returns the error for anything else, such as a field that
 * encodes to an object.
 *
 * The schema reveals `Schema.Redacted` fields. Where Effect keeps a
 * `Redacted` query value redacted in its logs and traces (4.1 and later),
 * an encoded value equal to one of `query`'s revealed secrets is wrapped
 * in `Redacted` again, so it stays out of them, as a `Redacted` value in a
 * plain query does.
 */
const toQuery = (encoded: unknown, query: unknown): QueryInput | Error => {
	if (!isRecord(encoded)) {
		return invalidQuery("the query schema doesn't encode to an object");
	}
	const secrets = redactedIsSent() ? secretsOf(query) : new Set<string>();
	const hide = (value: unknown): unknown =>
		typeof value === "string" && secrets.has(value)
			? Redacted.make(value)
			: value;
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(encoded)) {
		if (Array.isArray(value)) {
			const nested = value.find((item) => !isScalar(item) && !isEmpty(item));
			if (nested !== undefined) {
				return invalidQuery(
					`"${key}" encodes to ${Array.isArray(nested) ? "an array" : "an object"} inside an array, which can't be a query parameter`,
				);
			}
			result[key] = secrets.size === 0 ? value : value.map(hide);
		} else if (isScalar(value) || isEmpty(value)) {
			result[key] = hide(value);
		} else {
			return invalidQuery(
				`"${key}" encodes to an object, which can't be a query parameter`,
			);
		}
	}
	return result as QueryInput;
};

/** The error for an encoding failure: a mismatch, or the schema itself. */
const encodeError = (error: unknown): Error =>
	Schema.isSchemaError(error)
		? invalidQuery(
				`it doesn't match the query schema: ${error.message}`,
				error,
			)
		: invalidQuery(
				`the query schema can't encode it: ${messageOf(error)}`,
				error,
			);

/**
 * Encodes a call's `query` with the endpoint's query schema, each field to
 * a string (see `QuerySchema`). A missing `query` is encoded as `{}`.
 *
 * Dies (it does not fail) when `query` doesn't match the schema, the
 * schema can't encode it, or a field encodes to an object, as an invalid
 * body does. The defect is an `Error` whose message starts with
 * `Invalid query:`.
 */
export const encodeQuery = <S extends QuerySchema>(
	schema: S,
	query: unknown,
): Effect.Effect<QueryInput, never, S["EncodingServices"]> =>
	Effect.suspend(() =>
		Schema.encodeUnknownEffect(codecOf(schema))(query ?? {}),
	).pipe(
		// Defects first, so the failure's own defect below isn't wrapped twice.
		Effect.catchDefect((defect) => Effect.die(encodeError(defect))),
		Effect.catch((error) => Effect.die(encodeError(error))),
		Effect.flatMap((encoded) => {
			const result = toQuery(encoded, query);
			return result instanceof Error
				? Effect.die(result)
				: Effect.succeed(result);
		}),
	) as Effect.Effect<QueryInput, never, S["EncodingServices"]>;

/**
 * {@link encodeQuery}, run synchronously, for `endpoint.url`. Throws the
 * error the call would die with, and also when the schema needs services
 * or runs asynchronously.
 */
export const encodeQuerySync = (
	schema: QuerySchema,
	query: unknown,
): QueryInput => {
	let encoded: unknown;
	try {
		encoded = Schema.encodeUnknownSync(
			codecOf(schema) as Schema.Codec<unknown, unknown>,
		)(query ?? {});
	} catch (error) {
		throw encodeError(error);
	}
	const result = toQuery(encoded, query);
	if (result instanceof Error) {
		throw result;
	}
	return result;
};
