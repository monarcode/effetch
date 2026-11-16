import * as Effect from "effect/Effect";
import type * as Headers from "effect/http/Headers";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import type { EndpointBody, EndpointQuery, RoutePath } from "./Endpoint.js";
import type {
	AnySchema,
	ParamsOption,
	QuerySchema,
	ResponseMode,
} from "./Options.js";

/**
 * An endpoint {@link paginate} can page through: one made by
 * `client.endpoint` or `client.bind`, whose calls return an `Effect`. A
 * definition made by `Fetch.endpoint` needs binding first, and a stream
 * endpoint can't be paged.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite });
 *
 * const pageable = (api: Fetch.Client): Fetch.PageEndpoint =>
 *   api.endpoint("GET /todos", { output: Schema.Array(Todo) });
 * ```
 *
 * @since 0.1.0
 */
export interface PageEndpoint {
	/** Sends one call. */
	(...args: never): Effect.Effect<unknown, unknown, unknown>;
	/** The route, such as `"GET /todos"`. */
	readonly route: string;
	/** The schema each page is decoded with, or `undefined`. */
	readonly output: AnySchema | undefined;
	/** The schema of each call's body, or `undefined`. */
	readonly input: AnySchema | undefined;
	/** The schema of each call's query, or `undefined`. */
	readonly query: QuerySchema | undefined;
	/** `"decoded-and-response"` gives `next` each page's response. */
	readonly responseMode: ResponseMode | undefined;
	/** `undefined`: calls return an `Effect`, not a stream. */
	readonly stream: undefined;
}

/**
 * The options of one page's call, as {@link PaginateOptions}' `request`
 * returns them for endpoint `EP`: `params`, `body`, `query` and `headers`,
 * typed as for any call of the endpoint.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * declare const listTodos: Fetch.Endpoint<"GET /orgs/:org/todos", undefined, Schema.Unknown, undefined, []>;
 *
 * const request: Fetch.PageRequest<typeof listTodos> = {
 *   params: { org: "acme" },
 *   query: { page: 2 },
 * };
 * ```
 *
 * @since 0.1.0
 */
export type PageRequest<EP extends PageEndpoint> = EP extends {
	readonly route: infer R extends string;
}
	? ParamsOption<RoutePath<R>> &
			EndpointBody<R, EP["input"]> &
			EndpointQuery<EP["query"]> & {
				/** Headers for this page's call. */
				readonly headers?: Headers.Input | undefined;
				/**
				 * Not allowed: the endpoint's `responseMode` decides what each
				 * page is.
				 */
				readonly responseMode?: undefined;
			}
	: never;

/**
 * One page of endpoint `EP`: its `output`'s type, or the raw response
 * without `output`. It's what {@link paginate}'s stream gives, and what
 * {@link PaginateOptions}' `next` gets.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const Todos = Schema.Array(Schema.Struct({ id: Schema.Finite }));
 * declare const listTodos: Fetch.Endpoint<"GET /todos", typeof Todos, Schema.Unknown, undefined, []>;
 *
 * type Page = Fetch.PageOf<typeof listTodos>;
 * //   ^? ReadonlyArray<{ readonly id: number }>
 * ```
 *
 * @since 0.1.0
 */
export type PageOf<EP extends PageEndpoint> = [EP["output"]] extends [AnySchema]
	? EP["output"]["Type"]
	: HttpClientResponse.HttpClientResponse;

/**
 * What `next` gets as the response of a page of endpoint `EP`: the
 * response when the endpoint's `responseMode` is
 * `"decoded-and-response"`, for cursors in headers, and `undefined`
 * otherwise.
 *
 * @example
 * ```ts
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * declare const listTodos: Fetch.Endpoint<
 *   "GET /todos", undefined, Schema.Unknown, undefined, [], undefined, "decoded-and-response"
 * >;
 *
 * type Response = Fetch.PageResponse<typeof listTodos>;
 * //   ^? HttpClientResponse
 * ```
 *
 * @since 0.1.0
 */
export type PageResponse<EP extends PageEndpoint> = [
	EP["responseMode"],
] extends ["decoded-and-response"]
	? HttpClientResponse.HttpClientResponse
	: undefined;

/**
 * How {@link paginate} goes from page to page, with a state `S`, such as a
 * page number or a cursor.
 *
 * - `start`: the state of the first page.
 * - `request(state)`: the options of the call for that page.
 * - `next(page, state, response)`: the state of the next page, or
 *   `Option.none()` when this is the last one. `response` is the page's
 *   response when the endpoint's `responseMode` is
 *   `"decoded-and-response"` (see {@link PageResponse}).
 *
 * @example
 * ```ts
 * import * as Option from "effect/Option";
 * import * as Schema from "effect/Schema";
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const Todos = Schema.Array(Schema.Struct({ id: Schema.Finite }));
 * declare const listTodos: Fetch.Endpoint<"GET /todos", typeof Todos, Schema.Unknown, undefined, []>;
 *
 * const byPage: Fetch.PaginateOptions<typeof listTodos, number> = {
 *   start: 1,
 *   request: (page) => ({ query: { page } }),
 *   next: (todos, page) => (todos.length === 0 ? Option.none() : Option.some(page + 1)),
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface PaginateOptions<EP extends PageEndpoint, S> {
	/** The state of the first page. */
	readonly start: S;
	/** The options of the call for the page with this state. */
	readonly request: (state: S) => PageRequest<EP>;
	/** The state of the next page, or `Option.none()` after the last one. */
	readonly next: (
		page: PageOf<EP>,
		state: S,
		response: PageResponse<EP>,
	) => Option.Option<S>;
}

/** The error of endpoint `EP`'s calls. */
type ErrorOf<EP> = EP extends (
	...args: never
) => Effect.Effect<unknown, infer E, unknown>
	? E
	: never;

/** The services endpoint `EP`'s calls need. */
type ServicesOf<EP> = EP extends (
	...args: never
) => Effect.Effect<unknown, unknown, infer R>
	? R
	: never;

/**
 * Pages through a list, as a `Stream` of pages: it calls `endpoint` (a
 * {@link PageEndpoint}) for the first page, then for the next one while
 * `next` gives a state, and stops after the page for which it gives
 * `Option.none()`. See {@link PaginateOptions} for `start`, `request` and
 * `next`. Each page is
 * one value of the stream, so a page that is a list stays a list:
 * `Stream.flattenIterable` gives its items instead.
 *
 * The stream is lazy: it sends a page's call only when the page is
 * pulled, so `Stream.take(1)` sends one. A call that fails fails the
 * stream with the call's error.
 *
 * For cursors in headers, such as a `Link` header, define the endpoint
 * with `responseMode: "decoded-and-response"`, and `next` gets each
 * page's response.
 *
 * Throws when `endpoint` isn't a bound endpoint (bind a definition made
 * by `Fetch.endpoint` first), or is a stream endpoint.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import * as Schema from "effect/Schema";
 * import * as Stream from "effect/Stream";
 * import * as Fetch from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 * const listTodos = Fetch.endpoint("GET /todos", {
 *   query: Schema.Struct({ page: Schema.Finite }),
 *   output: Schema.Array(Todo),
 * });
 *
 * const allTodos = (api: Fetch.Client) =>
 *   Fetch.paginate(api.bind(listTodos), {
 *     start: 1,
 *     request: (page) => ({ query: { page } }),
 *     next: (todos, page) => (todos.length === 0 ? Option.none() : Option.some(page + 1)),
 *   }).pipe(Stream.flattenIterable, Stream.runCollect);
 *
 * export const count = (api: Fetch.Client) =>
 *   Effect.map(allTodos(api), (todos) => todos.length);
 * ```
 *
 * @since 0.1.0
 */
export const paginate = <const EP extends PageEndpoint, S>(
	endpoint: EP,
	options: PaginateOptions<EP, S>,
): Stream.Stream<PageOf<EP>, ErrorOf<EP>, ServicesOf<EP>> => {
	if (
		typeof endpoint !== "function" ||
		typeof (endpoint as { readonly route?: unknown }).route !== "string"
	) {
		throw new TypeError(
			"Fetch.paginate takes a bound endpoint: pass what client.endpoint or client.bind returns",
		);
	}
	if ((endpoint as { readonly stream?: unknown }).stream !== undefined) {
		throw new TypeError(
			`Fetch.paginate can't page through ${endpoint.route}, whose calls return a stream`,
		);
	}
	const call = endpoint as unknown as (
		options: unknown,
	) => Effect.Effect<unknown, unknown, unknown>;
	const both = endpoint.responseMode === "decoded-and-response";
	return Stream.paginate(options.start, (state: S) =>
		Effect.map(
			// The endpoint's mode, even if `request` gives another.
			Effect.suspend(() =>
				call({ ...options.request(state), responseMode: undefined }),
			),
			(result) => {
				const [page, response] = both
					? (result as readonly [unknown, unknown])
					: [result, undefined];
				return [
					[page],
					options.next(
						page as PageOf<EP>,
						state,
						response as PageResponse<EP>,
					),
				] as const;
			},
		),
	) as Stream.Stream<PageOf<EP>, ErrorOf<EP>, ServicesOf<EP>>;
};
