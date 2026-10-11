import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { describe, expect } from "vitest";

import { resolveTokenSource } from "../src/internal/resolve.js";

class TokenError extends Data.TaggedError("TokenError")<{}> {}
class AccessToken extends Context.Service<AccessToken, string>()(
	"AccessToken",
) {}

const request = HttpClientRequest.get("https://api.test/me");

const defectOf = <A, E>(self: Effect.Effect<A, E>) =>
	Effect.map(Effect.exit(self), (exit) => {
		expect(Exit.hasDies(exit)).toBe(true);
		return Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
	});

describe("resolveTokenSource", () => {
	it.effect("gives a string as it is", () =>
		Effect.gen(function* () {
			expect(yield* resolveTokenSource("token", request)).toBe("token");
		}),
	);

	it.effect("runs an Effect, with its error and services", () =>
		Effect.gen(function* () {
			const fromService = resolveTokenSource(
				Effect.service(AccessToken),
				request,
			);
			expect(
				yield* Effect.provideService(
					fromService,
					AccessToken,
					"from-service",
				),
			).toBe("from-service");
			const error = yield* Effect.flip(
				resolveTokenSource(Effect.fail(new TokenError()), request),
			);
			expect(error).toBeInstanceOf(TokenError);
		}),
	);

	it.effect("treats an Effect that is also a function as an Effect", () =>
		Effect.gen(function* () {
			const source = Effect.service(AccessToken);
			expect(typeof source).toBe("function");
			const token = yield* resolveTokenSource(source, request).pipe(
				Effect.provideService(AccessToken, "token"),
			);
			expect(token).toBe("token");
		}),
	);

	it.effect("calls a function with the request each time it runs", () =>
		Effect.gen(function* () {
			const seen: Array<HttpClientRequest.HttpClientRequest> = [];
			const resolved = resolveTokenSource((received) => {
				seen.push(received);
				return `token-${seen.length}`;
			}, request);
			expect(seen).toEqual([]);
			expect(yield* resolved).toBe("token-1");
			expect(yield* resolved).toBe("token-2");
			expect(seen).toEqual([request, request]);
		}),
	);

	it.effect("awaits a promise or any other thenable", () =>
		Effect.gen(function* () {
			expect(
				yield* resolveTokenSource(() => Promise.resolve("async"), request),
			).toBe("async");
			const thenable: PromiseLike<string> = {
				// oxlint-disable-next-line unicorn/no-thenable
				then: (onFulfilled) =>
					Promise.resolve(onFulfilled?.("thenable")) as never,
			};
			expect(yield* resolveTokenSource(() => thenable, request)).toBe(
				"thenable",
			);
		}),
	);

	it.effect.each([null, undefined, ""] as const)(
		"passes %j through",
		(value) =>
			Effect.gen(function* () {
				expect(yield* resolveTokenSource(() => value, request)).toBe(value);
			}),
	);

	it.effect("makes a function that throws a defect", () =>
		Effect.gen(function* () {
			const boom = new Error("boom");
			const defect = yield* defectOf(
				resolveTokenSource(() => {
					throw boom;
				}, request),
			);
			expect(defect).toBe(boom);
		}),
	);

	it.effect("makes a rejected promise a defect", () =>
		Effect.gen(function* () {
			const boom = new Error("boom");
			const defect = yield* defectOf(
				resolveTokenSource(() => Promise.reject(boom), request),
			);
			expect(defect).toBe(boom);
		}),
	);

	it.effect("stops waiting on a pending promise when interrupted", () =>
		Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(
				resolveTokenSource(() => new Promise<string>(() => {}), request),
			);
			yield* Effect.yieldNow;
			yield* Fiber.interrupt(fiber);
			expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
		}),
	);
});
