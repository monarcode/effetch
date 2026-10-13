import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { resolveTokenSource } from "../internal/resolve.js";
import { type Plugin, plugin } from "../Plugin.js";

/**
 * `T` itself, once known. In {@link BearerPlugin} it stops TypeScript
 * inferring the token's error and services from where the plugin goes: in
 * a `plugins` list they would become `any`.
 */
type Settled<T> = [T] extends [infer U] ? U : never;

/**
 * What a token source gives: the token, or `null`, `undefined` or `""` to
 * send the request without an `Authorization` header.
 *
 * @example
 * ```ts
 * import type { TokenValue } from "@monarcode/effetch/plugins";
 *
 * const signedOut: TokenValue = undefined;
 * ```
 *
 * @since 0.1.0
 */
export type TokenValue = string | null | undefined;

/**
 * Where {@link bearer} gets the token, for every request:
 *
 * - a string, for a token that never changes;
 * - a function of the request, returning the token or a promise of it;
 * - an Effect, whose error and services become the plugin's (and so the
 *   client's).
 *
 * A function that throws, or whose promise rejects, makes the call die
 * (a defect), so the error type stays clean. To fail with a typed error,
 * pass an Effect.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import type { TokenSource } from "@monarcode/effetch/plugins";
 *
 * declare const store: { getState(): { accessToken?: string } };
 * declare const readToken: () => Promise<string | null>;
 *
 * const fixed: TokenSource = "dev-token";
 * const sync: TokenSource = () => store.getState().accessToken;
 * const async: TokenSource = () => readToken();
 * const fromEffect: TokenSource = Effect.succeed("token");
 * ```
 *
 * @since 0.1.0
 */
export type TokenSource<E = never, R = never> =
	| string
	| ((
			request: HttpClientRequest.HttpClientRequest,
	  ) => TokenValue | PromiseLike<TokenValue>)
	| Effect.Effect<TokenValue, E, R>;

/**
 * Options for {@link bearer}.
 *
 * - `token`: where the token comes from (see {@link TokenSource}). It's
 *   resolved for every request, inside that request's fiber, and never
 *   cached, so a refreshed or cleared token takes effect on the next
 *   request.
 * - `scheme`: the word before the token. Defaults to `"Bearer"`.
 *
 * @example
 * ```ts
 * import type { BearerOptions } from "@monarcode/effetch/plugins";
 *
 * const options: BearerOptions = { token: "dev-token", scheme: "Token" };
 * ```
 *
 * @since 0.1.0
 */
export interface BearerOptions<E = never, R = never> {
	/** Where the token comes from, resolved for every request. */
	readonly token: TokenSource<E, R>;
	/** The word before the token. Defaults to `"Bearer"`. */
	readonly scheme?: string | undefined;
}

/**
 * The plugin made by {@link bearer}: it fails with the token Effect's `E`
 * and needs its `R`. Calls can only skip it (`plugins: { bearer: false }`).
 *
 * @example
 * ```ts
 * import { bearer, type BearerPlugin } from "@monarcode/effetch/plugins";
 *
 * const auth: BearerPlugin = bearer({ token: "dev-token" });
 * ```
 *
 * @since 0.1.0
 */
export type BearerPlugin<E = never, R = never> = Plugin<
	"bearer",
	Settled<E>,
	Settled<R>
>;

/**
 * Sends `Authorization: <scheme> <token>` with every request.
 *
 * The header is left out when the token is `null`, `undefined` or `""`,
 * and a request that already has an `Authorization` header keeps it (the
 * token isn't resolved then).
 *
 * Put it last in the plugin list, so retries ask for the token again.
 *
 * @example
 * ```ts
 * import * as Context from "effect/Context";
 * import * as Effect from "effect/Effect";
 * import * as Fetch from "@monarcode/effetch";
 * import { bearer } from "@monarcode/effetch/plugins";
 *
 * declare const SecureStore: {
 *   getItemAsync(key: string): Promise<string | null>;
 * };
 *
 * class Session extends Context.Service<
 *   Session,
 *   { readonly accessToken: Effect.Effect<string | undefined> }
 * >()("Session") {}
 *
 * const fromStorage = bearer({
 *   token: () => SecureStore.getItemAsync("access_token"),
 * });
 *
 * const fromSession = bearer({
 *   token: Effect.gen(function* () {
 *     const session = yield* Session;
 *     return yield* session.accessToken;
 *   }),
 * });
 *
 * const makeApi = Fetch.make({
 *   baseUrl: "https://api.example.com",
 *   plugins: [fromSession],
 * });
 *
 * // Per call: api.post("/auth/login", { body, plugins: { bearer: false } })
 * ```
 *
 * @since 0.1.0
 */
export const bearer = <E = never, R = never>(
	options: BearerOptions<E, R>,
): BearerPlugin<E, R> => {
	const scheme = options.scheme ?? "Bearer";
	return plugin({
		name: "bearer",
		onRequest: (request) =>
			Headers.has(request.headers, "authorization")
				? Effect.succeed(request)
				: Effect.map(resolveTokenSource(options.token, request), (token) =>
						token === undefined || token === null || token === ""
							? request
							: HttpClientRequest.setHeader(
									request,
									"authorization",
									`${scheme} ${token}`,
								),
					),
	});
};
