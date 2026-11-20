import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Option from "effect/Option";

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
 * Where {@link bearer} gets a new token when the server answers `401`:
 *
 * - a function of the request that was refused, as it was sent, returning
 *   the new token or a promise of it;
 * - an Effect, whose error and services become the plugin's (and so the
 *   client's).
 *
 * It gives `null`, `undefined` or `""` when there's no new token, such as
 * when the session has ended. A function that throws, or whose promise
 * rejects, makes the call die (a defect). To fail with a typed error, pass
 * an Effect.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import type { RefreshSource } from "@monarcode/effetch/plugins";
 *
 * declare const refreshSession: () => Promise<string | null>;
 *
 * const fromPromise: RefreshSource = () => refreshSession();
 * const fromEffect: RefreshSource = Effect.succeed("new-token");
 * ```
 *
 * @since 0.1.0
 */
export type RefreshSource<E = never, R = never> = Exclude<
	TokenSource<E, R>,
	string
>;

/**
 * Options for {@link bearer}.
 *
 * - `token`: where the token comes from (see {@link TokenSource}). It's
 *   resolved for every request, inside that request's fiber, and never
 *   cached, so a refreshed or cleared token takes effect on the next
 *   request.
 * - `scheme`: the word before the token. Defaults to `"Bearer"`.
 * - `refresh`: where a new token comes from when the server answers `401`
 *   to a request that `bearer` sent a token with (see
 *   {@link RefreshSource}). The request is then sent once more, with the
 *   new token. Without `refresh`, a `401` is returned as it is.
 *
 * `E` and `R` are the `token` Effect's error and services, and `RE` and
 * `RR` the `refresh` Effect's.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import type { BearerOptions } from "@monarcode/effetch/plugins";
 *
 * const options: BearerOptions = { token: "dev-token", scheme: "Token" };
 *
 * const refreshing: BearerOptions = {
 *   token: () => localStorage.getItem("access_token"),
 *   refresh: Effect.succeed("new-token"),
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface BearerOptions<E = never, R = never, RE = never, RR = never> {
	/** Where the token comes from, resolved for every request. */
	readonly token: TokenSource<E, R>;
	/** The word before the token. Defaults to `"Bearer"`. */
	readonly scheme?: string | undefined;
	/** Where a new token comes from on a `401`. The request is then sent once more. */
	readonly refresh?: RefreshSource<RE, RR> | undefined;
}

/**
 * The plugin made by {@link bearer}: it fails with `E` and needs `R`, the
 * errors and services of the `token` and `refresh` Effects. Calls can only
 * skip it (`plugins: { bearer: false }`).
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

/** Whether the current fiber is running a `refresh`. */
const Refreshing = Context.Reference<boolean>(
	"@monarcode/effetch/plugins/bearer/Refreshing",
	{ defaultValue: () => false },
);

/** How many finished refreshes {@link bearer} remembers. */
const maxRecent = 32;

/**
 * Sends `Authorization: <scheme> <token>` with every request.
 *
 * The header is left out when the token is `null`, `undefined` or `""`,
 * and a request that already has an `Authorization` header keeps it (the
 * token isn't resolved then).
 *
 * Put it last in the plugin list, so retries ask for the token again.
 *
 * **Refreshing on `401`.** With a `refresh` option, a `401` to a request
 * that `bearer` sent a token with gets a new token from `refresh`, and the
 * request is **sent once more** with it:
 *
 * - Requests refused with the same token, and sent before its refresh
 *   ended, share that refresh: `refresh` runs once for all of them, and
 *   they all get its token, or its error. Requests refused with different
 *   tokens, such as other users' on a server, get their own refresh.
 * - The shared refresh runs in its own fiber: a caller that times out or
 *   is interrupted stops waiting, but doesn't cancel it for the others.
 * - `refresh` gets the refused request, as it was sent, with its
 *   `Authorization` header.
 * - A request is sent again at most once. If it gets a `401` again, or
 *   `refresh` gives no token, the call fails with the usual `HttpError`.
 * - A request that came with its own `Authorization` header, that was
 *   sent without a token, or whose body is a stream, which can't be sent
 *   twice, isn't refreshed.
 * - Calls that `refresh` makes skip refreshing. A `refresh` function that
 *   runs the client itself (with `Effect.runPromise`) must pass
 *   `plugins: { bearer: false }`: otherwise, a `401` to it waits for the
 *   refresh it's part of, and never ends.
 * - `refresh` doesn't store the new token for later requests: `token`
 *   still provides it. Have `refresh` save the token where `token` reads
 *   it.
 * - A `POST` that got a `401` is sent again too, since the server refused
 *   it before acting on it.
 *
 * @example
 * ```ts
 * import * as Context from "effect/Context";
 * import * as Effect from "effect/Effect";
 * import { Fetch } from "@monarcode/effetch";
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
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 *   plugins: [fromSession],
 * }) {}
 *
 * // Per call: api.post("/auth/login", { body, plugins: { bearer: false } })
 *
 * // Renew the token on a 401, then send the request again.
 * declare const renewSession: () => Promise<string | null>;
 * const refreshing = bearer({
 *   token: () => SecureStore.getItemAsync("access_token"),
 *   refresh: () => renewSession(),
 * });
 * ```
 *
 * @since 0.1.0
 */
export const bearer = <E = never, R = never, RE = never, RR = never>(
	options: BearerOptions<E, R, RE, RR>,
): BearerPlugin<E | RE, R | RR> => {
	const scheme = options.scheme ?? "Bearer";
	const withToken = (
		request: HttpClientRequest.HttpClientRequest,
		token: TokenValue,
	) =>
		token === undefined || token === null || token === ""
			? request
			: HttpClientRequest.setHeader(
					request,
					"authorization",
					`${scheme} ${token}`,
				);
	const onRequest = (request: HttpClientRequest.HttpClientRequest) =>
		Headers.has(request.headers, "authorization")
			? Effect.succeed(request)
			: Effect.map(resolveTokenSource(options.token, request), (token) =>
					withToken(request, token),
				);
	const refresh = options.refresh;
	if (refresh === undefined) {
		return plugin({ name: "bearer", onRequest });
	}
	// Single flight, per refused token: requests refused with the same token
	// share one refresh, while requests refused with different tokens (other
	// users, other hosts) get their own. The refresh runs in a detached
	// fiber, so one caller's timeout or interruption doesn't cancel it for
	// the others.
	type Shared = Deferred.Deferred<TokenValue, RE>;
	const inFlight = new Map<string, Shared>();
	// How each recent refresh ended, by the token it replaced, and the
	// refresh count when it ended. Only requests sent before then share it:
	// a later request refused with the same token needs a new refresh.
	const recent = new Map<
		string,
		{ readonly exit: Exit.Exit<TokenValue, RE>; readonly at: number }
	>();
	let refreshed = 0;
	const remember = (refused: string, exit: Exit.Exit<TokenValue, RE>) => {
		refreshed += 1;
		recent.delete(refused);
		recent.set(refused, { exit, at: refreshed });
		if (recent.size > maxRecent) {
			const oldest = recent.keys().next();
			if (oldest.done !== true) {
				recent.delete(oldest.value);
			}
		}
	};
	const newToken = (
		refused: string,
		sentAt: number,
		request: HttpClientRequest.HttpClientRequest,
	): Effect.Effect<TokenValue, RE, RR> =>
		// Uninterruptible from registering the refresh to forking it, so an
		// entry in `inFlight` always has a refresh that completes it. Only the
		// wait can be interrupted. The forked fiber is interruptible: it
		// doesn't inherit the mask.
		Effect.uninterruptibleMask((restore) =>
			Effect.suspend(() => {
				const known = recent.get(refused);
				if (known !== undefined && sentAt < known.at) {
					return known.exit;
				}
				const running = inFlight.get(refused);
				if (running !== undefined) {
					return restore(Deferred.await(running));
				}
				const shared: Shared = Deferred.makeUnsafe();
				inFlight.set(refused, shared);
				const run = resolveTokenSource(refresh, request).pipe(
					Effect.provideService(Refreshing, true),
					Effect.exit,
					Effect.flatMap((exit) => {
						inFlight.delete(refused);
						remember(refused, exit);
						return Deferred.done(shared, exit);
					}),
				);
				return Effect.andThen(
					Effect.forkDetach(run),
					restore(Deferred.await(shared)),
				);
			}),
		);
	return plugin({
		name: "bearer",
		onRequest,
		wrap: (client) =>
			HttpClient.transform(client, (response, request) =>
				Effect.gen(function* () {
					const sentAt = refreshed;
					const received = yield* response;
					if (received.status !== 401) {
						return received;
					}
					const refused = Option.getOrUndefined(
						Headers.get(received.request.headers, "authorization"),
					);
					// Not refreshed: a request with its own header, one sent
					// without a token, a body that can't be sent twice, and
					// calls made by `refresh` itself, which would wait on it.
					if (
						refused === undefined ||
						Headers.has(request.headers, "authorization") ||
						request.body._tag === "Stream" ||
						(yield* Refreshing)
					) {
						return received;
					}
					const token = yield* newToken(refused, sentAt, received.request);
					if (token === undefined || token === null || token === "") {
						return received;
					}
					return yield* client.execute(withToken(request, token));
				}),
			),
	});
};
