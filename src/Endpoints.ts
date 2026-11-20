import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";

import type { Client } from "./Client.js";
import type { BoundEndpoints, EndpointDefinitions } from "./Endpoint.js";
import { snapshotDefinitions } from "./internal/endpoint.js";
import type { AnySchema, StatusErrorMap } from "./Options.js";
import type { Plugin } from "./Plugin.js";

/**
 * A service class whose service is a record of endpoints: what
 * {@link Endpoints} returns, to extend.
 *
 * The class is a `Context.Service` key. Its service is the record of
 * endpoints that `client.bindAll(definitions)` makes, so `yield* TodoApi`
 * gives `{ list, get, … }`, each typed as `client.bind` types it. It also
 * carries:
 *
 * - `layer`: the layer that binds the definitions to the client. It needs
 *   the client's service, `I`.
 * - `definitions`: the record it was declared with, readable without
 *   building anything.
 *
 * `Ps`, `EB` and `SE` are the client's plugins, `defaultError` schema and
 * `statusErrors` map, as in {@link Client}.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
 *
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 * }) {}
 *
 * class TodoApi extends Fetch.Endpoints<TodoApi>()("TodoApi", Api, {
 *   get: getTodo,
 * }) {}
 *
 * const service: Fetch.EndpointsClass<
 *   TodoApi,
 *   "TodoApi",
 *   Api,
 *   { readonly get: typeof getTodo },
 *   [],
 *   Schema.Unknown
 * > = TodoApi;
 * ```
 *
 * @since 0.1.0
 */
export interface EndpointsClass<
	Self,
	Id extends string,
	I,
	D,
	Ps extends ReadonlyArray<Plugin.Any> = [],
	EB extends AnySchema = Schema.Unknown,
	SE extends StatusErrorMap | undefined = undefined,
> extends Context.ServiceClass<Self, Id, BoundEndpoints<D, Ps, EB, SE>> {
	/**
	 * The definitions the class was declared with, frozen: a copy of the
	 * record, and of each `[definition, options]` pair and its options,
	 * down to its `plugins` overrides. A pair's `headers` are an Effect
	 * `Headers` value, so sensitive values stay redacted when logged. The
	 * definitions themselves are already frozen by `Fetch.endpoint`.
	 */
	readonly definitions: D;
	/**
	 * Binds the definitions to the client with `client.bindAll`, once, when
	 * the layer is built, and provides the endpoints as this service. It
	 * needs the client's service and never fails.
	 */
	readonly layer: Layer.Layer<Self, never, I>;
}

/**
 * Declares a module's endpoints as a service class: one class that is the
 * service key, its layer and its definitions.
 *
 * `Fetch.Endpoints<Self>()(id, client, definitions)` takes:
 *
 * - `id`: the service's id, as `Context.Service` takes it.
 * - `client`: the key of a client service, such as a class made with
 *   `Fetch.Service`, or one written by hand with `Context.Service`.
 * - `definitions`: a record of definitions made with `Fetch.endpoint`, by
 *   the name each endpoint gets. An entry can also be a
 *   `[definition, options]` pair, where `options` are the
 *   options (`BindOptions`) `client.bind` takes, such as plugin overrides.
 *
 * The class:
 *
 * - is a `Context.Service` key: `yield* TodoApi` gives the endpoints, each
 *   typed as `client.bind` types it, with the client's plugins,
 *   `defaultError` and `statusErrors`;
 * - has `TodoApi.layer`, which binds the definitions to the client once,
 *   when it's built. It needs the client's service;
 * - has `TodoApi.definitions`, the record as given, frozen, readable when
 *   the module loads.
 *
 * It replaces writing `client.useSync`, `Context.Service` and
 * `Layer.effect` by hand around a module's bindings.
 *
 * Each entry is checked when the class is declared: one that isn't a
 * definition throws then, as a malformed route does in `Fetch.endpoint`.
 *
 * The `id` is the service's identity at run time, as with
 * `Context.Service`: give each service its own.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Layer from "effect/Layer";
 * import * as Schema from "effect/Schema";
 * import * as FetchHttpClient from "effect/http/FetchHttpClient";
 * import { Fetch } from "@monarcode/effetch";
 * import { bearer } from "@monarcode/effetch/plugins";
 *
 * // infrastructure: the client
 * export class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 *   plugins: [bearer({ token: "token" })],
 * }) {}
 *
 * // contract: definitions, next to their schemas
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const Session = Schema.Struct({ token: Schema.String });
 * const listTodos = Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) });
 * const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
 * const refresh = Fetch.endpoint("POST /auth/refresh", { output: Session });
 *
 * // data: the module's endpoints, as a service
 * export class TodoApi extends Fetch.Endpoints<TodoApi>()("TodoApi", Api, {
 *   list: listTodos,
 *   get: getTodo,
 *   refresh: [refresh, { plugins: { bearer: false } }],
 * }) {}
 *
 * // anywhere
 * const program = Effect.gen(function* () {
 *   const todos = yield* TodoApi;
 *   return yield* todos.get({ params: { id: 1 } });
 * });
 *
 * // where it runs
 * const AppLayer = TodoApi.layer.pipe(
 *   Layer.provideMerge(Api.layer),
 *   Layer.provide(FetchHttpClient.layer),
 * );
 * const main = program.pipe(Effect.provide(AppLayer));
 * ```
 *
 * @since 0.1.0
 */
export const Endpoints =
	<Self>() =>
	<
		const Id extends string,
		I,
		Ps extends ReadonlyArray<Plugin.Any>,
		EB extends AnySchema,
		SE extends StatusErrorMap | undefined,
		const D,
	>(
		id: Id,
		client: Context.Key<I, Client<Ps, EB, SE>>,
		definitions: EndpointDefinitions<D, Ps>,
	): EndpointsClass<Self, Id, I, D, Ps, EB, SE> => {
		const key = Context.Service<Self, BoundEndpoints<D, Ps, EB, SE>>()(id);
		// Checked now, so a bad entry fails when the module loads.
		const frozen = snapshotDefinitions(definitions) as D;
		const make = Effect.map(client, (api) =>
			api.bindAll(frozen as EndpointDefinitions<D, Ps>),
		);
		// Plain, writable properties: a subclass may replace `layer`, and
		// compilers without define semantics do that by assignment.
		return Object.assign(key, {
			definitions: frozen,
			layer: Layer.effect(key)(make),
		});
	};
