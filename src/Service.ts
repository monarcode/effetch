import * as Context from "effect/Context";
import * as Headers from "effect/http/Headers";
import type * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";

import { type Client, type ClientConfig, make } from "./Client.js";
import { freezeStatusErrors } from "./internal/statusErrors.js";
import type { AnySchema, StatusErrorMap } from "./Options.js";
import type { Plugin } from "./Plugin.js";

/** Marks a class made by {@link Service}, so {@link isService} can tell. */
const TypeId = "~@monarcode/effetch/Service";

/**
 * A client as a service class: what {@link Service} returns, to extend.
 *
 * The class is a `Context.Service` key whose service is the
 * {@link Client} that {@link make} builds from its config. It also carries:
 *
 * - `layer`: the layer that builds that client.
 * - `config`: the config it was declared with, readable without building
 *   anything.
 *
 * `Ps`, `EB`, `BaseE`, `BaseR` and `SE` are {@link ClientConfig}'s type
 * parameters, inferred from the config.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const ApiError = Schema.Struct({ code: Schema.String });
 *
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 *   defaultError: ApiError,
 * }) {}
 *
 * const service: Fetch.ServiceClass<Api, "Api", [], typeof ApiError> = Api;
 * ```
 *
 * @since 0.1.0
 */
export interface ServiceClass<
	Self,
	Id extends string,
	Ps extends ReadonlyArray<Plugin.Any> = [],
	EB extends AnySchema = Schema.Unknown,
	BaseE = never,
	BaseR = never,
	SE extends StatusErrorMap | undefined = undefined,
> extends Context.ServiceClass<Self, Id, Client<Ps, EB, SE>> {
	/**
	 * The config the class was declared with, frozen. The object, its
	 * `statusErrors` (and each list in them), its `plugins` list and its
	 * `headers` are copies made when the class was declared, so changing
	 * what was passed in later changes nothing. The layer builds the client
	 * from this same copy. `headers` is an Effect `Headers` value, read the
	 * way `make` reads them: names in lowercase, a list joined with `, `, and
	 * sensitive values such as `authorization` redacted when logged.
	 */
	readonly config: ClientConfig<Ps, EB, BaseE, BaseR, SE>;
	/**
	 * Builds the client with {@link make} and provides it as this service.
	 * It needs what `make` needs: an `HttpClient`, whatever the `baseUrl`
	 * Effect needs and the plugins' services. It fails with the `baseUrl`
	 * Effect's error. A subclass may override it with a layer that needs
	 * less (such as `super.layer` with its `HttpClient` provided), but not
	 * one that needs more or fails with more.
	 */
	readonly layer: Layer.Layer<
		Self,
		BaseE,
		HttpClient.HttpClient | BaseR | Plugin.Services<Ps>
	>;
}

/**
 * Helper types for {@link ServiceClass}.
 *
 * @example
 * ```ts
 * import * as Fetch from "@monarcode/effetch";
 *
 * const describe = (service: Fetch.ServiceClass.Any): string => service.key;
 * ```
 *
 * @since 0.1.0
 */
export declare namespace ServiceClass {
	/**
	 * Any class made by {@link Service}, whatever its config. What
	 * {@link isService} narrows to.
	 *
	 * @example
	 * ```ts
	 * import * as Fetch from "@monarcode/effetch";
	 *
	 * class Api extends Fetch.Service<Api>()("Api") {}
	 *
	 * const services: ReadonlyArray<Fetch.ServiceClass.Any> = [Api];
	 * ```
	 *
	 * @since 0.1.0
	 */
	// `any`, not `unknown`: `Context.ServiceClass` is invariant in its type
	// parameters, so only `any` accepts every class.
	// oxlint-disable-next-line no-explicit-any
	export type Any = ServiceClass<any, string, any, any, any, any, any>;
}

/**
 * A frozen copy of `config`, down to its `statusErrors`, `plugins` and
 * `headers`.
 */
const snapshot = <
	Ps extends ReadonlyArray<Plugin.Any>,
	EB extends AnySchema,
	BaseE,
	BaseR,
	SE extends StatusErrorMap | undefined,
>(
	config: ClientConfig<Ps, EB, BaseE, BaseR, SE>,
): ClientConfig<Ps, EB, BaseE, BaseR, SE> => {
	const copy: { -readonly [K in keyof typeof config]: (typeof config)[K] } = {
		...config,
	};
	if (config.statusErrors !== undefined) {
		copy.statusErrors = freezeStatusErrors(config.statusErrors);
	}
	if (config.plugins !== undefined) {
		// A frozen copy of the same tuple.
		copy.plugins = Object.freeze([...config.plugins]) as unknown as Ps;
	}
	if (config.headers !== undefined) {
		// As `make` reads them: an Effect `Headers` value, which keeps
		// sensitive values redacted when the config is logged.
		copy.headers = Object.freeze(Headers.fromInput(config.headers));
	}
	return Object.freeze(copy);
};

/**
 * Declares a client as a service class: one class that is the client's
 * service key, its layer and its config.
 *
 * `Fetch.Service<Self>()(id, config)` takes the {@link ClientConfig} that
 * {@link make} takes and returns a class to extend, the way
 * `Context.Service<Self, Shape>()(id)` does. The class:
 *
 * - is a `Context.Service` key: `yield* Api` gives the {@link Client}, typed
 *   from the config;
 * - has `Api.layer`, which builds that client with `make`. It needs an
 *   `HttpClient`, whatever the `baseUrl` Effect needs and the plugins'
 *   services, and fails with the `baseUrl` Effect's error;
 * - has `Api.config`, the config as given, frozen, readable when the module
 *   loads, before any layer is built.
 *
 * It replaces writing `make`, `Context.Service` and `Layer.effect` by hand.
 * The config has to be known when the module loads: a `baseUrl` Effect
 * (such as a `Config`) works, since it only runs when the layer is built.
 * A config that is itself the result of an Effect, or one made per request,
 * needs `make` and a hand-written service.
 *
 * `Api.layer` is one value, and Effect shares a layer by value: wherever it
 * appears in one layer graph, it's built once, and every layer that
 * depends on it gets the same client. Each `Effect.provide` of a graph
 * builds it again, so provide it once, where the program runs.
 *
 * The `id` is the service's identity at run time, as with
 * `Context.Service`: two classes with the same `id` are the same service,
 * and a layer built for one serves the other. Give each client its own
 * `id`.
 *
 * To make `Api.layer` provide its `HttpClient` too, override it in the
 * class with `super.layer` (see the second example). The override can need
 * less than `Api.layer`, but not more, and can't add an error: to add
 * requirements, build a separate layer from `Api.layer` instead.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Layer from "effect/Layer";
 * import * as Schema from "effect/Schema";
 * import * as FetchHttpClient from "effect/http/FetchHttpClient";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const ApiError = Schema.Struct({ code: Schema.String });
 * class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 *
 * export class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 *   defaultError: ApiError,
 *   statusErrors: { 404: NotFound },
 * }) {}
 *
 * // The service: yield it for the client.
 * const program = Effect.gen(function* () {
 *   const api = yield* Api;
 *   return yield* api.get("/todos", { output: Schema.Array(Todo) });
 * });
 *
 * // Its layer.
 * const ApiLive = Api.layer.pipe(Layer.provide(FetchHttpClient.layer));
 *
 * // Its config, readable without building anything.
 * const notFound = Api.config.statusErrors?.[404];
 *
 * const main = program.pipe(Effect.provide(ApiLive));
 * ```
 *
 * @example
 * ```ts
 * import * as Layer from "effect/Layer";
 * import * as FetchHttpClient from "effect/http/FetchHttpClient";
 * import * as Fetch from "@monarcode/effetch";
 *
 * // A layer that needs nothing: override `layer` in the class.
 * export class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 * }) {
 *   static override readonly layer = super.layer.pipe(
 *     Layer.provide(FetchHttpClient.layer),
 *   );
 * }
 *
 * const ApiLive: Layer.Layer<Api> = Api.layer;
 * ```
 *
 * @since 0.1.0
 */
export const Service =
	<Self>() =>
	<
		const Id extends string,
		const Ps extends ReadonlyArray<Plugin.Any> = [],
		EB extends AnySchema = Schema.Unknown,
		BaseE = never,
		BaseR = never,
		SE extends StatusErrorMap | undefined = undefined,
	>(
		id: Id,
		config: ClientConfig<Ps, EB, BaseE, BaseR, SE> = {},
	): ServiceClass<Self, Id, Ps, EB, BaseE, BaseR, SE> => {
		const key = Context.Service<Self, Client<Ps, EB, SE>>()(id);
		const frozen = snapshot(config);
		// Plain, writable properties: a subclass may replace `layer`, and
		// compilers without define semantics do that by assignment.
		return Object.assign(key, {
			[TypeId]: TypeId,
			config: frozen,
			layer: Layer.effect(key)(make(frozen)),
		});
	};

/**
 * Returns `true` if `u` is a class made by {@link Service}, or a class that
 * extends one. `false` for anything else, including a key made with
 * `Context.Service` and a {@link Client}.
 *
 * @example
 * ```ts
 * import * as Context from "effect/Context";
 * import * as Fetch from "@monarcode/effetch";
 *
 * class Api extends Fetch.Service<Api>()("Api") {}
 * class Other extends Context.Service<Other, string>()("Other") {}
 *
 * Fetch.isService(Api); // true
 * Fetch.isService(Other); // false
 * ```
 *
 * @since 0.1.0
 */
export const isService = (u: unknown): u is ServiceClass.Any =>
	typeof u === "function" &&
	// `in`, not an own-property check: a subclass inherits the mark.
	TypeId in u &&
	(u as { readonly [TypeId]?: unknown })[TypeId] === TypeId;
