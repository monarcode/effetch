import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Headers from "effect/http/Headers";
import type * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpMethod from "effect/http/HttpMethod";
import type * as Layer from "effect/Layer";

import type { RouteMethod, RoutePath } from "../Endpoint.js";
import {
	type HandlerTypeId,
	makeFail,
	makeLayer,
	makeReply,
	makeRespond,
	Recorder as RecorderKey,
	type ReplyTypeId,
	type RuntimeHandler,
	type RuntimeTestEndpoint,
} from "../internal/backend.js";
import type {
	AnySchema,
	QuerySchema,
	StatusErrorMap,
	StatusErrorSchema,
} from "../Options.js";
import type { PathParamNames } from "../Path.js";
import type { StreamFormat } from "../Streams.js";

/**
 * An endpoint the fake backend can answer for: one made by
 * `Fetch.endpoint`, `api.endpoint` or `api.bind`. The fake backend
 * reads its route and its schemas.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const getTodo: FetchTest.TestEndpoint = Fetch.endpoint("GET /todos/:id");
 * ```
 *
 * @since 0.1.0
 */
export interface TestEndpoint {
	/** The route, such as `"GET /todos/:id"`. */
	readonly route: string;
	/** The route's HTTP method. */
	readonly method: HttpMethod.HttpMethod;
	/** The route's path, with its `:params` unfilled. */
	readonly path: string;
	/** The schema a handler's result is encoded with, or `undefined`. */
	readonly output: AnySchema | undefined;
	/** The schema `fail` encodes a body with after `statusErrors`, or `undefined`. */
	readonly error: AnySchema | undefined;
	/** The schemas `fail` encodes a body with first, by status, or `undefined`. */
	readonly statusErrors: StatusErrorMap | undefined;
	/** The schema the request body is decoded with, or `undefined`. */
	readonly input: AnySchema | undefined;
	/** The schema the request's query is decoded with, or `undefined`. */
	readonly query: QuerySchema | undefined;
	/** The format a stream endpoint's body is sent in, or `undefined`. */
	readonly stream?: StreamFormat | undefined;
}

/**
 * The path params a handler gets for route `R`: one key per `:param`, each
 * a `string`, as it was in the URL (decoded).
 *
 * @example
 * ```ts
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const params: FetchTest.RouteParams<"GET /orgs/:org/users/:id"> = {
 *   org: "acme",
 *   id: "1",
 * };
 * ```
 *
 * @since 0.1.0
 */
export type RouteParams<R extends string> = {
	readonly [K in PathParamNames<RoutePath<R>>]: string;
};

/**
 * The query parameters of a request, as they were in the URL (decoded): a
 * `string` per key, or a list of strings for a key that was repeated.
 *
 * @example
 * ```ts
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * // ?page=2&tag=a&tag=b
 * const query: FetchTest.QueryParams = { page: "2", tag: ["a", "b"] };
 * ```
 *
 * @since 0.1.0
 */
export interface QueryParams {
	readonly [key: string]: string | ReadonlyArray<string> | undefined;
}

/**
 * The body a handler gets for route `R`, whose endpoint has the `input`
 * schema `I`:
 *
 * - `undefined` for a route whose method takes no body, such as `GET`;
 * - the decoded body, typed by `I`, with an `input` schema;
 * - `unknown` otherwise: the JSON value for a JSON body, the text for a
 *   text or form body, the bytes for other bytes, the `FormData` or stream
 *   as it was sent, and `undefined` without a body.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const NewTodo = Schema.Struct({ title: Schema.String });
 *
 * const body: FetchTest.RequestBody<"POST /todos", typeof NewTodo> = {
 *   title: "Write docs",
 * };
 * ```
 *
 * @since 0.1.0
 */
export type RequestBody<R extends string, I extends AnySchema | undefined> = [
	RouteMethod<R>,
] extends [HttpMethod.HttpMethod.NoBody]
	? undefined
	: [I] extends [AnySchema]
		? I["Type"]
		: unknown;

/**
 * The query a handler gets: decoded with the endpoint's query schema `QS`
 * when it has one, as the call gave it, and the raw {@link QueryParams}
 * otherwise.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const Page = Schema.Struct({ page: Schema.FiniteFromString });
 *
 * const typed: FetchTest.RequestQuery<typeof Page> = { page: 2 };
 * const raw: FetchTest.RequestQuery<undefined> = { page: "2" };
 * ```
 *
 * @since 0.1.0
 */
export type RequestQuery<QS extends QuerySchema | undefined> = [QS] extends [
	QuerySchema,
]
	? QS["Type"]
	: QueryParams;

/**
 * What a {@link respond} handler is called with, for one request to route
 * `R`, whose endpoint has the `input` schema `I` and the query schema `QS`.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { Fetch } from "@monarcode/effetch";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * const getTodo = Fetch.endpoint("GET /todos/:id");
 *
 * const handler = (request: FetchTest.RespondRequest<"GET /todos/:id", undefined, undefined>) =>
 *   Effect.succeed({ id: Number(request.params.id) });
 *
 * export const Backend = FetchTest.layer([FetchTest.respond(getTodo, handler)]);
 * ```
 *
 * @since 0.1.0
 */
export interface RespondRequest<
	R extends string,
	I extends AnySchema | undefined,
	QS extends QuerySchema | undefined,
> {
	/** The path params, as strings (see {@link RouteParams}). */
	readonly params: RouteParams<R>;
	/** The query, decoded with the query schema if there is one (see {@link RequestQuery}). */
	readonly query: RequestQuery<QS>;
	/** The body, decoded with `input` if there is one (see {@link RequestBody}). */
	readonly body: RequestBody<R, I>;
	/** The request's headers, with lowercase names. */
	readonly headers: Headers.Headers;
	/** The URL the request was sent to. */
	readonly url: string;
	/** The request itself, for anything else. */
	readonly request: HttpClientRequest.HttpClientRequest;
}

/**
 * A response sent as it is, made by {@link reply}. A {@link respond}
 * handler returns one to answer with another status, such as `201` or
 * `404`.
 *
 * @example
 * ```ts
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * const notFound: FetchTest.Reply = FetchTest.reply(404, { message: "No todo 9" });
 * ```
 *
 * @since 0.1.0
 */
export interface Reply {
	/** Marks the values {@link reply} makes. */
	readonly [ReplyTypeId]: typeof ReplyTypeId;
	/** The status, from 200 to 599. */
	readonly status: number;
	/** The body, sent by its runtime type (see {@link reply}). */
	readonly body: unknown;
	/** The headers, over the content type. */
	readonly headers: Headers.Headers;
}

/**
 * One event a {@link respond} handler sends to an SSE endpoint (one with
 * `stream: "sse"`): its `data`, of `output`'s `Type` (a `string` without
 * `output`), and optionally its `event` name and `id`.
 *
 * @example
 * ```ts
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const event: FetchTest.TestEvent<{ readonly percent: number }> = {
 *   event: "progress",
 *   data: { percent: 50 },
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface TestEvent<A> {
	/** The event's name, on one line. Without it, the client sees `"message"`. */
	readonly event?: string | undefined;
	/** The event's ID, on one line. */
	readonly id?: string | undefined;
	/** The event's data, encoded with `output`. */
	readonly data: A;
}

/**
 * What a {@link respond} handler succeeds with, for an endpoint with the
 * `output` schema `O` and the stream format `St`, or a {@link Reply}:
 *
 * - without `St`: a value of `output`'s `Type`, encoded with `output`
 *   before it's sent. Without `output`, the value is sent by its runtime
 *   type (see {@link reply}).
 * - `"sse"`: a list of {@link TestEvent}s, sent as Server-Sent Events.
 *   An `event` or `id` with a line break can't be sent, and the call dies.
 * - `"ndjson"`: a list of values of `output`'s `Type` (anything that has a
 *   JSON form without `output`), sent one per line. With `Fetch.text()`, a
 *   value with a line break, or a blank one, can't be sent as one line,
 *   and the call dies.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite });
 *
 * const result: FetchTest.RespondResult<typeof Todo> = { id: 1 };
 * const lines: FetchTest.RespondResult<typeof Todo, "ndjson"> = [{ id: 1 }, { id: 2 }];
 * ```
 *
 * @since 0.1.0
 */
export type RespondResult<
	O extends AnySchema | undefined,
	St extends StreamFormat | undefined = undefined,
> =
	| ([St] extends ["sse"]
			? ReadonlyArray<
					TestEvent<[O] extends [AnySchema] ? O["Type"] : string>
				>
			: [St] extends ["ndjson"]
				? ReadonlyArray<[O] extends [AnySchema] ? O["Type"] : unknown>
				: [O] extends [AnySchema]
					? O["Type"]
					: unknown)
	| Reply;

/**
 * The services a {@link respond} handler for endpoint `EP` needs, besides
 * its own: those of encoding `output`, and of decoding `input` and the
 * query schema.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const getTodo = Fetch.endpoint("GET /todos/:id");
 *
 * type None = FetchTest.RespondServices<typeof getTodo>;
 * //   ^? never
 * ```
 *
 * @since 0.1.0
 */
export type RespondServices<EP extends TestEndpoint> =
	| (EP["output"] extends AnySchema ? EP["output"]["EncodingServices"] : never)
	| (EP["input"] extends AnySchema ? EP["input"]["DecodingServices"] : never)
	| (EP["query"] extends AnySchema ? EP["query"]["DecodingServices"] : never);

/**
 * The body {@link fail} takes for endpoint `EP` and status `S`: a value of
 * the `statusErrors` schemas for `S`, or of the `error` schema.
 *
 * - On a bound endpoint, `statusErrors` has the endpoint's and the
 *   client's schemas, but not their statuses, so the body may be a value
 *   of any of them. Its `error` is always set, `Schema.Unknown` by
 *   default, which takes anything.
 * - On a definition without `error`, a status without `statusErrors`
 *   takes any body, as the client's `defaultError` isn't known.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
 *   message: Schema.String,
 * }) {}
 *
 * const getTodo = Fetch.endpoint("GET /todos/:id", { statusErrors: { 404: TodoNotFound } });
 *
 * const body: FetchTest.FailBody<typeof getTodo, 404> = new TodoNotFound({ message: "No todo 9" });
 * ```
 *
 * @since 0.1.0
 */
export type FailBody<EP extends TestEndpoint, S extends number> = [
	EP["error"],
] extends [AnySchema]
	? StatusBody<EP["statusErrors"], S> | EP["error"]["Type"]
	: [StatusBody<EP["statusErrors"], S>] extends [never]
		? unknown
		: StatusBody<EP["statusErrors"], S>;

/** The `Type` of the schemas `M` has for status `S`. */
type StatusBody<
	M extends StatusErrorMap | undefined,
	S extends number,
> = M extends StatusErrorMap
	? S extends keyof M
		? M[S] extends ReadonlyArray<infer Schema extends AnySchema>
			? Schema["Type"]
			: M[S] extends AnySchema
				? M[S]["Type"]
				: never
		: never
	: never;

/**
 * The services a {@link fail} handler for endpoint `EP` needs: those of
 * encoding its `statusErrors` and `error` schemas.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const getTodo = Fetch.endpoint("GET /todos/:id");
 *
 * type None = FetchTest.FailServices<typeof getTodo>;
 * //   ^? never
 * ```
 *
 * @since 0.1.0
 */
export type FailServices<EP extends TestEndpoint> =
	| StatusErrorSchema<EP["statusErrors"]>["EncodingServices"]
	| (EP["error"] extends AnySchema ? EP["error"]["EncodingServices"] : never);

/**
 * One route of the fake backend, made by {@link respond} or {@link fail}.
 * Pass a list of them to {@link layer}.
 *
 * - `R`: the services it needs to run, which the layer then needs.
 *
 * @example
 * ```ts
 * import { Fetch } from "@monarcode/effetch";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * const listTodos = Fetch.endpoint("GET /todos");
 *
 * const unavailable: FetchTest.Handler = FetchTest.fail(listTodos, 503);
 * ```
 *
 * @since 0.1.0
 */
export interface Handler<out R = never> {
	/** Marks handlers, and carries the services they need. */
	readonly [HandlerTypeId]: { readonly _R: (_: never) => R };
	/** The route it answers, such as `"GET /todos/:id"`. */
	readonly route: string;
	/** The route's HTTP method. */
	readonly method: HttpMethod.HttpMethod;
	/** The route's path, with its `:params` unfilled. */
	readonly path: string;
}

/**
 * The services handler `H` needs to run: `R` for a `Handler<R>`. For a
 * union of handlers, the union of their services, which is what
 * {@link layer} needs.
 *
 * @example
 * ```ts
 * import * as Context from "effect/Context";
 * import * as Effect from "effect/Effect";
 * import { Fetch } from "@monarcode/effetch";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * class Clock extends Context.Service<Clock, { readonly now: Date }>()("Clock") {}
 *
 * const getTime = Fetch.endpoint("GET /time");
 * const handler = FetchTest.respond(getTime, () =>
 *   Effect.map(Effect.service(Clock), ({ now }) => now.toISOString()),
 * );
 *
 * type Needs = FetchTest.HandlerServices<typeof handler>;
 * //   ^? Clock
 * ```
 *
 * @since 0.1.0
 */
export type HandlerServices<H extends Handler<any>> =
	H extends Handler<infer R> ? R : never;

/**
 * Options for the responses of a {@link respond} handler that aren't a
 * {@link Reply}.
 *
 * - `status`: the status, from 200 to 599. Defaults to `200`, or to `204`
 *   when there's no body to send.
 * - `headers`: sent with the response, over its content type.
 *
 * @example
 * ```ts
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const created: FetchTest.RespondOptions = {
 *   status: 201,
 *   headers: { location: "/todos/2" },
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface RespondOptions {
	/** The status, from 200 to 599. Defaults to `200`, or `204` without a body. */
	readonly status?: number | undefined;
	/** Sent with the response, over its content type. */
	readonly headers?: Headers.Input | undefined;
}

/**
 * Options for a {@link reply} or a {@link fail} handler.
 *
 * @example
 * ```ts
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const options: FetchTest.ReplyOptions = { headers: { "retry-after": "1" } };
 * ```
 *
 * @since 0.1.0
 */
export interface ReplyOptions {
	/** Sent with the response, over its content type. */
	readonly headers?: Headers.Input | undefined;
}

/**
 * Options for {@link layer}.
 *
 * - `baseUrl`: where the routes start, such as `"https://api.test/v1"`.
 *   With it, a request matches a route only when its URL is the
 *   `baseUrl`, then the route's path. Without it, a route matches the end
 *   of a request's path, whatever comes before it, so the fake backend
 *   works under any client's `baseUrl`.
 *
 * @example
 * ```ts
 * import type { FetchTest } from "@monarcode/effetch/test";
 *
 * const options: FetchTest.LayerOptions = { baseUrl: "https://api.test/v1" };
 * ```
 *
 * @since 0.1.0
 */
export interface LayerOptions {
	/** Where the routes start. Without it, a route matches the end of a path. */
	readonly baseUrl?: string | undefined;
}

/**
 * A request the fake backend received, as the {@link Recorder} keeps it.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * export const routes = Effect.map(FetchTest.requests, (requests) =>
 *   requests.map((request: FetchTest.SentRequest) => request.route),
 * );
 * ```
 *
 * @since 0.1.0
 */
export interface SentRequest {
	/** The HTTP method, such as `"GET"`. */
	readonly method: string;
	/** The URL it was sent to, with its query string. */
	readonly url: string;
	/** The route of the handler that answered it, or `undefined` when none did. */
	readonly route: string | undefined;
	/** The path params the route matched, as strings. Empty when none did. */
	readonly params: { readonly [name: string]: string };
	/** The query parameters, as they were in the URL (see {@link QueryParams}). */
	readonly query: QueryParams;
	/** The headers, with lowercase names. */
	readonly headers: Headers.Headers;
	/**
	 * The body: the JSON value for a JSON body, the text for a text or form
	 * body, the bytes for other bytes, the `FormData` or stream as it was
	 * sent, and `undefined` without a body.
	 */
	readonly body: unknown;
}

/**
 * The service that keeps the requests the fake backend received, in the
 * order it received them. {@link layer} provides it, with a new, empty
 * record each time the layer is built. Read it with {@link requests}.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * export const count = Effect.gen(function* () {
 *   const recorder = yield* FetchTest.Recorder;
 *   return recorder.requests.length;
 * });
 * ```
 *
 * @since 0.1.0
 */
export interface Recorder {
	/** The requests received so far, oldest first. A copy, so it doesn't change later. */
	readonly requests: ReadonlyArray<SentRequest>;
}

/**
 * The key of the {@link Recorder} service.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * export const urls = Effect.map(Effect.service(FetchTest.Recorder), (recorder) =>
 *   recorder.requests.map((request) => request.url),
 * );
 * ```
 *
 * @since 0.1.0
 */
export const Recorder: Context.Service<Recorder, Recorder> =
	RecorderKey as unknown as Context.Service<Recorder, Recorder>;

/**
 * The requests the fake backend received so far, oldest first.
 *
 * It needs the {@link Recorder}, which {@link layer} provides. Under a
 * client's layer, `Layer.provide` hides it, so when a test reads it,
 * provide the fake backend with `Layer.provideMerge` instead.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Layer from "effect/Layer";
 * import { Fetch } from "@monarcode/effetch";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * class Api extends Fetch.Service<Api>()("Api", { baseUrl: "https://api.test" }) {}
 *
 * const deleteTodo = Fetch.endpoint("DELETE /todos/:id");
 *
 * const Backend = FetchTest.layer([
 *   FetchTest.respond(deleteTodo, () => Effect.void),
 * ]);
 *
 * export const test = Effect.gen(function* () {
 *   const api = yield* Api;
 *   yield* api.bind(deleteTodo)({ params: { id: 1 } });
 *   const [sent] = yield* FetchTest.requests;
 *   return sent?.url; // "https://api.test/todos/1"
 * }).pipe(Effect.provide(Api.layer.pipe(Layer.provideMerge(Backend))));
 * ```
 *
 * @since 0.1.0
 */
export const requests: Effect.Effect<
	ReadonlyArray<SentRequest>,
	never,
	Recorder
> = Effect.map(Effect.service(Recorder), (recorder) => recorder.requests);

/**
 * Makes a response that a {@link respond} handler sends as it is, for any
 * status: a `201` with a `location` header, a `404` for a missing item, a
 * `500`. The body isn't checked against the endpoint's schemas.
 *
 * The body is sent by its runtime type, as Effetch sends a call's `body`
 * without `input`:
 *
 * - `undefined`: no body;
 * - a `string`: as text (`text/plain`);
 * - an `ArrayBuffer` or any view of one, such as a `Uint8Array`: as bytes
 *   (`application/octet-stream`);
 * - a `Blob` or `FormData`: as it is, with the blob's type or a multipart
 *   boundary;
 * - `URLSearchParams`: as a form (`application/x-www-form-urlencoded`);
 * - anything else: as JSON. A value with no JSON form, such as a `bigint`,
 *   is a defect.
 *
 * A header in `options.headers` wins over the content type, so a string
 * can be sent as JSON text with `{ "content-type": "application/json" }`.
 *
 * Throws when the status isn't from 200 to 599, or when a `204`, `205` or
 * `304` reply has a body.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
 *
 * export const Backend = FetchTest.layer([
 *   FetchTest.respond(getTodo, ({ params }) =>
 *     Effect.succeed(
 *       params.id === "1"
 *         ? { id: 1, title: "Write docs" }
 *         : FetchTest.reply(404, { message: `No todo ${params.id}` }),
 *     ),
 *   ),
 * ]);
 * ```
 *
 * @since 0.1.0
 */
export const reply = (
	status: number,
	body?: unknown,
	options?: ReplyOptions,
): Reply => makeReply(status, body, options?.headers) as Reply;

/**
 * Makes a handler that answers `endpoint`'s requests with `handler`, for
 * {@link layer}.
 *
 * `handler` is typed by the endpoint, and checks what it's sent as a real
 * backend would:
 *
 * - `params` has the route's params, as strings.
 * - `query` is decoded with the endpoint's query schema, if it has one,
 *   and is the raw {@link QueryParams} otherwise.
 * - `body` is decoded with the endpoint's `input` schema, if it has one.
 *   A body or query that doesn't match is a defect that names the route,
 *   as it's a bug in the code under test.
 *
 * The handler succeeds with a value of `output`'s `Type`, which is encoded
 * with `output` before it's sent, so a `Date` goes over the wire as a
 * string, as in production. With `Fetch.text()` or `Fetch.bytes()`, it's
 * sent as text or bytes. A value that doesn't match `output` is a defect.
 * Without `output`, the value is sent by its runtime type (see
 * {@link reply}), and `undefined` sends no body.
 *
 * For a stream endpoint (one with `stream`), the handler succeeds with a
 * list instead: {@link TestEvent}s for `"sse"`, or values for `"ndjson"`
 * (see {@link RespondResult}). They're sent as one body, each value
 * encoded with `output`.
 *
 * The status is `200`, or `204` without a body, unless `options.status`
 * sets one. To answer with another status or an error, return a
 * {@link reply}.
 *
 * Throws when `endpoint` isn't one, or `options.status` isn't from 200 to
 * 599.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String, due: Schema.Date });
 * const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });
 *
 * const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
 * const createTodo = Fetch.endpoint("POST /todos", { input: NewTodo, output: Todo });
 *
 * export const Backend = FetchTest.layer([
 *   FetchTest.respond(getTodo, ({ params }) =>
 *     Effect.succeed({ id: Number(params.id), title: "Write docs", due: new Date(0) }),
 *   ),
 *   FetchTest.respond(createTodo, ({ body }) => Effect.succeed({ id: 2, ...body }), {
 *     status: 201,
 *   }),
 * ]);
 * ```
 *
 * @since 0.1.0
 */
export const respond = <const EP extends TestEndpoint, R = never>(
	endpoint: EP,
	handler: (
		request: RespondRequest<EP["route"], EP["input"], EP["query"]>,
	) => Effect.Effect<RespondResult<EP["output"], EP["stream"]>, never, R>,
	options?: RespondOptions,
): Handler<R | RespondServices<EP>> =>
	makeRespond(
		endpoint as RuntimeTestEndpoint,
		handler as never,
		options,
	) as unknown as Handler<R | RespondServices<EP>>;

/**
 * Makes a handler that answers every request to `endpoint` with the error
 * status `status`, for {@link layer}. To answer some requests with an
 * error and others with data, return a {@link reply} from
 * {@link respond} instead.
 *
 * `body` is encoded as JSON with the first schema that encodes it: the
 * endpoint's `statusErrors` schemas for `status`, then its `error` schema.
 * So the client decodes it back into your domain error, or into
 * `HttpError.body`. A definition made with `Fetch.endpoint` has no access
 * to the client's `statusErrors` and `defaultError`, so without its own
 * schemas, the body is sent by its runtime type (see {@link reply}). A body
 * that no schema encodes is a defect. Without `body`, the response is
 * empty.
 *
 * Throws when `endpoint` isn't one, `status` isn't from 300 to 599, or a
 * `304` has a body.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
 *   message: Schema.String,
 * }) {}
 *
 * const getTodo = Fetch.endpoint("GET /todos/:id", { statusErrors: { 404: TodoNotFound } });
 * const listTodos = Fetch.endpoint("GET /todos");
 *
 * export const Backend = FetchTest.layer([
 *   FetchTest.fail(getTodo, 404, new TodoNotFound({ message: "No todo 9" })),
 *   FetchTest.fail(listTodos, 503),
 * ]);
 * ```
 *
 * @since 0.1.0
 */
export const fail = <const EP extends TestEndpoint, const S extends number>(
	endpoint: EP,
	status: S,
	body?: FailBody<EP, S>,
	options?: ReplyOptions,
): Handler<FailServices<EP>> =>
	makeFail(
		endpoint as RuntimeTestEndpoint,
		status,
		body,
		options,
	) as unknown as Handler<FailServices<EP>>;

/**
 * Makes a fake backend: an `HttpClient` layer that answers requests with
 * `handlers`, without a network. Provide it where `FetchHttpClient.layer`
 * goes, under a real client with its plugins, so a test runs the same
 * code as production, schemas included.
 *
 * - **Matching.** A request is answered by the handler whose route matches
 *   its method and path. Without `options.baseUrl`, a route matches the
 *   end of the path, so `GET /todos/:id` answers
 *   `https://api.test/v1/todos/1`. When several routes match, the longest
 *   wins, then the one with the most literal segments (`/todos/count`
 *   before `/todos/:id`), then the one listed first. A route with an
 *   absolute URL matches that URL only.
 * - **No match.** A request no handler matches is a defect. Its message
 *   lists the routes the backend has, and the ones that match the path
 *   with another method.
 * - **Recording.** The layer also provides the {@link Recorder}, with a new
 *   record each time it's built. Read it with {@link requests}.
 * - **Services.** The layer needs the services its handlers need. A
 *   handler runs with the services the layer was built with, and those of
 *   the call it answers, which win when both have one.
 *
 * It doesn't depend on a test runner, so it works with vitest, Jest, Bun
 * and Deno's test runners, or in a storybook or a demo.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Layer from "effect/Layer";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 *
 * class Api extends Fetch.Service<Api>()("Api", { baseUrl: "https://api.test" }) {}
 *
 * class TodoApi extends Fetch.Endpoints<TodoApi>()("TodoApi", Api, {
 *   get: Fetch.endpoint("GET /todos/:id", { output: Todo }),
 * }) {}
 *
 * const Backend = FetchTest.layer([
 *   FetchTest.respond(TodoApi.definitions.get, ({ params }) =>
 *     Effect.succeed({ id: Number(params.id), title: "Write docs" }),
 *   ),
 * ]);
 *
 * export const test = Effect.gen(function* () {
 *   const todos = yield* TodoApi;
 *   return yield* todos.get({ params: { id: 1 } });
 * }).pipe(
 *   Effect.provide(TodoApi.layer.pipe(Layer.provide(Api.layer), Layer.provide(Backend))),
 * );
 * ```
 *
 * @since 0.1.0
 */
export const layer = <const Hs extends ReadonlyArray<Handler<any>>>(
	handlers: Hs,
	options?: LayerOptions,
): Layer.Layer<
	HttpClient.HttpClient | Recorder,
	never,
	HandlerServices<Hs[number]>
> =>
	makeLayer(
		handlers as unknown as ReadonlyArray<RuntimeHandler>,
		options,
	) as never;
