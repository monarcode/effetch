import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpMethod from "effect/http/HttpMethod";
import type * as Schema from "effect/Schema";

import type { EndpointMethod } from "./Endpoint.js";
import type { NetworkError } from "./Errors.js";
import { makeEndpoint, type RuntimeDefinition } from "./internal/endpoint.js";
import { makeApplyDefaults, mapClientErrors } from "./internal/pipeline.js";
import {
	applyPlugins,
	provideOverrides,
	provideRoute,
} from "./internal/plugins.js";
import { makeCall, type RuntimeOptions } from "./internal/request.js";
import { hasQueryOrFragment } from "./internal/url.js";
import type {
	AnySchema,
	BodyMethod,
	NoBodyMethod,
	RequestMethod,
} from "./Options.js";
import type { Plugin } from "./Plugin.js";

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
 *   schema, effetch sends `Accept: application/json` unless an `accept`
 *   header is set here or on the call.
 * - `defaultError`: the schema for non-2xx response bodies of calls that
 *   don't pass their own `error` option. A call's `error` replaces it.
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
 * const makeApi = Fetch.make({
 *   baseUrl: Config.String("API_URL"),
 *   headers: { accept: "application/json" },
 *   defaultError: ApiError,
 *   plugins: [apiKey],
 * });
 * ```
 *
 * @since 0.1.0
 */
export interface ClientConfig<
	Ps extends ReadonlyArray<Plugin.Any> = [],
	EB extends AnySchema = Schema.Unknown,
	BaseE = never,
	BaseR = never,
> {
	/** Prepended to relative paths. A string, or an Effect run once by `make`. */
	readonly baseUrl?: string | Effect.Effect<string, BaseE, BaseR> | undefined;
	/** Headers sent with every request. */
	readonly headers?: Headers.Input | undefined;
	/** Schema for non-2xx response bodies, unless a call passes its own `error`. */
	readonly defaultError?: EB | undefined;
	/** Plugins, outermost first. Names must be unique. */
	readonly plugins?: Ps | undefined;
}

/**
 * A client made by {@link make}. Every call returns an Effect that needs
 * no services, apart from those the call's own schemas require, and that
 * can fail with the plugins' errors on top of effetch's own.
 *
 * - `Ps`: the plugins the client was made with.
 * - `EB`: the client's `defaultError` schema.
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
> {
	/**
	 * The configured `HttpClient` underneath. It adds the base URL and the
	 * default headers to the requests you give it and runs every plugin
	 * with its defaults, but does no status check, no decoding and no
	 * `onError` hooks.
	 *
	 * Transport failures are `NetworkError`s, next to the plugins' own
	 * errors. Use it for anything the methods don't cover, such as
	 * streaming a response.
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
	 * Sends a request with any HTTP method. The other methods are shorthand
	 * for this one.
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
	readonly request: RequestMethod<Ps, EB>;

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
	readonly get: NoBodyMethod<Ps, EB>;

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
	readonly head: NoBodyMethod<Ps, EB>;

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
	readonly options: NoBodyMethod<Ps, EB>;

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
	readonly post: BodyMethod<Ps, EB>;

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
	readonly put: BodyMethod<Ps, EB>;

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
	readonly patch: BodyMethod<Ps, EB>;

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
	readonly del: BodyMethod<Ps, EB>;

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
	 *
	 * Defining an endpoint does nothing on its own: each call sends a
	 * request. A route that isn't valid (which the types prevent) throws.
	 *
	 * @example
	 * ```ts
	 * import * as Context from "effect/Context";
	 * import * as Effect from "effect/Effect";
	 * import * as Schema from "effect/Schema";
	 * import * as Fetch from "@monarcode/effetch";
	 * import { bearer } from "@monarcode/effetch/plugins";
	 *
	 * const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
	 * const NewUser = Schema.Struct({ name: Schema.String });
	 * const Credentials = Schema.Struct({ user: Schema.String, password: Schema.String });
	 * const Session = Schema.Struct({ token: Schema.String });
	 *
	 * const makeApi = Effect.gen(function* () {
	 *   const api = yield* Fetch.make({
	 *     baseUrl: "https://api.example.com",
	 *     plugins: [bearer({ token: "token" })],
	 *   });
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
	 * class Api extends Context.Service<Api, Effect.Success<typeof makeApi>>()("Api") {}
	 *
	 * const program = Effect.gen(function* () {
	 *   const { getUser, createUser } = yield* Api;
	 *   const ada = yield* createUser({ body: { name: "Ada" } });
	 *   return yield* getUser({ params: { id: ada.id } });
	 * });
	 * ```
	 */
	readonly endpoint: EndpointMethod<Ps, EB>;
}

/**
 * Makes a {@link Client}.
 *
 * `make` is an Effect: it needs an `HttpClient` (for example
 * `FetchHttpClient.layer`, or a mock in tests), whatever the `baseUrl`
 * Effect needs, and the services the plugins need. The client holds on to
 * all of them, so its calls need nothing from the environment apart from
 * the services of their own schemas.
 *
 * Calls run with the services and references `make` had, plus those of
 * the calling fiber, which win: a reference provided around one call (such
 * as `FetchHttpClient.RequestInit`) overrides the one `make` saw.
 *
 * Calls fail with `NetworkError` when no response arrives, `HttpError` for
 * a non-2xx status, `DecodeError` when `output` doesn't match, and with
 * the plugins' own errors.
 *
 * Invalid input is a defect, not a typed error, because it's a mistake in
 * the calling code: two plugins with the same name, a missing path param,
 * a body that can't be encoded, a body on a `GET` or `HEAD` request, a
 * `baseUrl` with a query string or a fragment, and, outside browsers, a
 * relative URL without a `baseUrl` (browsers resolve it against the page's
 * URL).
 *
 * An `HttpClient` that fails on non-2xx statuses (`filterStatusOk`) works
 * too: effetch takes the response back and reports the usual `HttpError`.
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
 * const makeApi = Fetch.make({
 *   baseUrl: "https://api.example.com",
 *   headers: { accept: "application/json" },
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
>(
	config: ClientConfig<Ps, EB, BaseE, BaseR> = {},
): Effect.Effect<
	Client<Ps, EB>,
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
				response.pipe(provideOverrides(undefined), provideRoute(undefined)),
			),
			applyDefaults,
		);
		const call = makeCall({
			errorSchema: config.defaultError,
			applyDefaults,
			chain,
			plugins,
			context,
		});
		const client = {
			httpClient,
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
			endpoint: (route: string, definition?: RuntimeDefinition) =>
				makeEndpoint(call, config.defaultError, route, definition),
		};
		return client as unknown as Client<Ps, EB>;
	});
