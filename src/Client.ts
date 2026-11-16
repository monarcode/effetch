import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpMethod from "effect/http/HttpMethod";
import type * as Schema from "effect/Schema";

import type { BindAllMethod, BindMethod, EndpointMethod } from "./Endpoint.js";
import type { NetworkError } from "./Errors.js";
import {
	bindAllEndpoints,
	bindEndpoint,
	makeEndpoint,
	type RuntimeBindOptions,
	type RuntimeDefinition,
	type RuntimeDefinitions,
	type RuntimeUnboundEndpoint,
} from "./internal/endpoint.js";
import { makeApplyDefaults, mapClientErrors } from "./internal/pipeline.js";
import {
	applyPlugins,
	provideOverrides,
	provideResponseBox,
	provideRoute,
} from "./internal/plugins.js";
import {
	type Call,
	makeCall,
	type RuntimeOptions,
} from "./internal/request.js";
import { freezeStatusErrors } from "./internal/statusErrors.js";
import { openStream } from "./internal/stream.js";
import { hasQueryOrFragment } from "./internal/url.js";
import type {
	AnySchema,
	BodyMethod,
	NoBodyMethod,
	RequestMethod,
	StatusErrorMap,
} from "./Options.js";
import type { Plugin } from "./Plugin.js";
import type { StreamFormat, StreamMethod } from "./Streams.js";

/** What `api.sse` and `api.ndjson` take, as seen at runtime. */
type StreamCallOptions = RuntimeOptions & {
	readonly method?: HttpMethod.HttpMethod | undefined;
};

/** `api.sse` or `api.ndjson`: sends `path` with `options`, as a stream. */
const streamCall = (
	call: (method: HttpMethod.HttpMethod) => Call,
	format: StreamFormat,
	path: string,
	options: StreamCallOptions = {},
) => {
	const { method = "GET", ...rest } = options;
	return openStream(
		format,
		`api.${format}`,
		(streamOptions) => call(method)(path, streamOptions),
		rest,
	);
};

/**
 * Configuration for {@link make}.
 *
 * - `baseUrl`: prepended to every path that isn't already an absolute
 *   `http://` or `https://` URL. A string, or an Effect (a `Config` works)
 *   that's run once, when the client is made. It can't contain a query
 *   string or a fragment: pass those with each call's `query` option.
 * - `headers`: sent with every request. A header passed to a call replaces
 *   the client's one of the same name. `content-type` and `content-length`
 *   are ignored here: they come from each request's body (set
 *   `content-type` on a call to override it). When a call has an `output`
 *   schema, Effetch sends an `Accept` header that matches it
 *   (`application/json`, or text for `Fetch.text()`), unless an `accept`
 *   header is set here or on the call.
 * - `defaultError`: the schema for non-2xx response bodies of calls that
 *   don't pass their own `error` option. A call's `error` replaces it.
 * - `statusErrors`: turns error responses into your own errors, by status,
 *   for every call (see {@link StatusErrorMap}). An endpoint's or a call's
 *   own `statusErrors` are tried first.
 * - `plugins`: hooks into every call (see {@link Plugin}). `plugins[0]` is
 *   the outermost layer: its `onRequest` runs first and its `onResponse`
 *   last. Names must be unique. Pass the list inline: annotating it as
 *   `Plugin.Any[]` erases the plugins' types.
 *
 * @example
 * ```ts
 * import * as Config from "effect/Config";
 * import * as Effect from "effect/Effect";
 * import * as HttpClientRequest from "effect/http/HttpClientRequest";
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const ApiError = Schema.Struct({ code: Schema.String });
 *
 * const apiKey = Fetch.plugin({
 *   name: "apiKey",
 *   onRequest: (request) =>
 *     Effect.succeed(HttpClientRequest.setHeader(request, "x-api-key", "key")),
 * });
 *
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: Config.String("API_URL"),
 *   headers: { accept: "application/json" },
 *   defaultError: ApiError,
 *   plugins: [apiKey],
 * }) {}
 * ```
 *
 * @since 0.1.0
 */
export interface ClientConfig<
	Ps extends ReadonlyArray<Plugin.Any> = [],
	EB extends AnySchema = Schema.Unknown,
	BaseE = never,
	BaseR = never,
	SE extends StatusErrorMap | undefined = undefined,
> {
	/** Prepended to relative paths. A string, or an Effect run once by `make`. */
	readonly baseUrl?: string | Effect.Effect<string, BaseE, BaseR> | undefined;
	/** Headers sent with every request. */
	readonly headers?: Headers.Input | undefined;
	/** Schema for non-2xx response bodies, unless a call passes its own `error`. */
	readonly defaultError?: EB | undefined;
	/** Your own errors for error responses, by status, for every call. */
	// No `| undefined`, unlike the other options: `SE` already allows it, and
	// with it `statusErrors: undefined` infers the constraint, which widens
	// the call's errors to `unknown`.
	readonly statusErrors?: SE;
	/** Plugins, outermost first. Names must be unique. */
	readonly plugins?: Ps | undefined;
}

/**
 * A client made by {@link make}. Every call returns an Effect that needs
 * no services, apart from those its schemas require (the call's or
 * endpoint's own, and the client's `defaultError` and `statusErrors`), and
 * that can fail with the plugins' errors and the `statusErrors` that apply,
 * on top of Effetch's own.
 *
 * - `Ps`: the plugins the client was made with.
 * - `EB`: the client's `defaultError` schema.
 * - `SE`: the client's `statusErrors` map, or `undefined` without one.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 *
 * const program = (api: Fetch.Client) =>
 *   api.get("/todos/:id", { params: { id: 1 }, output: Todo }).pipe(
 *     Effect.catchTag("HttpError", (error) =>
 *       error.status === 404 ? Effect.succeed(undefined) : Effect.fail(error),
 *     ),
 *   );
 * ```
 *
 * @since 0.1.0
 */
export interface Client<
	Ps extends ReadonlyArray<Plugin.Any> = [],
	EB extends AnySchema = Schema.Unknown,
	SE extends StatusErrorMap | undefined = undefined,
> {
	/**
	 * The configured `HttpClient` underneath. It adds the base URL and the
	 * default headers to the requests you give it and runs every plugin
	 * with its defaults, but does no status check, no decoding, no
	 * `statusErrors` and no `onError` hooks.
	 *
	 * Transport failures are `NetworkError`s, next to the plugins' own
	 * errors. Use it for what the methods don't cover, such as a response
	 * you read yourself. For a streamed body, use {@link Client.sse} or
	 * {@link Client.ndjson}.
	 *
	 * @example
	 * ```ts
	 * import * as Effect from "effect/Effect";
	 * import * as HttpClientRequest from "effect/http/HttpClientRequest";
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const download = (api: Fetch.Client) =>
	 *   Effect.flatMap(
	 *     api.httpClient.execute(
	 *       HttpClientRequest.get("https://api.example.com/export.csv"),
	 *     ),
	 *     (response) => response.text,
	 *   );
	 * ```
	 */
	readonly httpClient: HttpClient.HttpClient.With<
		NetworkError | Plugin.Errors<Ps>
	>;

	/**
	 * The `statusErrors` the client was made with, as a frozen copy, or
	 * `undefined` without any. They apply to every call, after the call's
	 * or the endpoint's own.
	 *
	 * @example
	 * ```ts
	 * import * as Schema from "effect/Schema";
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * class SessionExpired extends Schema.TaggedError<SessionExpired>()(
	 *   "SessionExpired",
	 *   { message: Schema.String },
	 * ) {}
	 *
	 * declare const api: Fetch.Client<
	 *   [],
	 *   Schema.Unknown,
	 *   { 401: typeof SessionExpired }
	 * >;
	 * api.statusErrors[401]; // SessionExpired
	 * ```
	 */
	readonly statusErrors: SE;

	/**
	 * Sends a request with any HTTP method, for a method only known at
	 * runtime. The other methods are shorthand for this one. A `GET` or
	 * `HEAD` request can't have a body: passing one dies.
	 *
	 * @example
	 * ```ts
	 * import * as Schema from "effect/Schema";
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const Todo = Schema.Struct({ id: Schema.Finite, done: Schema.Boolean });
	 *
	 * const complete = (api: Fetch.Client, id: number) =>
	 *   api.request("PATCH", "/todos/:id", {
	 *     params: { id },
	 *     body: { done: true },
	 *     output: Todo,
	 *   });
	 * ```
	 */
	readonly request: RequestMethod<Ps, EB, SE>;

	/**
	 * Sends a `GET` request. Takes no body.
	 *
	 * @example
	 * ```ts
	 * import * as Schema from "effect/Schema";
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
	 *
	 * const list = (api: Fetch.Client) =>
	 *   api.get("/todos", {
	 *     query: { page: 1, tags: ["work", "urgent"] },
	 *     output: Schema.Array(Todo),
	 *   });
	 * // GET /todos?page=1&tags=work&tags=urgent
	 *
	 * const one = (api: Fetch.Client, id: number) =>
	 *   api.get("/todos/:id", { params: { id }, output: Todo });
	 * ```
	 */
	readonly get: NoBodyMethod<Ps, EB, SE>;

	/**
	 * Sends a `HEAD` request. Takes no body.
	 *
	 * @example
	 * ```ts
	 * import * as Effect from "effect/Effect";
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const exists = (api: Fetch.Client, id: number) =>
	 *   api.head("/todos/:id", { params: { id } }).pipe(
	 *     Effect.as(true),
	 *     Effect.catchTag("HttpError", () => Effect.succeed(false)),
	 *   );
	 * ```
	 */
	readonly head: NoBodyMethod<Ps, EB, SE>;

	/**
	 * Sends an `OPTIONS` request. Takes no body.
	 *
	 * @example
	 * ```ts
	 * import * as Effect from "effect/Effect";
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const allowed = (api: Fetch.Client) =>
	 *   Effect.map(api.options("/todos"), (response) => response.headers["allow"]);
	 * ```
	 */
	readonly options: NoBodyMethod<Ps, EB, SE>;

	/**
	 * Sends a `POST` request. `body` is sent according to its type, or
	 * encoded with `input` when given.
	 *
	 * @example
	 * ```ts
	 * import * as Schema from "effect/Schema";
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });
	 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
	 *
	 * const create = (api: Fetch.Client) =>
	 *   api.post("/todos", {
	 *     input: NewTodo,
	 *     body: { title: "Write docs", due: new Date() },
	 *     output: Todo,
	 *   });
	 *
	 * const upload = (api: Fetch.Client, file: Blob) => {
	 *   const form = new FormData();
	 *   form.append("file", file);
	 *   return api.post("/upload", { body: form });
	 * };
	 * ```
	 */
	readonly post: BodyMethod<Ps, EB, SE>;

	/**
	 * Sends a `PUT` request. `body` is sent according to its type, or
	 * encoded with `input` when given.
	 *
	 * @example
	 * ```ts
	 * import * as Schema from "effect/Schema";
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
	 *
	 * const replace = (api: Fetch.Client, todo: typeof Todo.Type) =>
	 *   api.put("/todos/:id", {
	 *     params: { id: todo.id },
	 *     input: Todo,
	 *     body: todo,
	 *     output: Todo,
	 *   });
	 * ```
	 */
	readonly put: BodyMethod<Ps, EB, SE>;

	/**
	 * Sends a `PATCH` request. `body` is sent according to its type, or
	 * encoded with `input` when given.
	 *
	 * @example
	 * ```ts
	 * import * as Schema from "effect/Schema";
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const Todo = Schema.Struct({ id: Schema.Finite, done: Schema.Boolean });
	 *
	 * const complete = (api: Fetch.Client, id: number) =>
	 *   api.patch("/todos/:id", {
	 *     params: { id },
	 *     body: { done: true },
	 *     output: Todo,
	 *   });
	 * ```
	 */
	readonly patch: BodyMethod<Ps, EB, SE>;

	/**
	 * Sends a `DELETE` request. Named `del` because `delete` is a reserved
	 * word.
	 *
	 * @example
	 * ```ts
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const remove = (api: Fetch.Client, id: number) =>
	 *   api.del("/todos/:id", { params: { id } });
	 * ```
	 */
	readonly del: BodyMethod<Ps, EB, SE>;

	/**
	 * Sends a request and gives its Server-Sent Events
	 * (`text/event-stream`) as a `Stream`, one `SseEvent` per event,
	 * as they arrive. Use it for progress feeds, notifications and the
	 * streamed answers of language models.
	 *
	 * - `output` decodes each event's `data` as JSON. `Fetch.text()` gives
	 *   the data as text, which is also the default without `output`.
	 * - `method` defaults to `"GET"`. Pass `"POST"`, with a `body`, for
	 *   APIs that stream the answer to a request.
	 * - The request sends `Accept: text/event-stream`, unless an `accept`
	 *   header is set on the call or the client.
	 *
	 * The request runs as any call does, up to the response's headers:
	 * plugins run once, `retry` and `timeout` apply to getting the
	 * response, and an error status fails the stream with an `HttpError`
	 * or a `statusErrors` error, before it gives anything, and a `204` or
	 * `205` gives an empty stream. Then the body is read as it arrives. An
	 * event whose data doesn't match `output`, a body that can't be read to
	 * the end, or a `Content-Type` other than `text/event-stream` fails the
	 * stream with a `DecodeError`, after the events before it. For plugins,
	 * the call ends when the headers arrive: their `onExit` hooks don't see
	 * the body being read.
	 *
	 * Interrupting the stream, or taking only part of it, aborts the
	 * request. The stream doesn't reconnect, and ignores `retry:` lines.
	 *
	 * @stability unstable: events are parsed with Effect's `encoding/Sse`,
	 * which Effect marks unstable.
	 *
	 * @example
	 * ```ts
	 * import * as Effect from "effect/Effect";
	 * import * as Schema from "effect/Schema";
	 * import * as Stream from "effect/Stream";
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const JobEvent = Schema.Struct({ percent: Schema.Finite });
	 *
	 * const follow = (api: Fetch.Client, id: number) =>
	 *   api.sse("/jobs/:id/events", { params: { id }, output: JobEvent }).pipe(
	 *     Stream.runForEach((event) => Effect.log(`${event.data.percent}%`)),
	 *   );
	 * ```
	 */
	readonly sse: StreamMethod<"sse", Ps, EB, SE>;

	/**
	 * Sends a request and gives its newline-delimited JSON body
	 * (`application/x-ndjson`, JSON Lines) as a `Stream`, one value per
	 * line, as they arrive. Use it for exports and other long lists that a
	 * server streams.
	 *
	 * - `output` decodes each line's JSON. Without it, each value is the
	 *   parsed JSON, as `unknown`. `Fetch.text()` gives each line's text.
	 * - Blank lines are skipped, and the last line needs no line end.
	 * - `method` defaults to `"GET"`.
	 * - The request sends `Accept: application/x-ndjson`, unless an
	 *   `accept` header is set on the call or the client.
	 *
	 * Errors, plugins, retries, timeouts and interruption work as for
	 * {@link Client.sse}. A line that isn't valid JSON or doesn't match
	 * `output` fails the stream with a `DecodeError` that gives its line
	 * number.
	 *
	 * @example
	 * ```ts
	 * import * as Schema from "effect/Schema";
	 * import * as Stream from "effect/Stream";
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * const Row = Schema.Struct({ id: Schema.Finite, name: Schema.String });
	 *
	 * const exportRows = (api: Fetch.Client) =>
	 *   api.ndjson("/export", { output: Row }).pipe(Stream.runCollect);
	 * ```
	 */
	readonly ndjson: StreamMethod<"ndjson", Ps, EB, SE>;

	/**
	 * Defines an endpoint: a route like `"GET /users/:id"` and the schemas,
	 * headers and plugin overrides to call it with. You get back a function
	 * that takes one call's `params`, `query`, `body`, `headers` and
	 * `plugins`, and returns the same Effect as the equivalent method:
	 * `getUser({ params: { id } })` sends what
	 * `api.get("/users/:id", { output: User, params: { id } })` does.
	 *
	 * - The route is checked as you type: an uppercase method, one space,
	 *   then a path starting with `/` or an absolute `http(s)://` URL.
	 * - `params` are required, with exactly the path's names, when the path
	 *   has any.
	 * - With an `input` schema, `body` is required and typed by it. `GET`,
	 *   `HEAD`, `OPTIONS` and `TRACE` endpoints take no body.
	 * - A call's `headers` and `plugins` are merged over the endpoint's, and
	 *   win. The schemas can't be changed per call.
	 * - With `stream: "sse"` or `stream: "ndjson"`, each call returns a
	 *   `Stream` of the body's values, as {@link Client.sse} and
	 *   {@link Client.ndjson} do.
	 *
	 * Defining an endpoint does nothing on its own: each call sends a
	 * request. A route that isn't valid (which the types prevent) throws.
	 *
	 * @example
	 * ```ts
	 * import * as Context from "effect/Context";
	 * import * as Effect from "effect/Effect";
	 * import * as Layer from "effect/Layer";
	 * import * as Schema from "effect/Schema";
	 * import * as Fetch from "@monarcode/effetch";
	 * import { bearer } from "@monarcode/effetch/plugins";
	 *
	 * const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
	 * const NewUser = Schema.Struct({ name: Schema.String });
	 * const Credentials = Schema.Struct({ user: Schema.String, password: Schema.String });
	 * const Session = Schema.Struct({ token: Schema.String });
	 *
	 * class Api extends Fetch.Service<Api>()("Api", {
	 *   baseUrl: "https://api.example.com",
	 *   plugins: [bearer({ token: "token" })],
	 * }) {}
	 *
	 * // Made once, when the layer is built.
	 * const makeUserApi = Effect.gen(function* () {
	 *   const api = yield* Api;
	 *   return {
	 *     getUser: api.endpoint("GET /users/:id", { output: User }),
	 *     createUser: api.endpoint("POST /users", { input: NewUser, output: User }),
	 *     login: api.endpoint("POST /auth/login", {
	 *       input: Credentials,
	 *       output: Session,
	 *       plugins: { bearer: false },
	 *     }),
	 *   };
	 * });
	 *
	 * class UserApi extends Context.Service<
	 *   UserApi,
	 *   Effect.Success<typeof makeUserApi>
	 * >()("UserApi") {}
	 *
	 * const UserApiLive = Layer.effect(UserApi)(makeUserApi);
	 *
	 * const program = Effect.gen(function* () {
	 *   const { getUser, createUser } = yield* UserApi;
	 *   const ada = yield* createUser({ body: { name: "Ada" } });
	 *   return yield* getUser({ params: { id: ada.id } });
	 * });
	 * ```
	 */
	readonly endpoint: EndpointMethod<Ps, EB, SE>;

	/**
	 * Binds an endpoint defined with `Fetch.endpoint` to this client. You get
	 * back the same endpoint `client.endpoint` makes from the same route and
	 * definition: `api.bind(Fetch.endpoint("GET /users/:id", { output: User }))`
	 * is `api.endpoint("GET /users/:id", { output: User })`.
	 *
	 * - Without its own `error`, the endpoint uses this client's
	 *   `defaultError`. This client's `statusErrors` are tried after the
	 *   definition's.
	 * - `plugins` overrides are given here, checked against this client's
	 *   plugins. A call's own override wins.
	 * - `headers` given here are sent over the definition's. A call's own
	 *   header wins over both.
	 *
	 * Binding does nothing on its own, and one definition can be bound to
	 * several clients: each endpoint sends to its own client's `baseUrl`,
	 * with its plugins.
	 *
	 * To bind a record of definitions at once, use {@link Client.bindAll}.
	 * To share them as a service, use `Fetch.Endpoints`.
	 *
	 * @example
	 * ```ts
	 * import * as Context from "effect/Context";
	 * import type * as Effect from "effect/Effect";
	 * import * as Layer from "effect/Layer";
	 * import * as Schema from "effect/Schema";
	 * import * as Fetch from "@monarcode/effetch";
	 * import { bearer } from "@monarcode/effetch/plugins";
	 *
	 * const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
	 * const Session = Schema.Struct({ token: Schema.String });
	 *
	 * // Next to the schemas, without a client.
	 * const getUser = Fetch.endpoint("GET /users/:id", { output: User });
	 * const refresh = Fetch.endpoint("POST /auth/refresh", { output: Session });
	 *
	 * class Api extends Fetch.Service<Api>()("Api", {
	 *   baseUrl: "https://api.example.com",
	 *   plugins: [bearer({ token: "token" })],
	 * }) {}
	 *
	 * // Bound once, when a layer is built. `Fetch.Endpoints` does this for
	 * // a record of definitions.
	 * const makeUserApi = Api.useSync((api) => ({
	 *   getUser: api.bind(getUser),
	 *   refresh: api.bind(refresh, { plugins: { bearer: false } }),
	 * }));
	 *
	 * class UserApi extends Context.Service<
	 *   UserApi,
	 *   Effect.Success<typeof makeUserApi>
	 * >()("UserApi") {}
	 *
	 * const UserApiLive = Layer.effect(UserApi)(makeUserApi);
	 * ```
	 */
	readonly bind: BindMethod<Ps, EB, SE>;

	/**
	 * Binds a record of endpoint definitions at once: each entry is bound as
	 * {@link Client.bind} binds it, and keeps its name. An entry is a definition
	 * made with `Fetch.endpoint`, or a `[definition, options]` pair, where
	 * `options` are the options (`BindOptions`) `client.bind` takes.
	 *
	 * Binding does nothing on its own: no request is sent until an endpoint
	 * is called. An entry that isn't a definition throws, since that's a
	 * bug in the calling code. To share the endpoints as a service, see
	 * `Fetch.Endpoints`, which calls this when its layer is built.
	 *
	 * @example
	 * ```ts
	 * import * as Context from "effect/Context";
	 * import * as Effect from "effect/Effect";
	 * import * as Layer from "effect/Layer";
	 * import * as Schema from "effect/Schema";
	 * import * as Fetch from "@monarcode/effetch";
	 * import { bearer } from "@monarcode/effetch/plugins";
	 *
	 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
	 * const Session = Schema.Struct({ token: Schema.String });
	 *
	 * const listTodos = Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) });
	 * const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
	 * const refresh = Fetch.endpoint("POST /auth/refresh", { output: Session });
	 *
	 * class Api extends Fetch.Service<Api>()("Api", {
	 *   baseUrl: "https://api.example.com",
	 *   plugins: [bearer({ token: "token" })],
	 * }) {}
	 *
	 * // Bound once, when a layer is built. `Fetch.Endpoints` declares this
	 * // service and its layer in one class.
	 * const makeTodoApi = Api.useSync((api) =>
	 *   api.bindAll({
	 *     list: listTodos,
	 *     get: getTodo,
	 *     refresh: [refresh, { plugins: { bearer: false } }],
	 *   }),
	 * );
	 *
	 * class TodoApi extends Context.Service<
	 *   TodoApi,
	 *   Effect.Success<typeof makeTodoApi>
	 * >()("TodoApi") {}
	 *
	 * const TodoApiLive = Layer.effect(TodoApi)(makeTodoApi);
	 *
	 * const program = Effect.gen(function* () {
	 *   const todos = yield* TodoApi;
	 *   return yield* todos.get({ params: { id: 1 } });
	 * });
	 * ```
	 */
	readonly bindAll: BindAllMethod<Ps, EB, SE>;
}

/**
 * Makes a {@link Client}.
 *
 * `make` is an Effect: it needs an `HttpClient` (for example
 * `FetchHttpClient.layer`, or a mock in tests), whatever the `baseUrl`
 * Effect needs, and the services the plugins need. The client holds on to
 * all of them, so its calls need nothing from the environment apart from
 * the services of the schemas they decode and encode with.
 *
 * Calls run with the services and references `make` had, plus those of
 * the calling fiber, which win: a reference provided around one call (such
 * as `FetchHttpClient.RequestInit`) overrides the one `make` saw.
 *
 * Calls fail with `NetworkError` when no response arrives, `HttpError` for
 * a non-2xx status, `DecodeError` when `output` doesn't match, with the
 * plugins' own errors, and with your own errors where `statusErrors` turn a
 * status into one. `Fetch.catchStatus` and `Fetch.optional` handle a
 * status at the call.
 *
 * Invalid input is a defect, not a typed error, because it's a mistake in
 * the calling code: two plugins with the same name, a missing path param,
 * a body that can't be encoded, a body on a `GET` or `HEAD` request, a
 * `baseUrl` with a query string or a fragment, and, outside browsers, a
 * relative URL without a `baseUrl` (browsers resolve it against the page's
 * URL).
 *
 * An `HttpClient` that fails on non-2xx statuses (`filterStatusOk`) works
 * too: Effetch takes the response back and reports the usual `HttpError`.
 *
 * `Fetch.Service` is the recommended way to set up a client: it declares
 * the service, its layer and its config in one class, and takes the same
 * config. Use `make` directly in scripts and tests, to make a client inside
 * your own service's layer, or when the config itself comes from an Effect,
 * as in the example below, where the headers are read from a service.
 *
 * **Browsers and tracing headers.** Effect's `HttpClient` adds `traceparent`
 * and `b3` headers to every request. In a browser, those make cross-origin
 * calls to APIs that don't allow them fail the CORS preflight. Turn that
 * off where you run the program, or only around `make`, which then applies
 * it to all of the client's calls:
 *
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as HttpClient from "effect/http/HttpClient";
 *
 * declare const program: Effect.Effect<void>;
 *
 * const main = Effect.provideService(
 *   program,
 *   HttpClient.TracerPropagationEnabled,
 *   false,
 * );
 * ```
 *
 * @example
 * ```ts
 * import * as Context from "effect/Context";
 * import * as Effect from "effect/Effect";
 * import * as Layer from "effect/Layer";
 * import * as FetchHttpClient from "effect/http/FetchHttpClient";
 * import * as Fetch from "@monarcode/effetch";
 *
 * // In a script
 * const health = Effect.gen(function* () {
 *   const api = yield* Fetch.make({ baseUrl: "https://api.example.com" });
 *   return yield* api.get("/health");
 * }).pipe(Effect.provide(FetchHttpClient.layer));
 *
 * // With a config read from a service
 * class Tenant extends Context.Service<Tenant, { readonly id: string }>()(
 *   "Tenant",
 * ) {}
 *
 * const makeApi = Effect.gen(function* () {
 *   const tenant = yield* Tenant;
 *   return yield* Fetch.make({
 *     baseUrl: "https://api.example.com",
 *     headers: { "x-tenant": tenant.id },
 *   });
 * });
 *
 * class Api extends Context.Service<Api, Effect.Success<typeof makeApi>>()("Api") {}
 *
 * const ApiLive = Layer.effect(Api)(makeApi).pipe(
 *   Layer.provide(FetchHttpClient.layer),
 * );
 * ```
 *
 * @since 0.1.0
 */
export const make = <
	const Ps extends ReadonlyArray<Plugin.Any> = [],
	EB extends AnySchema = Schema.Unknown,
	BaseE = never,
	BaseR = never,
	SE extends StatusErrorMap | undefined = undefined,
>(
	config: ClientConfig<Ps, EB, BaseE, BaseR, SE> = {},
): Effect.Effect<
	Client<Ps, EB, SE>,
	BaseE,
	HttpClient.HttpClient | BaseR | Plugin.Services<Ps>
> =>
	Effect.gen(function* () {
		const provided = yield* HttpClient.HttpClient;
		const context = yield* Effect.context<never>();
		const plugins: ReadonlyArray<Plugin.Any> = config.plugins ?? [];
		const duplicate = plugins.find(
			(plugin, index) =>
				plugins.findIndex((other) => other.name === plugin.name) !== index,
		);
		if (duplicate !== undefined) {
			return yield* Effect.die(
				new Error(`Two plugins are named "${duplicate.name}"`),
			);
		}
		const baseUrl =
			config.baseUrl === undefined || typeof config.baseUrl === "string"
				? config.baseUrl
				: yield* config.baseUrl;
		if (baseUrl !== undefined && hasQueryOrFragment(baseUrl)) {
			return yield* Effect.die(
				new Error(
					"The baseUrl can't contain a query string or a fragment: pass query parameters with the `query` option of each call",
				),
			);
		}
		const applyDefaults = makeApplyDefaults(
			baseUrl,
			Headers.fromInput(config.headers),
		);
		const chain = applyPlugins(mapClientErrors(provided), plugins, context);
		const httpClient = HttpClient.mapRequestInput(
			HttpClient.transformResponse(chain, (response) =>
				response.pipe(
					provideOverrides(undefined),
					provideRoute(undefined),
					provideResponseBox(undefined),
				),
			),
			applyDefaults,
		);
		const statusErrors = freezeStatusErrors(config.statusErrors);
		const defaults = {
			defaultError: config.defaultError,
			statusErrors,
			baseUrl,
		};
		const call = makeCall({
			errorSchema: config.defaultError,
			statusErrors,
			applyDefaults,
			chain,
			plugins,
			context,
		});
		const client = {
			httpClient,
			statusErrors,
			request: (
				method: HttpMethod.HttpMethod,
				path: string,
				options?: RuntimeOptions,
			) => call(method)(path, options),
			get: call("GET"),
			head: call("HEAD"),
			options: call("OPTIONS"),
			post: call("POST"),
			put: call("PUT"),
			patch: call("PATCH"),
			del: call("DELETE"),
			sse: (path: string, options?: StreamCallOptions) =>
				streamCall(call, "sse", path, options),
			ndjson: (path: string, options?: StreamCallOptions) =>
				streamCall(call, "ndjson", path, options),
			endpoint: (route: string, definition?: RuntimeDefinition) =>
				makeEndpoint(call, defaults, route, definition),
			bind: (
				definition: RuntimeUnboundEndpoint,
				options?: RuntimeBindOptions,
			) => bindEndpoint(call, defaults, definition, options),
			bindAll: (definitions: RuntimeDefinitions) =>
				bindAllEndpoints(call, defaults, definitions),
		};
		return client as unknown as Client<Ps, EB, SE>;
	});
