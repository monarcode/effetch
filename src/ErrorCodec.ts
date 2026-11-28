import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Headers from "effect/http/Headers";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaParser from "effect/SchemaParser";
import * as SchemaTransformation from "effect/SchemaTransformation";

import { DecodeError, HttpError, NetworkError } from "./Errors.js";
import { parseErrorBody, readErrorBody } from "./internal/response.js";
import { joinStatusErrors, sentTagOf, tagOf } from "./internal/statusErrors.js";
import type {
	AnySchema,
	CallError,
	StatusError,
	StatusErrorMap,
	StatusErrorSchema,
} from "./Options.js";
import type { StreamFormat } from "./Streams.js";

/**
 * Where {@link errorCodec} reads a call's error schemas from: anything
 * with the `output`, `error` and `statusErrors` an endpoint has.
 *
 * - An endpoint, bound to a client. It already carries the client's
 *   `defaultError` and `statusErrors`.
 * - A definition made with `Fetch.endpoint`, at module level. It only knows
 *   its own schemas, so give the client as `client`.
 * - The schemas themselves, for calls made with the plain methods:
 *   `{ error: ApiError, statusErrors: { 404: NotFound } }`.
 *
 * `output` and `stream` decide whether a `DecodeError` is one of the
 * errors' types: an endpoint or definition with neither has none. Leave
 * `output` out of an object of your own to include it.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const ApiError = Schema.Struct({ code: Schema.String });
 *
 * const source: Fetch.ErrorCodecSource = { error: ApiError };
 * ```
 *
 * @since 0.1.0
 */
export interface ErrorCodecSource {
	/** The schema the call's response is decoded with, if it has one. */
	readonly output?: AnySchema | undefined;
	/** The schema `HttpError.body` is decoded with. */
	readonly error?: AnySchema | undefined;
	/** The errors that statuses turn into. */
	readonly statusErrors?: StatusErrorMap | undefined;
	/** How the call streams its body, if it does. */
	readonly stream?: StreamFormat | undefined;
}

/**
 * The client {@link errorCodec} takes the `defaultError` and
 * `statusErrors` of: a `Fetch.Service` class, or anything with a `config`
 * like one.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 *
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 * }) {}
 *
 * const client: Fetch.ErrorCodecClient = Api;
 * ```
 *
 * @since 0.1.0
 */
export interface ErrorCodecClient {
	/** The client's config, as `Fetch.Service` classes keep it. */
	readonly config: {
		readonly defaultError?: AnySchema | undefined;
		readonly statusErrors?: StatusErrorMap | undefined;
	};
}

/**
 * Options for {@link errorCodec}.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 * import { TimeoutError } from "@monarcode/effetch/plugins";
 *
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 * }) {}
 *
 * const options = { client: Api, errors: [TimeoutError] } satisfies Fetch.ErrorCodecOptions<
 *   typeof Api,
 *   [typeof TimeoutError]
 * >;
 * ```
 *
 * @since 0.1.0
 */
export interface ErrorCodecOptions<
	C extends ErrorCodecClient | undefined = undefined,
	Es extends ReadonlyArray<AnySchema> = [],
> {
	/**
	 * The client whose `defaultError` and `statusErrors` to use. Its
	 * `defaultError` is used when the source has no `error` of its own, and
	 * its `statusErrors` are tried after the source's. A bound endpoint
	 * already has both.
	 */
	readonly client?: C | undefined;
	/**
	 * More errors to send, such as plugins' errors (`TimeoutError`), which
	 * endpoints and clients don't list. Each must be a schema that encodes.
	 */
	readonly errors?: Es | undefined;
}

/**
 * What {@link errorCodec} returns: a codec, the schema for the errors a
 * call can fail with, `E`, whose JSON encoding can cross to a browser, a
 * worker or an RPC client. `RD` and `RE` are the services its schemas
 * need to decode and encode, `never` for most.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 *
 * declare const errors: Fetch.ErrorCodec<Fetch.NetworkError | Fetch.HttpError>;
 * ```
 *
 * @since 0.1.0
 */
export type ErrorCodec<E, RD = never, RE = never> = Schema.Codec<
	E,
	unknown,
	RD,
	RE
>;

/**
 * The errors {@link errorCodec} describes for a source `S`, a client `C`
 * and more errors `Es`: the call's errors, as {@link CallError} gives them,
 * without the plugins' errors, plus `Es`.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type { Fetch } from "@monarcode/effetch";
 *
 * type E = Fetch.ErrorCodecErrors<
 *   { readonly error: Schema.Struct<{ readonly code: Schema.String }> },
 *   undefined,
 *   []
 * >;
 * //   ^? NetworkError | HttpError.With<{ readonly code: string }> | DecodeError
 * ```
 *
 * @since 0.1.0
 */
export type ErrorCodecErrors<
	S extends ErrorCodecSource,
	C extends ErrorCodecClient | undefined,
	Es extends ReadonlyArray<AnySchema>,
> =
	| CallError<OutputOf<S>, BodyOf<S, C>, [], StatusErrorsOf<S, C>>
	| Es[number]["Type"];

/**
 * `undefined` when `S` has no `output` and doesn't stream, so the errors
 * have no `DecodeError`. A stream fails with one while it's read.
 */
type OutputOf<S> = S extends {
	readonly output: undefined;
	readonly stream?: undefined;
}
	? undefined
	: AnySchema;

/** A schema, or `Schema.Unknown` for `undefined` or nothing. */
type SchemaOrUnknown<EB> = [Exclude<EB, undefined>] extends [never]
	? Schema.Unknown
	: Exclude<EB, undefined> extends AnySchema
		? Exclude<EB, undefined>
		: Schema.Unknown;

/** The schema `HttpError.body` is decoded with: the source's, else the client's. */
type BodyOf<S, C> = S extends { readonly error: infer EB extends AnySchema }
	? EB
	: C extends { readonly config: { readonly defaultError?: infer EB } }
		? SchemaOrUnknown<EB>
		: Schema.Unknown;

/** The source's `statusErrors` maps, and the client's. */
type StatusErrorsOf<S, C> =
	| (S extends { readonly statusErrors: infer SE }
			? Extract<SE, StatusErrorMap>
			: never)
	| (C extends { readonly config: { readonly statusErrors?: infer SE } }
			? Extract<SE, StatusErrorMap>
			: never);

/**
 * An `HttpError` as it's sent: no headers, so `set-cookie` and the like
 * stay put, and no `body`, which is decoded again from `text` with `body`,
 * as the call decoded it.
 */
const httpErrorFromText = (body: AnySchema | undefined) =>
	Schema.TaggedStruct("HttpError", {
		method: Schema.String,
		url: Schema.String,
		status: Schema.Finite,
		text: Schema.String,
	}).pipe(
		Schema.decodeTo(
			Schema.instanceOf(HttpError, { expected: "an HttpError" }),
			SchemaTransformation.transformEffect({
				decode: ({ method, url, status, text }) =>
					Effect.map(
						readErrorBody(parseErrorBody(text), body),
						(decoded) =>
							new HttpError({
								method,
								url,
								status,
								text,
								headers: Headers.empty,
								body: decoded,
							}),
					),
				encode: (error) =>
					Effect.succeed({
						_tag: "HttpError" as const,
						method: error.method,
						url: error.url,
						status: error.status,
						text: error.text,
					}),
			}),
		),
	);

/** The `_tag` that sets apart the errors whose schemas send no `_tag`. */
const untaggedTag = "effetch/UntaggedError";

/**
 * What an error whose schema sends no `_tag` goes with, so the other side
 * decodes it with the same schema: the `_tag` its schema leaves out, as
 * with `Schema.tagDefaultOmit`, else its schema's identifier, such as a
 * class's name, when no other schema has the same; else its schema's place
 * among the rest.
 */
type UntaggedKey =
	| { readonly tag: string }
	| { readonly identifier: string }
	| { readonly index: number };

/** An error schema that sends no `_tag`. */
interface Untagged {
	/** Its JSON codec. The services it needs are the codec's, as its type says. */
	readonly json: Schema.Codec<unknown, unknown>;
	readonly key: UntaggedKey;
	/** Whether its type takes `value`, extra fields and all. */
	readonly is: (value: unknown) => boolean;
	/** Whether its type takes `value` without leaving out any of its fields. */
	readonly isExact: (value: unknown) => boolean;
	/** Its type is a declaration, such as a class, rather than a struct. */
	readonly declaration: boolean;
	readonly schema: AnySchema;
	/** Its type's identifier, such as a class's name. */
	readonly identifier: string | undefined;
	/** Its type's keys, when it's a struct. */
	readonly keys: ReadonlySet<PropertyKey> | undefined;
}

const exactly: SchemaAST.ParseOptions = { onExcessProperty: "error" };

/** A struct's keys, or `undefined` for anything else. */
const structKeys = (ast: SchemaAST.AST) =>
	SchemaAST.isObjects(ast) && ast.indexSignatures.length === 0
		? new Set(ast.propertySignatures.map((signature) => signature.name))
		: undefined;

/**
 * The schemas that send no `_tag`, each with its key. A name, the `_tag`
 * a schema leaves out or its identifier, is a key only when no other
 * schema has it: schemas that share one, such as two classes named
 * `ApiError`, go by place instead, as the other side couldn't tell them
 * apart by name.
 */
const untaggedEntries = (
	schemas: ReadonlyArray<AnySchema>,
): ReadonlyArray<Untagged> => {
	const named = schemas.map((schema) => {
		const type = Schema.toType(schema as Schema.Top);
		const tag = tagOf(schema);
		const identifier = SchemaAST.resolveIdentifier(type.ast);
		const name =
			tag !== undefined
				? `_tag ${tag}`
				: identifier !== undefined
					? `identifier ${identifier}`
					: undefined;
		return { schema, type, tag, identifier, name };
	});
	const counts = new Map<string, number>();
	for (const { name } of named) {
		if (name !== undefined) {
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}
	let index = 0;
	return named.map(({ schema, type, tag, identifier, name }): Untagged => {
		const unique = name !== undefined && counts.get(name) === 1;
		const key: UntaggedKey =
			unique && tag !== undefined
				? { tag }
				: unique && identifier !== undefined
					? { identifier }
					: { index: index++ };
		const validate = SchemaParser.decodeUnknownExit(type);
		return {
			json: Schema.toCodecJson(
				schema as Schema.Top,
			) as unknown as Schema.Codec<unknown, unknown>,
			key,
			is: Schema.is(type),
			isExact: (value) => {
				try {
					return Exit.isSuccess(validate(value, exactly));
				} catch {
					return false;
				}
			},
			declaration: SchemaAST.isDeclaration(type.ast),
			schema,
			identifier,
			keys: structKeys(type.ast),
		};
	});
};

/**
 * How well a struct's `keys` fit `value`: whether they cover all of its
 * own keys, then how many of them they cover.
 */
const fit = (
	keys: ReadonlySet<PropertyKey> | undefined,
	value: unknown,
): ReadonlyArray<number> => {
	if (keys === undefined || typeof value !== "object" || value === null) {
		return [0, 0];
	}
	const own = Object.keys(value);
	const covered = own.filter((key) => keys.has(key)).length;
	return [covered === own.length ? 1 : 0, covered];
};

/**
 * How far up `value`'s prototype chain the entry's class is: 0 for the
 * value's own class. A class matches itself; a copy of one, such as
 * `Conflict.annotate(…)`, matches by the `identifier` a `Schema.Class`
 * has, a half step further, so two classes with the same name aren't
 * taken for each other.
 */
const classDistance = (value: object, entry: Untagged) => {
	let found = Number.POSITIVE_INFINITY;
	let distance = 0;
	for (
		let proto: unknown = Object.getPrototypeOf(value);
		typeof proto === "object" && proto !== null && proto !== Object.prototype;
		proto = Object.getPrototypeOf(proto)
	) {
		const { constructor } = proto as { readonly constructor?: unknown };
		if (constructor === entry.schema) {
			return Math.min(found, distance);
		}
		if (
			found === Number.POSITIVE_INFINITY &&
			entry.identifier !== undefined &&
			typeof constructor === "function" &&
			(constructor as { readonly identifier?: unknown }).identifier ===
				entry.identifier
		) {
			found = distance + 0.5;
		}
		distance++;
	}
	return found;
};

/** Whether `a` ranks above `b`, comparing each place in turn. */
const ranksAbove = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) => {
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return a[i]! > b[i]!;
		}
	}
	return false;
};

/**
 * The schemas that take `value`: those that keep all its fields, so
 * `{ message, id }` doesn't go as a `{ message }` struct, else those that
 * take it with fields to spare.
 */
const takersOf = (entries: ReadonlyArray<Untagged>, value: unknown) => {
	const exact = entries.filter((entry) => entry.isExact(value));
	return exact.length > 0 ? exact : entries.filter((entry) => entry.is(value));
};

/**
 * The schema `value` goes as, of those that take it: a class instance's
 * nearest class, then the struct that covers most of its fields. Ties go
 * to the first listed.
 */
const schemaFor = (entries: ReadonlyArray<Untagged>, value: unknown) => {
	const takers = takersOf(entries, value);
	const instance =
		typeof value === "object" &&
		value !== null &&
		Object.getPrototypeOf(value) !== Object.prototype &&
		Object.getPrototypeOf(value) !== null;
	let found: Untagged | undefined;
	let top: ReadonlyArray<number> = [];
	for (const entry of takers) {
		const asClass = instance && entry.declaration;
		const rank = [
			asClass ? 1 : 0,
			asClass ? -classDistance(value, entry) : 0,
			...fit(entry.keys, value),
		];
		if (found === undefined || ranksAbove(rank, top)) {
			found = entry;
			top = rank;
		}
	}
	return found;
};

/** The key the wire names, or why it names none. */
const keyOf = (wire: {
	readonly tag?: string;
	readonly identifier?: string;
	readonly index?: number;
}): UntaggedKey | undefined => {
	const { tag, identifier, index } = wire;
	const given = [tag, identifier, index].filter((key) => key !== undefined);
	if (given.length !== 1) {
		return undefined;
	}
	return tag !== undefined
		? { tag }
		: identifier !== undefined
			? { identifier }
			: { index: index! };
};

/**
 * The errors whose schemas send no `_tag`, as one member. Each goes as
 * `{ _tag: "effetch/UntaggedError", error }` with its key, `tag`,
 * `identifier` or `index`, and decodes with only the schema that has it.
 * One the other side doesn't know fails to decode, rather than decoding as
 * another.
 */
const untaggedErrors = (entries: ReadonlyArray<Untagged>) => {
	const byKey = new Map(
		entries.map((entry) => [JSON.stringify(entry.key), entry] as const),
	);
	/** The schema the wire's key names, or why none does. */
	const find = (
		wire: Parameters<typeof keyOf>[0],
		options: SchemaAST.ParseOptions,
	): Untagged | SchemaIssue.Issue => {
		const key = keyOf(wire);
		if (key === undefined) {
			return new SchemaIssue.InvalidValue(
				{
					message:
						"an error without a _tag goes with an identifier, a tag or an index",
				},
				wire,
				options,
			);
		}
		const entry = byKey.get(JSON.stringify(key));
		if (entry !== undefined) {
			return entry;
		}
		const [name, value] = Object.entries(key)[0]!;
		return new SchemaIssue.Pointer(
			[name],
			new SchemaIssue.InvalidValue(
				{
					message:
						"index" in key
							? `no error schema without an identifier is at index ${key.index}`
							: `no error schema has the ${"tag" in key ? "_tag" : "identifier"} ${JSON.stringify(value)}`,
				},
				value,
				options,
			),
		);
	};

	return Schema.Struct({
		_tag: Schema.Literal(untaggedTag),
		tag: Schema.optionalKey(Schema.String),
		identifier: Schema.optionalKey(Schema.String),
		index: Schema.optionalKey(Schema.Int),
		error: Schema.Unknown,
	}).pipe(
		Schema.decodeTo(
			Schema.declare(
				(value): value is unknown => takersOf(entries, value).length > 0,
				{ expected: "an error one of the error schemas takes" },
			),
			SchemaTransformation.transformEffect({
				decode: (wire, options) => {
					const found = find(wire, options);
					return "json" in found
						? SchemaParser.decodeUnknownEffect(found.json)(
								wire.error,
								options,
							).pipe(
								Effect.mapError(
									(issue) => new SchemaIssue.Pointer(["error"], issue),
								),
							)
						: Effect.fail(found);
				},
				encode: (value, options) => {
					// The declaration above only lets through values some schema takes.
					const entry = schemaFor(entries, value)!;
					return SchemaParser.encodeUnknownEffect(entry.json)(
						value,
						options,
					).pipe(
						Effect.map((error) => ({
							_tag: untaggedTag as typeof untaggedTag,
							...entry.key,
							error,
						})),
						Effect.mapError(
							(issue) => new SchemaIssue.Pointer(["error"], issue),
						),
					);
				},
			}),
		),
	);
};

/**
 * Whether the schema is a plain `Schema.Union`, with no checks,
 * transformation or identifier of its own, whose members can go as
 * themselves.
 */
const isPlainUnion = (
	schema: AnySchema,
): schema is AnySchema & { readonly members: ReadonlyArray<AnySchema> } => {
	const { ast } = schema;
	return (
		SchemaAST.isUnion(ast) &&
		Array.isArray((schema as { readonly members?: unknown }).members) &&
		ast.checks === undefined &&
		ast.encoding === undefined &&
		(ast as { readonly encodingChecks?: unknown }).encodingChecks ===
			undefined &&
		ast.options?.mode !== "oneOf" &&
		SchemaAST.resolveIdentifier(ast) === undefined
	);
};

/** A plain union's members, in turn, or the schema itself. */
const membersOf = (schema: AnySchema): ReadonlyArray<AnySchema> =>
	isPlainUnion(schema) ? schema.members.flatMap(membersOf) : [schema];

/**
 * Builds a codec for every error a call can fail with: a schema whose JSON
 * encoding (`Schema.toCodecJson`) turns each error into JSON, and decodes
 * it back into the same class, typed as the call types it. Use it to send a
 * call's failures where only data goes: to the browser from a
 * server-rendered page, to an RPC client, to a worker.
 *
 * Give it where the call's schemas are:
 *
 * - an endpoint bound to a client: `Fetch.errorCodec(todos.get)`;
 * - a definition and its client, at module level:
 *   `Fetch.errorCodec(getTodo, { client: Api })`;
 * - the schemas themselves, for the plain methods:
 *   `Fetch.errorCodec({ error: ApiError, statusErrors: { 404: NotFound } })`.
 *
 * What's sent:
 *
 * - An `HttpError` goes with its `method`, `url`, `status` and `text`. Its
 *   `body` is decoded again from `text`, with the call's error schema, so
 *   it's typed on the other side too. The headers aren't sent, and decode
 *   as empty.
 * - A `NetworkError` goes without its `cause`, and a `DecodeError` without
 *   its `issue`. Both decode as `undefined`.
 * - The `statusErrors` errors, and the `errors` you add, go as their own
 *   schemas encode them. One whose schema sends no `_tag` goes with its
 *   schema's name: the `_tag` it leaves out, as with
 *   `Schema.tagDefaultOmit`, or its identifier, such as a class's name. It
 *   decodes with the schema that has that name, wherever the other side
 *   lists it. A schema without a name of its own, such as a plain struct,
 *   goes by its place among those, so both sides must list them in the
 *   same order. A plain `Schema.Union`'s members each count as a schema.
 *
 * Plugins' errors aren't on an endpoint or a client, so add the ones a call
 * can fail with as `errors`, such as `TimeoutError`.
 *
 * The request URL, the response text and a `DecodeError`'s `message`,
 * which can quote the response body, are sent. Keep secrets out of the URLs
 * your server calls and out of the backend's responses, or catch the error
 * and send one of your own.
 *
 * @example
 * ```ts
 * import * as Rpc from "effect/rpc/Rpc";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 * import { TimeoutError, timeout } from "@monarcode/effetch/plugins";
 *
 * class ApiProblem extends Schema.Class<ApiProblem>("ApiProblem")({
 *   code: Schema.String,
 * }) {}
 *
 * class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
 *   "TodoNotFound",
 *   { id: Schema.Finite },
 * ) {}
 *
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 *   defaultError: ApiProblem,
 *   statusErrors: { 404: TodoNotFound },
 *   plugins: [timeout({ duration: "5 seconds" })],
 * }) {}
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
 *
 * // An RPC that fails with what the call fails with.
 * export const GetTodo = Rpc.make("GetTodo", {
 *   payload: { id: Schema.Finite },
 *   success: Todo,
 *   error: Fetch.errorCodec(getTodo, { client: Api, errors: [TimeoutError] }),
 * });
 * ```
 *
 * @since 0.1.0
 */
// The return type writes out the members of ErrorCodecErrors, so a hover shows
// the errors rather than the alias (as the call signatures do with
// CallError). Keep the two in sync: the type tests check they're equal.
export function errorCodec<
	S extends ErrorCodecSource,
	C extends ErrorCodecClient | undefined = undefined,
	const Es extends ReadonlyArray<AnySchema> = [],
>(
	source: S,
	options?: ErrorCodecOptions<C, Es>,
): ErrorCodec<
	| NetworkError
	| ([unknown] extends [BodyOf<S, C>["Type"]]
			? 0 extends 1 & BodyOf<S, C>["Type"]
				? HttpError.With<BodyOf<S, C>["Type"]>
				: HttpError
			: HttpError.With<BodyOf<S, C>["Type"]>)
	| (S extends { readonly output: undefined; readonly stream?: undefined }
			? never
			: DecodeError)
	| StatusError<StatusErrorsOf<S, C>>
	| Es[number]["Type"],
	| BodyOf<S, C>["DecodingServices"]
	| StatusErrorSchema<StatusErrorsOf<S, C>>["DecodingServices"]
	| Es[number]["DecodingServices"],
	| StatusErrorSchema<StatusErrorsOf<S, C>>["EncodingServices"]
	| Es[number]["EncodingServices"]
>;
export function errorCodec(
	source: ErrorCodecSource,
	options?: ErrorCodecOptions<
		ErrorCodecClient | undefined,
		ReadonlyArray<AnySchema>
	>,
): unknown {
	const config = options?.client?.config;
	// The schemas statuses turn into, read as calls read them (the source's,
	// then the client's), then the errors added, each once. A plain union's
	// members come after the schemas listed themselves, so a member doesn't
	// take the place of a schema listed with the same `_tag`.
	const listed = [
		...new Set<AnySchema>([
			...Object.values(
				joinStatusErrors([source.statusErrors, config?.statusErrors]),
			).flat(),
			...(options?.errors ?? []),
		]),
	];
	const others = new Set<AnySchema>([
		...listed.filter((schema) => !isPlainUnion(schema)),
		...listed.filter(isPlainUnion).flatMap(membersOf),
	]);
	const tagged = [...others].filter(
		(schema) => sentTagOf(schema) !== undefined,
	);
	const rest = untaggedEntries(
		[...others].filter((schema) => sentTagOf(schema) === undefined),
	);
	// Effetch's own errors first, then the other tagged ones, then the rest,
	// as one member that names each error's schema: a schema that sends no
	// `_tag` can then neither take another's value when encoding, nor its
	// JSON when decoding. A `DecodeError` is always decoded, though the type
	// leaves it out for a call that can't fail with one.
	const members: ReadonlyArray<AnySchema> = [
		httpErrorFromText(source.error ?? config?.defaultError),
		NetworkError,
		DecodeError,
		...tagged,
		...(rest.length === 0 ? [] : [untaggedErrors(rest)]),
	];
	return Schema.Union(members as unknown as ReadonlyArray<Schema.Top>);
}
