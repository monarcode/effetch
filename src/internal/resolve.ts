import * as Effect from "effect/Effect";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";

import type { TokenSource, TokenValue } from "../plugins/bearer.js";

const isThenable = (u: unknown): u is PromiseLike<TokenValue> =>
	typeof u === "object" &&
	u !== null &&
	typeof (u as { readonly then?: unknown }).then === "function";

/**
 * Resolves a bearer token source for `request`, in the calling fiber. The
 * forms are told apart in this order: a string, an Effect (which may also
 * be a function, like a `Context.Service` class), then a function.
 *
 * A function that throws or returns a rejected promise is a defect.
 * Interrupting the Effect stops waiting on a pending promise.
 */
export const resolveTokenSource = <E = never, R = never>(
	source: TokenSource<E, R>,
	request: HttpClientRequest.HttpClientRequest,
): Effect.Effect<TokenValue, E, R> => {
	if (typeof source === "string") {
		return Effect.succeed(source);
	}
	if (Effect.isEffect(source)) {
		return source as Effect.Effect<TokenValue, E, R>;
	}
	return Effect.suspend(() => {
		const value = source(request);
		return isThenable(value)
			? Effect.promise(() => value)
			: Effect.succeed(value);
	});
};
