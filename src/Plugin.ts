import type * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";

/**
 * `unknown` if `T` is `any`, else `T`, so erased plugin types don't spread
 * `any`.
 */
type AnyToUnknown<T> = 0 extends 1 & T ? unknown : T;

/**
 * `T` itself, once known. As a return type it stops TypeScript inferring
 * `T` from where the result goes: inside a `plugins` list, that would be
 * `Plugin.Any`, and the plugin's errors and services would become `any`.
 */
type Settled<T> = [T] extends [infer U] ? U : never;

/** The error (`E`), services (`R`) and options (`Opts`) types of plugin `P`. */
type Parts<P> =
	P extends Plugin<string, infer E, infer R, infer Opts>
		? {
				readonly E: AnyToUnknown<E>;
				readonly R: AnyToUnknown<R>;
				readonly Opts: Opts;
			}
		: never;

/**
 * An optional override per plugin name in `Ps`, leaving out non-literal
 * names.
 */
type OverrideMap<Ps extends ReadonlyArray<Plugin.Any>> = {
	readonly [P in Ps[number] as string extends P["name"] ? never : P["name"]]?:
		| Plugin.Override<P>
		| undefined;
};

/** The brand that makes {@link Plugin.UpstreamError} opaque. */
declare const UpstreamErrorTypeId: unique symbol;
/** The brand that makes {@link Plugin.UpstreamServices} opaque. */
declare const UpstreamServicesTypeId: unique symbol;

/**
 * What a plugin hook receives besides the request or response.
 *
 * - `request`: in `onRequest`, the request it receives. In `onResponse`,
 *   the request this plugin passed on (plugins after it may have changed it
 *   further; `response.request` is the one that was sent). In `onError`,
 *   the request as the call built it, before any plugin ran.
 * - `options`: the plugin's `defaults` merged with this call's override,
 *   `{ ...defaults, ...override }`, where `undefined` values in the
 *   override keep the default. `undefined` for a plugin without
 *   `defaults`.
 * - `route`: the call's method and path as written, before its params are
 *   filled in, such as `"GET /users/:id"`. It's the same for every call to
 *   that path, whether made with a method like `get` or an endpoint, so
 *   logs and metrics can be grouped by it. `undefined` for requests sent
 *   through `client.httpClient`.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const tracing = Fetch.plugin({
 *   name: "tracing",
 *   defaults: { header: "x-request-id" },
 *   onResponse: (response, ctx: Fetch.PluginContext<{ header: string }>) =>
 *     Effect.as(
 *       Effect.logDebug(
 *         ctx.route ?? ctx.request.url,
 *         response.headers[ctx.options.header],
 *       ),
 *       response,
 *     ),
 * });
 * ```
 *
 * @since 0.1.0
 */
export interface PluginContext<Opts> {
	/** The request this hook is about (see above for which one). */
	readonly request: HttpClientRequest.HttpClientRequest;
	/** The plugin's `defaults` merged with this call's override. */
	readonly options: Opts;
	/**
	 * The call's method and unfilled path, such as `"GET /users/:id"`.
	 * `undefined` for requests sent through `client.httpClient`.
	 */
	readonly route: string | undefined;
}

/**
 * A plugin hooks into every call a client makes.
 *
 * - `onRequest` can change the request, or fail. Plugins run it in array
 *   order. It sees the full URL and the client's default headers.
 * - `onResponse` can change the response, or fail. It runs in reverse order
 *   and sees every response, non-2xx included: the library checks the status
 *   and decodes `output` only after the whole plugin chain.
 * - `onError` observes any failure of the call (after status check and
 *   decoding) and can't change the outcome.
 * - `wrap` wraps the rest of the chain, for retries, timeouts and the like.
 *   It can add errors (`E`) but can't remove the ones from further in.
 *
 * `plugins[0]` is the outermost layer. A plugin's `wrap` encloses its own
 * `onRequest` and `onResponse` and every plugin after it, so a retrying
 * `wrap` runs them again on each attempt. Transport failures reach plugins
 * as `NetworkError`s, never as Effect's `HttpClientError`.
 *
 * The services a plugin needs (`R`) are required by `make`, once; calls on
 * the client don't need them.
 *
 * `Opts` is the type of the options calls can override, and `defaults`
 * holds their values. Calls override them with
 * `plugins: { [name]: { ...partial } }`, and any plugin can be skipped for
 * one call with `plugins: { [name]: false }`. A plugin with options must
 * have `defaults`; {@link plugin} enforces this.
 *
 * Build plugins with {@link plugin}, which infers the type parameters.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as HttpClientRequest from "effect/http/HttpClientRequest";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const apiKey: Fetch.Plugin<"apiKey"> = Fetch.plugin({
 *   name: "apiKey",
 *   onRequest: (request) =>
 *     Effect.succeed(
 *       HttpClientRequest.setHeader(request, "x-api-key", "secret"),
 *     ),
 * });
 * ```
 *
 * @since 0.1.0
 */
export interface Plugin<
	Name extends string,
	E = never,
	R = never,
	Opts = undefined,
> {
	/** Unique within a client. Used as the key for per-request overrides. */
	readonly name: Name;
	/** Default options. Enables per-request `Partial<Opts>` overrides. */
	readonly defaults?: Opts | undefined;
	/** Runs before the request is sent, in array order. */
	readonly onRequest?: Plugin.OnRequest<Opts, E, R> | undefined;
	/** Runs on every response, non-2xx included, in reverse array order. */
	readonly onResponse?: Plugin.OnResponse<Opts, E, R> | undefined;
	/** Observes any failure of the call. Can't change the outcome. */
	readonly onError?: Plugin.OnError<Opts, R> | undefined;
	/** Wraps the rest of the chain. */
	readonly wrap?: Plugin.Wrap<Opts, E, R> | undefined;
}

/**
 * Type-level helpers for {@link Plugin}.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type Plugins = [Fetch.Plugin<"bearer">];
 * type Overrides = Fetch.Plugin.Overrides<Plugins>;
 * //   ^? { readonly bearer?: false | undefined }
 * ```
 *
 * @since 0.1.0
 */
export declare namespace Plugin {
	/**
	 * The `onRequest` hook: returns the request to send, possibly changed.
	 *
	 * @example
	 * ```ts
	 * import * as Effect from "effect/Effect";
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * const passThrough: Fetch.Plugin.OnRequest<undefined, never, never> = (
	 *   request,
	 * ) => Effect.succeed(request);
	 * ```
	 *
	 * @since 0.1.0
	 */
	export type OnRequest<Opts, E, R> = (
		request: HttpClientRequest.HttpClientRequest,
		ctx: PluginContext<Opts>,
	) => Effect.Effect<HttpClientRequest.HttpClientRequest, E, R>;

	/**
	 * The `onResponse` hook: returns the response, possibly changed, or
	 * fails. Sees non-2xx responses too.
	 *
	 * @example
	 * ```ts
	 * import * as Effect from "effect/Effect";
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * const passThrough: Fetch.Plugin.OnResponse<undefined, never, never> = (
	 *   response,
	 * ) => Effect.succeed(response);
	 * ```
	 *
	 * @since 0.1.0
	 */
	export type OnResponse<Opts, E, R> = (
		response: HttpClientResponse.HttpClientResponse,
		ctx: PluginContext<Opts>,
	) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>;

	/**
	 * The `onError` hook. `error` is a `FetchError`, another plugin's error,
	 * or a defect's cause. It can't fail or change the call's outcome: if it
	 * dies, the defect is logged at Debug level and ignored.
	 *
	 * Hooks run in array order, after the status check and decoding. They
	 * don't run when the call succeeds or is interrupted, when it dies
	 * before its request is built (a missing path param, a body that can't
	 * be encoded), or for a plugin the call skips.
	 *
	 * @example
	 * ```ts
	 * import * as Effect from "effect/Effect";
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * const report: Fetch.Plugin.OnError<undefined, never> = (error, ctx) =>
	 *   Effect.logWarning(ctx.request.url, error);
	 * ```
	 *
	 * @since 0.1.0
	 */
	export type OnError<Opts, R> = (
		error: unknown,
		ctx: PluginContext<Opts>,
	) => Effect.Effect<void, never, R>;

	/**
	 * The `wrap` hook: wraps the rest of the chain (`client`). Its error and
	 * service types are opaque placeholders, so a `wrap` can add errors and
	 * services but can't drop the ones from further in. `options` reads
	 * this call's merged options, and `route` this call's route (see
	 * {@link PluginContext}).
	 *
	 * Write the body with `Effect.gen` rather than a ternary that returns
	 * two different Effects: TypeScript can't union their error types.
	 *
	 * @example
	 * ```ts
	 * import * as Effect from "effect/Effect";
	 * import * as HttpClient from "effect/http/HttpClient";
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * const retryTwice: Fetch.Plugin.Wrap<undefined, never, never> = (client) =>
	 *   HttpClient.retry(client, { times: 2 });
	 *
	 * const timed: Fetch.Plugin.Wrap<undefined, never, never> = (
	 *   client,
	 *   _options,
	 *   route,
	 * ) =>
	 *   HttpClient.transform(client, (response, request) =>
	 *     Effect.gen(function* () {
	 *       const label = (yield* route) ?? request.url;
	 *       return yield* Effect.withLogSpan(response, label);
	 *     }),
	 *   );
	 * ```
	 *
	 * @since 0.1.0
	 */
	export type Wrap<Opts, E, R> = (
		client: Upstream,
		options: Effect.Effect<Opts>,
		route: Effect.Effect<string | undefined>,
	) => HttpClient.HttpClient.With<UpstreamError | E, UpstreamServices | R>;

	/**
	 * Any plugin. Use it to constrain a generic plugin-list parameter
	 * (`Ps extends ReadonlyArray<Plugin.Any>`).
	 *
	 * Don't annotate a plugin list with it: that erases the plugins' types,
	 * so a client's errors and services become `unknown` and per-request
	 * overrides accept no names. Pass the list inline or let TypeScript
	 * infer it.
	 *
	 * It's structural rather than `Plugin<string, any, any, any>`: the
	 * `HttpClient` returned by `wrap` is invariant in its error and service
	 * types, and `any` isn't assignable to `never`, so plugins without
	 * services wouldn't fit that form.
	 *
	 * @example
	 * ```ts
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * type Names<Ps extends ReadonlyArray<Fetch.Plugin.Any>> =
	 *   Ps[number]["name"];
	 * ```
	 *
	 * @since 0.1.0
	 */
	export interface Any {
		/** The plugin's name. */
		readonly name: string;
		/** The plugin's default options, if any. */
		readonly defaults?: any;
		/** The plugin's `onRequest` hook, if any. */
		readonly onRequest?: OnRequest<any, any, any> | undefined;
		/** The plugin's `onResponse` hook, if any. */
		readonly onResponse?: OnResponse<any, any, any> | undefined;
		/** The plugin's `onError` hook, if any. */
		readonly onError?: OnError<any, any> | undefined;
		/** The plugin's `wrap` hook, if any. */
		readonly wrap?:
			| ((
					client: Upstream,
					options: Effect.Effect<any>,
					route: Effect.Effect<string | undefined>,
			  ) => HttpClient.HttpClient.With<any, any>)
			| undefined;
	}

	/**
	 * Stands for the errors of everything inside a plugin's `wrap`: the
	 * network, the library's other errors and inner plugins' errors. It's
	 * opaque on purpose; a `wrap` can only pass it through.
	 *
	 * @example
	 * ```ts
	 * import type * as HttpClient from "effect/http/HttpClient";
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * type Wrapped = HttpClient.HttpClient.With<
	 *   Fetch.Plugin.UpstreamError | Error,
	 *   Fetch.Plugin.UpstreamServices
	 * >;
	 * ```
	 *
	 * @since 0.1.0
	 */
	export interface UpstreamError {
		/** Makes the type opaque: no real error has this property. */
		readonly [UpstreamErrorTypeId]: typeof UpstreamErrorTypeId;
	}

	/**
	 * Stands for the services required by everything inside a plugin's
	 * `wrap`. Opaque, like {@link UpstreamError}.
	 *
	 * @example
	 * ```ts
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * declare const services: Fetch.Plugin.UpstreamServices;
	 * ```
	 *
	 * @since 0.1.0
	 */
	export interface UpstreamServices {
		/** Makes the type opaque: no real service has this property. */
		readonly [UpstreamServicesTypeId]: typeof UpstreamServicesTypeId;
	}

	/**
	 * The client a plugin's `wrap` receives: the rest of the chain.
	 *
	 * @example
	 * ```ts
	 * import * as HttpClient from "effect/http/HttpClient";
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * const withRetries = (client: Fetch.Plugin.Upstream) =>
	 *   HttpClient.retry(client, { times: 2 });
	 * ```
	 *
	 * @since 0.1.0
	 */
	export interface Upstream extends HttpClient.HttpClient.With<
		UpstreamError,
		UpstreamServices
	> {}

	/**
	 * What {@link plugin} accepts. Like {@link Plugin}, but each hook has its
	 * own error and service type parameters, so hooks that fail with
	 * different errors infer their union instead of conflicting.
	 *
	 * `Opts` is inferred from `defaults` only, never from a hook's `ctx`
	 * annotation, so `ctx.options` is typed as present only when `defaults`
	 * exist.
	 *
	 * @example
	 * ```ts
	 * import * as Effect from "effect/Effect";
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * const definition: Fetch.Plugin.Definition<
	 *   "noop", never, never, never, never, never, never, never, undefined
	 * > = { name: "noop", onRequest: Effect.succeed };
	 * ```
	 *
	 * @since 0.1.0
	 */
	export interface Definition<
		Name extends string,
		ERequest,
		EResponse,
		EWrap,
		RRequest,
		RResponse,
		RError,
		RWrap,
		Opts,
	> {
		/** Unique within a client. Used as the key for per-request overrides. */
		readonly name: Name;
		/** Default options. Enables per-request `Partial<Opts>` overrides. */
		readonly defaults?: Opts | undefined;
		/** Runs before the request is sent, in array order. */
		readonly onRequest?:
			| OnRequest<NoInfer<Opts>, ERequest, RRequest>
			| undefined;
		/** Runs on every response, non-2xx included, in reverse array order. */
		readonly onResponse?:
			| OnResponse<NoInfer<Opts>, EResponse, RResponse>
			| undefined;
		/** Observes any failure of the call. Can't change the outcome. */
		readonly onError?: OnError<NoInfer<Opts>, RError> | undefined;
		/** Wraps the rest of the chain. */
		readonly wrap?: Wrap<NoInfer<Opts>, EWrap, RWrap> | undefined;
	}

	/**
	 * The union of errors the plugins in `Ps` can add to a call. `unknown`
	 * if a plugin's types were erased (for example by {@link Any}).
	 *
	 * @example
	 * ```ts
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * class TimeoutError extends Error {
	 *   readonly _tag = "TimeoutError";
	 * }
	 *
	 * type E = Fetch.Plugin.Errors<[Fetch.Plugin<"timeout", TimeoutError>]>;
	 * //   ^? TimeoutError
	 * ```
	 *
	 * @since 0.1.0
	 */
	export type Errors<Ps extends ReadonlyArray<Any>> = Parts<Ps[number]>["E"];

	/**
	 * The union of services the plugins in `Ps` require. `make` requires
	 * them once; calls on the client don't. `unknown` if a plugin's types
	 * were erased.
	 *
	 * @example
	 * ```ts
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * declare const plugins: [Fetch.Plugin<"auth", never, "Session">];
	 *
	 * type R = Fetch.Plugin.Services<typeof plugins>;
	 * //   ^? "Session"
	 * ```
	 *
	 * @since 0.1.0
	 */
	export type Services<Ps extends ReadonlyArray<Any>> = Parts<Ps[number]>["R"];

	/**
	 * The options type of plugin `P`.
	 *
	 * @example
	 * ```ts
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * type Opts = Fetch.Plugin.Options<
	 *   Fetch.Plugin<"retry", never, never, { times: number }>
	 * >;
	 * //   ^? { times: number }
	 * ```
	 *
	 * @since 0.1.0
	 */
	export type Options<P extends Any> = Parts<P>["Opts"];

	/**
	 * What one plugin accepts as a per-request override: `false` to skip
	 * it, or a partial of its options. Plugins without options accept only
	 * `false`. Keys set to `undefined` keep their default.
	 *
	 * @example
	 * ```ts
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * type RetryOverride = Fetch.Plugin.Override<
	 *   Fetch.Plugin<"retry", never, never, { times: number }>
	 * >;
	 * //   ^? false | Partial<{ times: number }>
	 * ```
	 *
	 * @since 0.1.0
	 */
	export type Override<P extends Any> = [Options<P>] extends [undefined]
		? false
		: false | Partial<Options<P>>;

	/**
	 * The `plugins` option of a call: an override per plugin name in `Ps`.
	 * Unknown names are compile errors, including when the client has no
	 * plugins. Plugins whose `name` isn't a string literal can't be
	 * overridden (they'd make every name valid).
	 *
	 * @example
	 * ```ts
	 * import type * as Fetch from "@monarcode/effetch";
	 *
	 * type Overrides = Fetch.Plugin.Overrides<
	 *   [
	 *     Fetch.Plugin<"bearer">,
	 *     Fetch.Plugin<"retry", never, never, { times: number }>,
	 *   ]
	 * >;
	 *
	 * const overrides: Overrides = { bearer: false, retry: { times: 0 } };
	 * ```
	 *
	 * @since 0.1.0
	 */
	export type Overrides<Ps extends ReadonlyArray<Any>> = [
		keyof OverrideMap<Ps>,
	] extends [never]
		? { readonly [name: string]: never }
		: OverrideMap<Ps>;
}

/**
 * Defines a plugin. Returns its argument unchanged; it exists to infer
 * `Name`, the errors, the services and the options type from the hooks.
 *
 * The options type comes from `defaults` alone, so a hook can only read
 * `ctx.options` when `defaults` are given.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as HttpClientRequest from "effect/http/HttpClientRequest";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const userAgent = Fetch.plugin({
 *   name: "userAgent",
 *   defaults: { value: "my-app/1.0" },
 *   onRequest: (request, ctx) =>
 *     Effect.succeed(
 *       HttpClientRequest.setHeader(request, "user-agent", ctx.options.value),
 *     ),
 * });
 *
 * // Per call: api.get("/x", { plugins: { userAgent: { value: "other" } } })
 * ```
 *
 * @since 0.1.0
 */
export function plugin<
	const Name extends string,
	ERequest = never,
	EResponse = never,
	EWrap = never,
	RRequest = never,
	RResponse = never,
	RError = never,
	RWrap = never,
	Opts = undefined,
>(
	definition: Plugin.Definition<
		Name,
		ERequest,
		EResponse,
		EWrap,
		RRequest,
		RResponse,
		RError,
		RWrap,
		Opts
	>,
): Plugin<
	Name,
	Settled<ERequest | EResponse | Exclude<EWrap, Plugin.UpstreamError>>,
	Settled<
		RRequest | RResponse | RError | Exclude<RWrap, Plugin.UpstreamServices>
	>,
	Settled<Opts>
>;
export function plugin(definition: Plugin.Any): Plugin.Any {
	return definition;
}
