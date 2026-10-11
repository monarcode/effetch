import { it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";

import { describe, expect } from "vitest";

import { bearer, type TokenSource } from "../../src/plugins/index.js";
import { base, setup, wire } from "../utils/client.js";
import { reply } from "../utils/reply.js";

class TokenError extends Data.TaggedError("TokenError")<{}> {}
class AccessToken extends Context.Service<AccessToken, string>()(
	"AccessToken",
) {}

const withToken = <E = never, R = never>(
	token: TokenSource<E, R>,
	scheme?: string,
) =>
	setup([reply.json({})], {
		plugins: [bearer(scheme === undefined ? { token } : { token, scheme })],
	});

describe("bearer", () => {
	it.effect.each([
		["a string", "token" as TokenSource],
		["a function", () => "token"],
		["an async function", () => Promise.resolve("token")],
		["an Effect", Effect.succeed("token")],
	] as const)("sends the token from %s", ([, token]) =>
		Effect.gen(function* () {
			const { mock, api } = yield* withToken(token);
			yield* api.get("/me");
			expect(wire(mock).headers.authorization).toBe("Bearer token");
		}),
	);

	it.effect.each([null, undefined, ""] as const)(
		"sends no header when the token is %j",
		(token) =>
			Effect.gen(function* () {
				const { mock, api } = yield* withToken(() => token);
				yield* api.get("/me");
				expect(wire(mock).headers.authorization).toBeUndefined();
			}),
	);

	it.effect("uses the scheme", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* withToken("token", "Token");
			yield* api.get("/me");
			expect(wire(mock).headers.authorization).toBe("Token token");
		}),
	);

	it.effect("gives a function the request, with its full URL", () =>
		Effect.gen(function* () {
			const urls: Array<string> = [];
			const { api } = yield* withToken((request) => {
				urls.push(request.url);
				return request.url.includes("/public/") ? undefined : "token";
			});
			yield* api.get("/public/status");
			yield* api.get("/me");
			expect(urls).toEqual([`${base}/public/status`, `${base}/me`]);
		}),
	);

	it.effect("reads the token again for every request", () =>
		Effect.gen(function* () {
			let current = "first";
			const { mock, api } = yield* withToken(async () => current);
			yield* api.get("/me");
			current = "second";
			yield* api.get("/me");
			expect(wire(mock, 0).headers.authorization).toBe("Bearer first");
			expect(wire(mock, 1).headers.authorization).toBe("Bearer second");
		}),
	);

	it.effect(
		"keeps an Authorization header from the call or the client, without resolving the token",
		() =>
			Effect.gen(function* () {
				let calls = 0;
				const token = () => {
					calls += 1;
					return "token";
				};
				const { mock, api } = yield* setup([reply.json({})], {
					headers: { Authorization: "Basic client" },
					plugins: [bearer({ token })],
				});
				yield* api.get("/me");
				yield* api.get("/me", { headers: { authorization: "Basic call" } });
				expect(wire(mock, 0).headers.authorization).toBe("Basic client");
				expect(wire(mock, 1).headers.authorization).toBe("Basic call");
				expect(calls).toBe(0);
			}),
	);

	it.effect.each([
		[
			"a function throws",
			(): string => {
				throw new Error("no token");
			},
		],
		[
			"a promise rejects",
			(): Promise<string> => Promise.reject(new Error("no token")),
		],
	] as const)("makes the call die, sending nothing, when %s", ([, token]) =>
		Effect.gen(function* () {
			const { mock, api } = yield* withToken(token);
			const exit = yield* Effect.exit(api.get("/me"));
			expect(Exit.hasDies(exit)).toBe(true);
			expect(Exit.hasFails(exit)).toBe(false);
			expect(mock.requests).toHaveLength(0);
		}),
	);

	it.effect("fails the call with the Effect's typed error", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* withToken(Effect.fail(new TokenError()));
			const error = yield* Effect.flip(api.get("/me"));
			expect(error).toBeInstanceOf(TokenError);
			expect(mock.requests).toHaveLength(0);
		}),
	);

	it.effect("takes the Effect's services from make", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* withToken(
				Effect.service(AccessToken),
			).pipe(Effect.provideService(AccessToken, "from-make"));
			yield* api.get("/me");
			expect(wire(mock).headers.authorization).toBe("Bearer from-make");
		}),
	);

	it.effect(
		"never sends the request when interrupted while the token is pending",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* withToken(
					() => new Promise<string>(() => {}),
				);
				const fiber = yield* Effect.forkChild(api.get("/me"));
				yield* Effect.yieldNow;
				yield* Fiber.interrupt(fiber);
				expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
				expect(mock.requests).toHaveLength(0);
			}),
	);

	it.effect("can be skipped per call, without resolving the token", () =>
		Effect.gen(function* () {
			let calls = 0;
			const { mock, api } = yield* withToken(() => {
				calls += 1;
				return "token";
			});
			yield* api.post("/auth/login", {
				body: { user: "ada" },
				plugins: { bearer: false },
			});
			expect(wire(mock).headers.authorization).toBeUndefined();
			expect(calls).toBe(0);
		}),
	);
});
