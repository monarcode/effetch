import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpMethod from "effect/http/HttpMethod";
import type * as Schema from "effect/Schema";

import type { NetworkError } from "./Errors.js";
import { makeApplyDefaults, mapClientErrors } from "./internal/pipeline.js";
import { applyPlugins, provideOverrides } from "./internal/plugins.js";
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
 * - `error`: the default schema for non-2xx response bodies. A call's own
 *   `error` option replaces it.
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
 * const make = Fetch.make({
 *   baseUrl: Config.String("API_URL"),
 *   headers: { accept: "application/json" },
 *   error: ApiError,
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
	/** Default schema for non-2xx response bodies. */
	readonly error?: EB | undefined;
	/** Plugins, outermost first. Names must be unique. */
	readonly plugins?: Ps | undefined;
}

/**
 * A client made by {@link make}. Every call returns an Effect that needs
 * no services, apart from those the call's own schemas require, and that
 * can fail with the plugins' errors on top of effetch's own.
 *
 * - `Ps`: the plugins the client was made with.
 * - `EB`: the client's default `error` schema.
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
 * const make = Fetch.make({
 *   baseUrl: "https://api.example.com",
 *   headers: { accept: "application/json" },
 * });
 *
 * class Api extends Context.Service<Api, Effect.Success<typeof make>>()("Api") {}
 *
 * const ApiLive = Layer.effect(Api)(make).pipe(
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
			HttpClient.transformResponse(chain, provideOverrides(undefined)),
			applyDefaults,
		);
		const call = makeCall({
			errorSchema: config.error,
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
		};
		return client as unknown as Client<Ps, EB>;
	});
