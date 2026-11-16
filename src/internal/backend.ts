import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as HttpMethod from "effect/http/HttpMethod";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

import type { AnySchema, QuerySchema, StatusErrorMap } from "../Options.js";
import type { StreamFormat } from "../Streams.js";
import { isBlob, isGlobalInstance, toBytes } from "./body.js";
import { decodeJson } from "./json.js";
import { messageOf } from "./message.js";
import { hasOwn } from "./object.js";
import { bodyFormat } from "./output.js";
import { codecOf, toUrlParams } from "./query.js";
import { statusErrorsFor } from "./statusErrors.js";
import { targetUrl } from "./target.js";
import { errorUrl, isAbsoluteUrl } from "./url.js";

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

/** Marks the values `reply` makes. */
export const ReplyTypeId = "~@monarcode/effetch/test/Reply";

/** A response a handler sends as it is, as seen at runtime. */
export interface RuntimeReply {
	readonly [ReplyTypeId]: typeof ReplyTypeId;
	readonly status: number;
	readonly body: unknown;
	readonly headers: Headers.Headers;
}

/** `true` for the values `reply` makes. */
export const isReply = (u: unknown): u is RuntimeReply =>
	typeof u === "object" &&
	u !== null &&
	(u as { readonly [ReplyTypeId]?: unknown })[ReplyTypeId] === ReplyTypeId;

/** The statuses whose responses can't have a body. */
const nullBodyStatuses = new Set([204, 205, 304]);

/**
 * Checks that `status` can be a response's status, as `Response` requires:
 * an integer from 200 to 599. Throws with `where` in the message.
 */
export const checkStatus = (status: number, where: string): void => {
	if (!Number.isInteger(status) || status < 200 || status > 599) {
		throw new RangeError(
			`${where}: the status must be an integer from 200 to 599, got ${String(status)}`,
		);
	}
};

/** Makes a reply, checking its status and body first. */
export const makeReply = (
	status: number,
	body: unknown,
	headers: Headers.Input | undefined,
): RuntimeReply => {
	checkStatus(status, "FetchTest.reply");
	if (body !== undefined && nullBodyStatuses.has(status)) {
		throw new TypeError(
			`FetchTest.reply: a ${status} response can't have a body`,
		);
	}
	return Object.freeze({
		[ReplyTypeId]: ReplyTypeId,
		status,
		body,
		headers: Headers.fromInput(headers ?? {}),
	});
};

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

/**
 * A response body and the content type it's sent with. Without a content
 * type, `Response` sets one from the body, such as `FormData`'s multipart
 * boundary.
 */
interface Payload {
	readonly body: string | Uint8Array | Blob | FormData | null;
	readonly contentType: string | undefined;
}

const empty: Payload = { body: null, contentType: undefined };

const defect = (message: string, cause?: unknown): Effect.Effect<never> =>
	Effect.die(new Error(`FetchTest: ${message}`, { cause }));

/**
 * `value` as a JSON body. Dies, naming `what`, when it has no JSON form,
 * such as a `bigint`, a cycle or a function.
 */
const jsonPayload = (value: unknown, what: string): Effect.Effect<Payload> =>
	Effect.suspend(() => {
		let json: string | undefined;
		try {
			json = JSON.stringify(value);
		} catch (error) {
			return defect(
				`${what} can't be sent as JSON: ${messageOf(error)}`,
				error,
			);
		}
		return json === undefined
			? defect(
					`${what} can't be sent as JSON: ${typeof value} has no JSON form`,
				)
			: Effect.succeed({ body: json, contentType: "application/json" });
	});

/**
 * A body sent by its runtime type, as effetch sends a call's `body` without
 * `input` (see `encodeBody`): nothing for `undefined`, text for a string,
 * bytes for an `ArrayBuffer` or any view of one, a `Blob` or `FormData` as
 * it is, a form for `URLSearchParams`, and JSON for anything else. Dies
 * when it has no JSON form.
 */
const plainPayload = (value: unknown, what: string): Effect.Effect<Payload> => {
	if (value === undefined) {
		return Effect.succeed(empty);
	}
	if (typeof value === "string") {
		return Effect.succeed({ body: value, contentType: "text/plain" });
	}
	if (ArrayBuffer.isView(value) || isGlobalInstance(value, "ArrayBuffer")) {
		return Effect.succeed({
			body: toBytes(value as ArrayBuffer | ArrayBufferView),
			contentType: "application/octet-stream",
		});
	}
	if (isBlob(value)) {
		return Effect.succeed({
			body: value,
			contentType: value.type === "" ? undefined : value.type,
		});
	}
	if (isGlobalInstance(value, "FormData")) {
		return Effect.succeed({
			body: value as FormData,
			contentType: undefined,
		});
	}
	if (isGlobalInstance(value, "URLSearchParams")) {
		return Effect.succeed({
			body: String(value),
			contentType: "application/x-www-form-urlencoded",
		});
	}
	return jsonPayload(value, what);
};

/**
 * `value` encoded with `output`, in the format the client reads it in (see
 * `bodyFormat`): JSON, text or bytes. Dies when it doesn't match `output`.
 */
const outputPayload = (
	output: AnySchema,
	value: unknown,
	route: string,
): Effect.Effect<Payload, never, unknown> => {
	const mismatch = (error: Schema.SchemaError) =>
		defect(
			`the handler for ${route} returned a value that doesn't match its output schema: ${error.message}`,
			error,
		);
	const format = bodyFormat(output);
	if (format === "json") {
		// `undefined`, for `Schema.Void` and the like, is sent as no body,
		// which the client reads as JSON `null`.
		return Schema.encodeUnknownEffect(Schema.toCodecJson(output))(value).pipe(
			Effect.catch(mismatch),
			Effect.flatMap((encoded) =>
				value === undefined || encoded === undefined
					? Effect.succeed(empty)
					: jsonPayload(
							encoded,
							`the value the handler for ${route} returned`,
						),
			),
		);
	}
	return Schema.encodeUnknownEffect(output)(value).pipe(
		Effect.map((encoded): Payload =>
			format === "bytes"
				? {
						body: encoded as Uint8Array,
						contentType: "application/octet-stream",
					}
				: { body: encoded as string, contentType: "text/plain" },
		),
		Effect.catch(mismatch),
	);
};

/**
 * One value of a stream, as text: encoded with `output` as JSON, or as
 * text with `Fetch.text()`. Without `output`, `raw` gives it. Dies when it
 * doesn't match.
 */
const streamValueText = (
	output: AnySchema | undefined,
	value: unknown,
	raw: (value: unknown) => Effect.Effect<string>,
	what: string,
): Effect.Effect<string, never, unknown> => {
	if (output === undefined) {
		return raw(value);
	}
	const mismatch = (error: Schema.SchemaError) =>
		defect(
			`${what} doesn't match the output schema: ${error.message}`,
			error,
		);
	return bodyFormat(output) === "json"
		? Schema.encodeUnknownEffect(Schema.toCodecJson(output))(value).pipe(
				Effect.catch(mismatch),
				Effect.flatMap((encoded) =>
					Effect.map(jsonPayload(encoded, what), (payload) =>
						String(payload.body),
					),
				),
			)
		: Schema.encodeUnknownEffect(output)(value).pipe(
				Effect.map(String),
				Effect.catch(mismatch),
			);
};

/** An event a handler sends to an SSE endpoint, as seen at runtime. */
interface RuntimeTestEvent {
	readonly event?: string | undefined;
	readonly id?: string | undefined;
	readonly data: unknown;
}

const isTestEvent = (u: unknown): u is RuntimeTestEvent =>
	typeof u === "object" && u !== null && hasOwn(u, "data");

/**
 * The body of a stream endpoint's response, from the list of values the
 * handler returned: Server-Sent Events, or one JSON value per line. Dies
 * when the result isn't a list, or a value doesn't match `output`.
 */
const streamPayload = (
	format: StreamFormat,
	output: AnySchema | undefined,
	result: unknown,
	route: string,
): Effect.Effect<Payload, never, unknown> => {
	if (!Array.isArray(result)) {
		return defect(
			`the handler for ${route}, a stream endpoint, must return a list of ${format === "sse" ? "events" : "values"} or a reply`,
		);
	}
	if (format === "ndjson") {
		return Effect.map(
			Effect.forEach(result, (value, index) => {
				const what = `value ${index + 1} the handler for ${route} returned`;
				return Effect.flatMap(
					streamValueText(
						output,
						value,
						(raw) =>
							Effect.map(
								jsonPayload(raw, `value ${index + 1}`),
								(payload) => String(payload.body),
							),
						what,
					),
					// A line break would split the value, and a blank line is
					// skipped: neither arrives as the value.
					(line) =>
						/[\r\n]/.test(line)
							? defect(
									`${what} has a line break, which would split it in two lines`,
								)
							: line.trim() === ""
								? defect(
										`${what} is blank, and the client skips blank lines`,
									)
								: Effect.succeed(line),
				);
			}),
			(lines): Payload => ({
				body: lines.map((line) => `${line}\n`).join(""),
				contentType: "application/x-ndjson",
			}),
		);
	}
	return Effect.map(
		Effect.forEach(result, (event: unknown, index) => {
			const what = `event ${index + 1} the handler for ${route} returned`;
			if (!isTestEvent(event)) {
				return defect(`${what} isn't an event: return objects with data`);
			}
			return Effect.map(
				streamValueText(
					output,
					event.data,
					(raw) =>
						typeof raw === "string"
							? Effect.succeed(raw)
							: defect(
									`${what} has data that isn't a string, and the endpoint has no output schema`,
								),
					what,
				),
				(data) =>
					// As Effect 4.1's Sse.encoder writes it. Effect 4.0's splits
					// data on \n alone, and loses what follows a lone \r.
					[
						event.id === undefined ? "" : `id: ${event.id}\n`,
						event.event === undefined ? "" : `event: ${event.event}\n`,
						`data: ${data.replace(/\r\n|\r|\n/g, "\ndata: ")}\n\n`,
					].join(""),
			).pipe(
				Effect.tap(() =>
					[event.id, event.event].some(
						(field) => field !== undefined && /[\r\n]/.test(field),
					)
						? defect(
								`${what} has a line break in its id or event, which can't be sent`,
							)
						: Effect.void,
				),
			);
		}),
		(events): Payload => ({
			body: events.join(""),
			contentType: "text/event-stream",
		}),
	);
};

/**
 * The response to `request`: `payload`'s body and content type, then
 * `headers` over them.
 */
const respondWith = (
	request: HttpClientRequest.HttpClientRequest,
	status: number,
	payload: Payload,
	headers: Headers.Headers,
	route: string,
): Effect.Effect<HttpClientResponse.HttpClientResponse> => {
	if (payload.body !== null && nullBodyStatuses.has(status)) {
		return defect(
			`the handler for ${route} sent a body with a ${status} response, which can't have one`,
		);
	}
	const init = new globalThis.Headers();
	if (payload.contentType !== undefined) {
		init.set("content-type", payload.contentType);
	}
	for (const [name, value] of Object.entries(headers)) {
		init.set(name, value);
	}
	return Effect.succeed(
		HttpClientResponse.fromWeb(
			request,
			new Response(payload.body as BodyInit | null, {
				status,
				headers: init,
			}),
		),
	);
};

/** The response a reply describes. */
const replyResponse = (
	request: HttpClientRequest.HttpClientRequest,
	reply: RuntimeReply,
	route: string,
): Effect.Effect<HttpClientResponse.HttpClientResponse> =>
	Effect.flatMap(
		plainPayload(reply.body, `the reply's body for ${route}`),
		(payload) =>
			respondWith(request, reply.status, payload, reply.headers, route),
	);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** The query parameters of a request: repeated keys give a list. */
export interface RuntimeQueryParams {
	readonly [key: string]: string | ReadonlyArray<string> | undefined;
}

/** A request the fake backend received, as seen at runtime. */
export interface RuntimeSentRequest {
	readonly method: string;
	readonly url: string;
	readonly route: string | undefined;
	readonly params: { readonly [name: string]: string };
	readonly query: RuntimeQueryParams;
	readonly headers: Headers.Headers;
	readonly body: unknown;
}

/** `decodeURIComponent`, or `s` as it is when it isn't valid. */
const decode = (s: string): string => {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
};

/**
 * A URL split with string operations (React Native's `URL` is
 * incomplete): its origin (lowercased), its path and its query string.
 */
const splitUrl = (
	url: string,
): {
	readonly origin: string;
	readonly path: string;
	readonly search: string;
} => {
	const noHash = url.split("#", 1)[0] ?? "";
	const question = noHash.indexOf("?");
	const base = question === -1 ? noHash : noHash.slice(0, question);
	const search = question === -1 ? "" : noHash.slice(question + 1);
	const scheme = base.indexOf("://");
	const slash =
		scheme === -1 ? base.indexOf("/") : base.indexOf("/", scheme + 3);
	return {
		origin: (slash === -1 ? base : base.slice(0, slash)).toLowerCase(),
		path: slash === -1 ? "/" : base.slice(slash),
		search,
	};
};

/** The parameters of a query string, `+` read as a space. */
const parseQuery = (search: string): RuntimeQueryParams => {
	// A `Map`, then `fromEntries`, so a key such as `__proto__` stays an
	// own key.
	const params = new Map<string, string | Array<string>>();
	for (const pair of search.split("&")) {
		if (pair === "") {
			continue;
		}
		const equals = pair.indexOf("=");
		const key = decode(
			(equals === -1 ? pair : pair.slice(0, equals)).replace(/\+/g, " "),
		);
		const value = decode(
			(equals === -1 ? "" : pair.slice(equals + 1)).replace(/\+/g, " "),
		);
		const previous = params.get(key);
		params.set(
			key,
			previous === undefined
				? value
				: Array.isArray(previous)
					? [...previous, value]
					: [previous, value],
		);
	}
	return Object.freeze(Object.fromEntries(params));
};

/** Made on first use, so importing the module needs no `TextDecoder`. */
let textDecoder: TextDecoder | undefined;
const decodeText = (bytes: Uint8Array): string =>
	(textDecoder ??= new TextDecoder()).decode(bytes);

/**
 * The body of `request`, read back: the JSON value for a JSON body, the
 * text for a text or form body, the bytes for any other bytes, the
 * `FormData`, stream or raw value as it was given, and `undefined` without
 * a body. The type is the request's `content-type` header, which a call's
 * headers can set, else the body's own.
 */
const readBody = (request: HttpClientRequest.HttpClientRequest): unknown => {
	const body = request.body;
	switch (body._tag) {
		case "Empty":
			return undefined;
		case "Uint8Array": {
			const type = (
				request.headers["content-type"] ?? body.contentType
			).toLowerCase();
			if (type.includes("json")) {
				const text = decodeText(body.body);
				if (text.trim() === "") {
					return undefined;
				}
				try {
					return JSON.parse(text);
				} catch {
					return text;
				}
			}
			return type.startsWith("text/") ||
				type.startsWith("application/x-www-form-urlencoded")
				? decodeText(body.body)
				: body.body;
		}
		case "Raw":
			return body.body;
		case "FormData":
			return body.formData;
		case "Stream":
			return body.stream;
	}
};

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

/** How a query schema's encoded side takes lists, by key. */
interface ListKeys {
	/** The declared keys, `list` when they take only lists. */
	readonly fields: ReadonlyMap<
		string,
		{ readonly list: boolean; readonly optional: boolean }
	>;
	/** `true` when other keys take only lists (a record of lists). */
	readonly others: boolean;
}

const noListKeys: ListKeys = { fields: new Map(), others: false };

/** For each query schema, how its encoded side takes lists. */
const listKeysCache = new WeakMap<QuerySchema, ListKeys>();

/** `true` when `ast` only takes lists (or `undefined`), never a string. */
const takesOnlyLists = (ast: SchemaAST.AST): boolean =>
	SchemaAST.isArrays(ast) ||
	(SchemaAST.isUnion(ast) &&
		ast.types.some(SchemaAST.isArrays) &&
		ast.types.every(
			(type) => SchemaAST.isArrays(type) || SchemaAST.isUndefined(type),
		));

/**
 * How `ast` takes lists: the fields of a struct and its index signatures,
 * and, for a union, those of its members. In a union, a key takes only
 * lists when it does in every member that declares it, and is optional
 * when a member doesn't declare it or makes it optional.
 */
const listKeysOfAst = (ast: SchemaAST.AST): ListKeys => {
	if (SchemaAST.isObjects(ast)) {
		const fields = new Map<
			string,
			{ readonly list: boolean; readonly optional: boolean }
		>();
		for (const property of ast.propertySignatures) {
			if (typeof property.name === "string") {
				fields.set(property.name, {
					list: takesOnlyLists(property.type),
					optional: SchemaAST.isOptional(property.type),
				});
			}
		}
		return {
			fields,
			others: ast.indexSignatures.some((signature) =>
				takesOnlyLists(signature.type),
			),
		};
	}
	if (SchemaAST.isUnion(ast)) {
		const members = ast.types.map(listKeysOfAst);
		const names = new Set(
			members.flatMap((member) => [...member.fields.keys()]),
		);
		const fields = new Map<
			string,
			{ readonly list: boolean; readonly optional: boolean }
		>();
		for (const name of names) {
			const declared = members.flatMap((member) => {
				const field = member.fields.get(name);
				return field === undefined ? [] : [field];
			});
			fields.set(name, {
				list: declared.every((field) => field.list),
				optional:
					declared.length < members.length ||
					declared.some((field) => field.optional),
			});
		}
		return { fields, others: members.some((member) => member.others) };
	}
	return noListKeys;
};

/** How the encoded side of `schema` takes lists. */
const listKeysOf = (schema: QuerySchema): ListKeys => {
	let keys = listKeysCache.get(schema);
	if (keys === undefined) {
		keys = listKeysOfAst(SchemaAST.toEncoded(codecOf(schema).ast));
		listKeysCache.set(schema, keys);
	}
	return keys;
};

/**
 * Decodes a request's query with the endpoint's query schema, undoing what
 * the URL loses: a list of one item is a single value there, and an empty
 * list isn't there at all. A required list that's missing is decoded as
 * empty, as the URL can't tell `[]` from `undefined`.
 */
const decodeQuery = (
	schema: QuerySchema,
	query: RuntimeQueryParams,
	route: string,
): Effect.Effect<unknown, never, unknown> => {
	const { fields, others } = listKeysOf(schema);
	const input: Record<string, unknown> = { ...query };
	for (const [name, value] of Object.entries(input)) {
		const field = fields.get(name);
		if (typeof value === "string" && (field?.list ?? others)) {
			input[name] = [value];
		}
	}
	for (const [name, { list, optional }] of fields) {
		if (list && !optional && !hasOwn(input, name)) {
			input[name] = [];
		}
	}
	return Schema.decodeUnknownEffect(codecOf(schema))(input).pipe(
		Effect.catch((error) =>
			defect(
				`the query sent to ${route} doesn't match its query schema: ${error.message}`,
				error,
			),
		),
	);
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** What an endpoint gives the fake backend, as seen at runtime. */
export interface RuntimeTestEndpoint {
	readonly route: string;
	readonly method: HttpMethod.HttpMethod;
	readonly path: string;
	readonly output: AnySchema | undefined;
	readonly error: AnySchema | undefined;
	readonly statusErrors: unknown;
	readonly input: AnySchema | undefined;
	readonly query: QuerySchema | undefined;
	readonly stream?: StreamFormat | undefined;
}

/** What a handler is given for one request. */
export interface Incoming {
	readonly request: HttpClientRequest.HttpClientRequest;
	readonly url: string;
	readonly params: { readonly [name: string]: string };
	readonly query: RuntimeQueryParams;
	readonly body: unknown;
}

/** Marks the handlers `respond` and `fail` make. */
export const HandlerTypeId = "~@monarcode/effetch/test/Handler";

/** The value under `HandlerTypeId`: it only carries the services' type. */
const handlerVariance = Object.freeze({ _R: (_: never) => _ });

/** One route of the fake backend, as seen at runtime. */
export interface RuntimeHandler {
	readonly [HandlerTypeId]: unknown;
	readonly route: string;
	readonly method: HttpMethod.HttpMethod;
	readonly path: string;
	readonly serve: (
		incoming: Incoming,
	) => Effect.Effect<HttpClientResponse.HttpClientResponse, never, unknown>;
}

/** `true` when `u` has what the fake backend reads from an endpoint. */
const isTestEndpoint = (u: unknown): u is RuntimeTestEndpoint =>
	(typeof u === "object" || typeof u === "function") &&
	u !== null &&
	typeof (u as { readonly route?: unknown }).route === "string" &&
	typeof (u as { readonly method?: unknown }).method === "string" &&
	typeof (u as { readonly path?: unknown }).path === "string";

/** Throws when `endpoint` isn't one. */
const checkEndpoint = (endpoint: unknown, where: string): void => {
	if (!isTestEndpoint(endpoint)) {
		throw new TypeError(
			`${where} takes an endpoint: pass what Fetch.endpoint, client.endpoint or client.bind returns`,
		);
	}
};

/** Options for a handler's 2xx responses. */
export interface RuntimeRespondOptions {
	readonly status?: number | undefined;
	readonly headers?: Headers.Input | undefined;
}

/** What a `respond` handler is called with. */
export interface RuntimeRespondRequest {
	readonly params: { readonly [name: string]: string };
	readonly query: unknown;
	readonly body: unknown;
	readonly headers: Headers.Headers;
	readonly url: string;
	readonly request: HttpClientRequest.HttpClientRequest;
}

/** A handler that answers `endpoint`'s requests with `handler`. */
export const makeRespond = (
	endpoint: RuntimeTestEndpoint,
	handler: (
		request: RuntimeRespondRequest,
	) => Effect.Effect<unknown, never, unknown>,
	options: RuntimeRespondOptions | undefined,
): RuntimeHandler => {
	checkEndpoint(endpoint, "FetchTest.respond");
	if (typeof handler !== "function") {
		throw new TypeError("FetchTest.respond takes a handler function");
	}
	if (options?.status !== undefined) {
		checkStatus(options.status, "FetchTest.respond");
	}
	const { route, output, input, query, stream } = endpoint;
	const headers = Headers.fromInput(options?.headers ?? {});
	return Object.freeze({
		[HandlerTypeId]: handlerVariance,
		route,
		method: endpoint.method,
		path: endpoint.path,
		serve: (incoming: Incoming) =>
			Effect.gen(function* () {
				const body =
					input === undefined
						? incoming.body
						: yield* decodeJson(input)(incoming.body ?? null).pipe(
								Effect.catch((error) =>
									defect(
										`the body sent to ${route} doesn't match its input schema: ${error.message}`,
										error,
									),
								),
							);
				const decodedQuery =
					query === undefined
						? incoming.query
						: yield* decodeQuery(query, incoming.query, route);
				const result = yield* handler({
					params: incoming.params,
					query: decodedQuery,
					body,
					headers: incoming.request.headers,
					url: incoming.url,
					request: incoming.request,
				});
				if (isReply(result)) {
					return yield* replyResponse(incoming.request, result, route);
				}
				const payload =
					stream !== undefined
						? yield* streamPayload(stream, output, result, route)
						: output === undefined
							? yield* plainPayload(
									result,
									`the value the handler for ${route} returned`,
								)
							: yield* outputPayload(output, result, route);
				const status =
					options?.status ?? (payload.body === null ? 204 : 200);
				return yield* respondWith(
					incoming.request,
					status,
					payload,
					headers,
					route,
				);
			}),
	});
};

/** The schemas `fail` tries, in order, for `status`. */
const failSchemas = (
	endpoint: RuntimeTestEndpoint,
	status: number,
): ReadonlyArray<AnySchema> => {
	const statusErrors =
		typeof endpoint.statusErrors === "object" &&
		endpoint.statusErrors !== null
			? (endpoint.statusErrors as StatusErrorMap)
			: undefined;
	const schemas = statusErrorsFor(status, [statusErrors]);
	return endpoint.error === undefined ? schemas : [...schemas, endpoint.error];
};

/**
 * `body` encoded with the first of `schemas` that encodes it, as JSON. Dies
 * when none does. Without schemas, it's sent by its runtime type.
 */
const failPayload = (
	schemas: ReadonlyArray<AnySchema>,
	body: unknown,
	route: string,
	status: number,
): Effect.Effect<Payload, never, unknown> => {
	if (body === undefined) {
		return Effect.succeed(empty);
	}
	if (schemas.length === 0) {
		return plainPayload(body, `the ${status} body for ${route}`);
	}
	const [first, ...rest] = schemas;
	return rest
		.reduce<Effect.Effect<unknown, Schema.SchemaError, unknown>>(
			(previous, schema) =>
				previous.pipe(
					Effect.catch(() =>
						Schema.encodeUnknownEffect(Schema.toCodecJson(schema))(body),
					),
				),
			Schema.encodeUnknownEffect(Schema.toCodecJson(first as AnySchema))(
				body,
			),
		)
		.pipe(
			Effect.catch((error) =>
				defect(
					`the ${status} body for ${route} doesn't match its statusErrors or error schema: ${error.message}`,
					error,
				),
			),
			Effect.flatMap((encoded) =>
				encoded === undefined
					? Effect.succeed(empty)
					: jsonPayload(encoded, `the ${status} body for ${route}`),
			),
		);
};

/** A handler that answers `endpoint`'s requests with an error response. */
export const makeFail = (
	endpoint: RuntimeTestEndpoint,
	status: number,
	body: unknown,
	options: { readonly headers?: Headers.Input | undefined } | undefined,
): RuntimeHandler => {
	checkEndpoint(endpoint, "FetchTest.fail");
	checkStatus(status, "FetchTest.fail");
	if (status < 300) {
		throw new RangeError(
			`FetchTest.fail: the status must be an error status, from 300 to 599, got ${status}`,
		);
	}
	if (body !== undefined && nullBodyStatuses.has(status)) {
		throw new TypeError(
			`FetchTest.fail: a ${status} response can't have a body`,
		);
	}
	const { route } = endpoint;
	const schemas = failSchemas(endpoint, status);
	const headers = Headers.fromInput(options?.headers ?? {});
	return Object.freeze({
		[HandlerTypeId]: handlerVariance,
		route,
		method: endpoint.method,
		path: endpoint.path,
		serve: (incoming: Incoming) =>
			Effect.flatMap(failPayload(schemas, body, route, status), (payload) =>
				respondWith(incoming.request, status, payload, headers, route),
			),
	});
};

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** A handler's route, ready to match. */
interface Pattern {
	readonly handler: RuntimeHandler;
	/** The origin of an absolute route, lowercased, else `undefined`. */
	readonly origin: string | undefined;
	readonly segments: ReadonlyArray<string>;
	readonly literals: number;
}

const isParam = (segment: string): boolean =>
	segment.length > 1 && segment.startsWith(":");

/**
 * `url`, without its query string, as `URL` writes it: with `.` and `..`
 * resolved, and the host lowercased and without its default port, as in
 * the URL a request is sent to. A relative URL stays relative. `url` as it
 * is when it can't be made.
 */
const normalizeUrl = (url: string): string => {
	const bare = errorUrl(url);
	try {
		return targetUrl(undefined, {
			path: bare,
			urlParams: toUrlParams(undefined),
		});
	} catch {
		return bare;
	}
};

/** The origin of an absolute `url`, else `undefined`, and its path. */
const originAndPath = (
	url: string,
): { readonly origin: string | undefined; readonly path: string } => {
	const normalized = normalizeUrl(url);
	return isAbsoluteUrl(normalized)
		? splitUrl(normalized)
		: { origin: undefined, path: normalized };
};

const patternOf = (handler: RuntimeHandler): Pattern => {
	const { origin, path } = originAndPath(handler.path);
	const segments = path.split("/").slice(1);
	return {
		handler,
		origin,
		segments,
		literals: segments.filter((segment) => !isParam(segment)).length,
	};
};

/** The params when `segments` match `pattern` one for one, else `undefined`. */
const matchSegments = (
	pattern: ReadonlyArray<string>,
	segments: ReadonlyArray<string>,
): { readonly [name: string]: string } | undefined => {
	if (pattern.length !== segments.length) {
		return undefined;
	}
	const params: Array<readonly [string, string]> = [];
	for (let index = 0; index < pattern.length; index++) {
		const expected = pattern[index] as string;
		const actual = segments[index] as string;
		if (isParam(expected)) {
			if (actual === "") {
				return undefined;
			}
			params.push([expected.slice(1), decode(actual)]);
		} else if (decode(actual) !== decode(expected)) {
			return undefined;
		}
	}
	// `fromEntries`, so a param such as `:__proto__` stays an own key.
	return Object.freeze(Object.fromEntries(params));
};

/** Where the fake backend's routes start, from its `baseUrl` option. */
interface Base {
	readonly origin: string | undefined;
	readonly segments: ReadonlyArray<string>;
}

const baseOf = (baseUrl: string): Base => {
	const { origin, path } = originAndPath(baseUrl);
	// Relative (`api/v1`) or not (`/api/v1`), with or without a trailing
	// slash, the same segments.
	const trimmed = path.replace(/^\/+|\/+$/g, "");
	return { origin, segments: trimmed === "" ? [] : trimmed.split("/") };
};

/**
 * The params when the request's `origin` and path `segments` match
 * `pattern`, else `undefined`.
 *
 * - An absolute route matches the whole URL.
 * - With a `base`, the path must be the base's path, then the route's.
 * - Without one, the route matches the end of the path, so it works under
 *   any `baseUrl`.
 */
const matchPattern = (
	pattern: Pattern,
	origin: string,
	segments: ReadonlyArray<string>,
	base: Base | undefined,
): { readonly [name: string]: string } | undefined => {
	if (pattern.origin !== undefined) {
		return pattern.origin === origin
			? matchSegments(pattern.segments, segments)
			: undefined;
	}
	if (base !== undefined) {
		if (base.origin !== undefined && base.origin !== origin) {
			return undefined;
		}
		const prefix = segments.slice(0, base.segments.length);
		if (
			prefix.length !== base.segments.length ||
			prefix.some(
				(segment, index) =>
					decode(segment) !== decode(base.segments[index] as string),
			)
		) {
			return undefined;
		}
		return matchSegments(
			pattern.segments,
			segments.slice(base.segments.length),
		);
	}
	return segments.length < pattern.segments.length
		? undefined
		: matchSegments(
				pattern.segments,
				segments.slice(segments.length - pattern.segments.length),
			);
};

/** The handler that best matches, and its params. */
interface Match {
	readonly pattern: Pattern;
	readonly params: { readonly [name: string]: string };
}

/**
 * The best match among `patterns`: the route with the most segments, then
 * the most literal ones (`/todos/count` before `/todos/:id`), then the one
 * listed first.
 */
const bestMatch = (
	patterns: ReadonlyArray<Pattern>,
	origin: string,
	segments: ReadonlyArray<string>,
	base: Base | undefined,
): Match | undefined => {
	let best: Match | undefined;
	for (const pattern of patterns) {
		const params = matchPattern(pattern, origin, segments, base);
		if (
			params !== undefined &&
			(best === undefined ||
				pattern.segments.length > best.pattern.segments.length ||
				(pattern.segments.length === best.pattern.segments.length &&
					pattern.literals > best.pattern.literals))
		) {
			best = { pattern, params };
		}
	}
	return best;
};

/** The message an unmatched request dies with. */
const unmatched = (
	method: string,
	url: string,
	patterns: ReadonlyArray<Pattern>,
	pathMatches: ReadonlyArray<Pattern>,
	base: Base | undefined,
): string => {
	const routes = patterns.map(({ handler }) => `  - ${handler.route}`);
	const lines = [`no handler for ${method} ${errorUrl(url)}.`];
	if (pathMatches.length > 0) {
		lines.push(
			`${pathMatches.map(({ handler }) => handler.route).join(", ")} ${pathMatches.length === 1 ? "matches" : "match"} its path, but not its method.`,
		);
	}
	lines.push(
		routes.length === 0
			? "The fake backend has no handlers."
			: `The handlers are:\n${routes.join("\n")}`,
	);
	if (base === undefined && pathMatches.length === 0) {
		lines.push(
			"Without a baseUrl option, a route matches the end of the request's path.",
		);
	}
	return lines.join("\n");
};

// ---------------------------------------------------------------------------
// The layer
// ---------------------------------------------------------------------------

/** What the fake backend records, as seen at runtime. */
export interface RuntimeRecorder {
	readonly requests: ReadonlyArray<RuntimeSentRequest>;
}

/** The key of the recorder service. */
export const Recorder = Context.Service<RuntimeRecorder>(
	"@monarcode/effetch/test/Recorder",
);

/** Options for the fake backend. */
export interface RuntimeLayerOptions {
	readonly baseUrl?: string | undefined;
}

/**
 * The fake backend: an `HttpClient` that answers with `handlers`, and the
 * recorder of what it received. Each build has its own recorder. Handlers
 * run with the services the layer was built with.
 */
export const makeLayer = (
	handlers: ReadonlyArray<RuntimeHandler>,
	options: RuntimeLayerOptions | undefined,
): Layer.Layer<HttpClient.HttpClient | RuntimeRecorder, never, unknown> => {
	if (!Array.isArray(handlers)) {
		throw new TypeError("FetchTest.layer takes a list of handlers");
	}
	handlers.forEach((handler, index) => {
		if (
			typeof handler !== "object" ||
			handler === null ||
			!(HandlerTypeId in handler)
		) {
			throw new TypeError(
				`FetchTest.layer: handler ${index} isn't one: pass what FetchTest.respond or FetchTest.fail returns`,
			);
		}
	});
	const patterns = handlers.map(patternOf);
	const base =
		options?.baseUrl === undefined ? undefined : baseOf(options.baseUrl);
	return Layer.effectContext(
		Effect.gen(function* () {
			const context = yield* Effect.context<unknown>();
			const sent: Array<RuntimeSentRequest> = [];
			const recorder: RuntimeRecorder = {
				get requests() {
					return Object.freeze([...sent]);
				},
			};
			const client = HttpClient.make((request, url) => {
				const href = url.href;
				const { origin, path, search } = splitUrl(href);
				const segments = path.split("/").slice(1);
				const query = parseQuery(search);
				const body = readBody(request);
				const candidates = patterns.filter(
					({ handler }) => handler.method === request.method,
				);
				const match = bestMatch(candidates, origin, segments, base);
				sent.push(
					Object.freeze({
						method: request.method,
						url: href,
						route: match?.pattern.handler.route,
						params: match?.params ?? Object.freeze({}),
						query,
						headers: request.headers,
						body,
					}),
				);
				if (match === undefined) {
					const pathMatches = patterns.filter(
						(pattern) =>
							pattern.handler.method !== request.method &&
							matchPattern(pattern, origin, segments, base) !==
								undefined,
					);
					return defect(
						unmatched(request.method, href, patterns, pathMatches, base),
					);
				}
				// The layer's services, under the call's: a service provided
				// around the call wins, and the call's span stays the parent.
				return Effect.updateContext(
					match.pattern.handler.serve({
						request,
						url: href,
						params: match.params,
						query,
						body,
					}),
					(current: Context.Context<never>) =>
						Context.merge(context, current),
				);
			});
			return Context.make(HttpClient.HttpClient, client).pipe(
				Context.add(Recorder, recorder),
			);
		}),
	);
};
