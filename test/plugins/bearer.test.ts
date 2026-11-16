import { it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Headers from "effect/http/Headers";
import * as HttpBody from "effect/http/HttpBody";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { describe, expect } from "vitest";

import { bearer, type TokenSource } from "../../src/plugins/index.js";
import { base, setup, wire } from "../utils/client.js";
import { after } from "../utils/clock.js";
import { delayed } from "../utils/mockClient.js";
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

const authorization = (request: HttpClientRequest.HttpClientRequest) =>
	Option.getOrUndefined(Headers.get(request.headers, "authorization"));

describe("bearer with refresh", () => {
	// A server that accepts only `Bearer new`, answering everything else
	// with 401, after `latency` when it's given.
	const server =
		(latency?: Duration.Input) =>
		(request: { readonly headers: Readonly<Record<string, string>> }) => {
			const answer =
				request.headers.authorization === "Bearer new"
					? reply.json({ ok: true })
					: reply.json({ error: "expired" }, { status: 401 });
			return latency === undefined ? answer : delayed(latency, answer);
		};

	it.effect("gets a new token on a 401 and sends the request again", () =>
		Effect.gen(function* () {
			let refreshes = 0;
			const { mock, api } = yield* setup(server(), {
				plugins: [
					bearer({
						token: () => "old",
						refresh: () => {
							refreshes += 1;
							return "new";
						},
					}),
				],
			});
			const response = yield* api.get("/me");
			expect(response.status).toBe(200);
			expect(refreshes).toBe(1);
			expect(
				mock.requests.map((request) => request.headers.authorization),
			).toEqual(["Bearer old", "Bearer new"]);
		}),
	);

	it.effect("gives the refresh the request that was refused", () =>
		Effect.gen(function* () {
			const refused: Array<[string, string | undefined]> = [];
			const { api } = yield* setup(server(), {
				plugins: [
					bearer({
						token: "old",
						refresh: async (request) => {
							refused.push([request.url, authorization(request)]);
							return "new";
						},
					}),
				],
			});
			yield* api.get("/me");
			expect(refused).toEqual([[`${base}/me`, "Bearer old"]]);
		}),
	);

	it.effect("sends a POST again with its body", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(server(), {
				plugins: [bearer({ token: "old", refresh: () => "new" })],
			});
			yield* api.post("/todos", { body: { title: "write" } });
			expect(mock.requests.map((request) => request.method)).toEqual([
				"POST",
				"POST",
			]);
			expect(wire(mock, 1).body).toBe(wire(mock, 0).body);
			expect(wire(mock, 1).body).toBe(JSON.stringify({ title: "write" }));
		}),
	);

	it.effect("refreshes once for 401s that arrive together", () =>
		Effect.gen(function* () {
			let refreshes = 0;
			const { mock, api } = yield* setup(server("1 second"), {
				plugins: [
					bearer({
						token: "old",
						refresh: Effect.sync(() => {
							refreshes += 1;
							return "new";
						}),
					}),
				],
			});
			const results = yield* after(
				Effect.all([api.get("/a"), api.get("/b"), api.get("/c")], {
					concurrency: "unbounded",
				}),
				"1 minute",
			);
			expect(results.map((response) => response.status)).toEqual([
				200, 200, 200,
			]);
			expect(refreshes).toBe(1);
			expect(mock.requests).toHaveLength(6);
		}),
	);

	it.effect(
		"refreshes again for a 401 to a request sent after the last refresh",
		() =>
			Effect.gen(function* () {
				const tokens = ["first", "second"];
				let refreshes = 0;
				const { mock, api } = yield* setup(
					(request) =>
						request.headers.authorization?.startsWith("Bearer fresh")
							? reply.json({ ok: true })
							: reply.empty(401),
					{
						plugins: [
							bearer({
								token: () => tokens.shift(),
								refresh: () => {
									refreshes += 1;
									return `fresh-${refreshes}`;
								},
							}),
						],
					},
				);
				yield* api.get("/me");
				yield* api.get("/me");
				expect(refreshes).toBe(2);
				expect(
					mock.requests.map((request) => request.headers.authorization),
				).toEqual([
					"Bearer first",
					"Bearer fresh-1",
					"Bearer second",
					"Bearer fresh-2",
				]);
			}),
	);

	it.effect(
		"refreshes separately for requests refused with different tokens",
		() =>
			Effect.gen(function* () {
				let refreshes = 0;
				const { mock, api } = yield* setup(
					(request) =>
						request.headers.authorization?.startsWith("Bearer new-") ===
						true
							? reply.json({})
							: delayed("1 second", reply.empty(401)),
					{
						plugins: [
							bearer({
								token: (request) =>
									request.url.endsWith("/a") ? "old-a" : "old-b",
								refresh: (request) => {
									refreshes += 1;
									return authorization(request) === "Bearer old-a"
										? "new-a"
										: "new-b";
								},
							}),
						],
					},
				);
				yield* after(
					Effect.all([api.get("/a"), api.get("/b")], {
						concurrency: "unbounded",
					}),
					"1 minute",
				);
				expect(refreshes).toBe(2);
				const sent = mock.requests.map((request) => [
					request.url,
					request.headers.authorization,
				]);
				expect(sent).toContainEqual([`${base}/a`, "Bearer new-a"]);
				expect(sent).toContainEqual([`${base}/b`, "Bearer new-b"]);
			}),
	);

	it.effect("refreshes again for a later 401 to the same token", () =>
		Effect.gen(function* () {
			let refreshes = 0;
			const { api } = yield* setup(server(), {
				plugins: [
					bearer({
						token: "old",
						refresh: () => {
							refreshes += 1;
							return "new";
						},
					}),
				],
			});
			yield* api.get("/me");
			yield* api.get("/me");
			expect(refreshes).toBe(2);
		}),
	);

	it.effect("shares a failed refresh with the 401s that wait for it", () =>
		Effect.gen(function* () {
			let refreshes = 0;
			const { api } = yield* setup(server("1 second"), {
				plugins: [
					bearer({
						token: "old",
						refresh: Effect.suspend(() => {
							refreshes += 1;
							return Effect.fail(new TokenError());
						}),
					}),
				],
			});
			const errors = yield* after(
				Effect.forEach(
					["/a", "/b", "/c"],
					(path) => Effect.flip(api.get(path)),
					{ concurrency: "unbounded" },
				),
				"1 minute",
			);
			expect(refreshes).toBe(1);
			for (const error of errors) {
				expect(error).toBeInstanceOf(TokenError);
			}
		}),
	);

	it.effect(
		"keeps the refresh running for the others when the call that started it is interrupted",
		() =>
			Effect.gen(function* () {
				let refreshes = 0;
				let resolve: (token: string) => void = () => {};
				const { api } = yield* setup(
					(request) =>
						request.headers.authorization === "Bearer new"
							? reply.json({})
							: delayed("1 second", reply.empty(401)),
					{
						plugins: [
							bearer({
								token: "old",
								refresh: () => {
									refreshes += 1;
									return new Promise<string>((done) => {
										resolve = done;
									});
								},
							}),
						],
					},
				);
				const first = yield* Effect.forkChild(api.get("/a"));
				const second = yield* Effect.forkChild(api.get("/b"));
				yield* TestClock.adjust("1 second");
				yield* Effect.yieldNow;
				expect(refreshes).toBe(1);
				yield* Fiber.interrupt(first);
				resolve("new");
				const response = yield* Fiber.join(second);
				expect(response.status).toBe(200);
				expect(refreshes).toBe(1);
			}),
	);

	it.effect(
		"doesn't refresh, or wait on itself, for a 401 to a call the refresh makes",
		() =>
			Effect.gen(function* () {
				const box: { call: Effect.Effect<unknown, unknown> } = {
					call: Effect.void,
				};
				const { mock, api } = yield* setup(server(), {
					plugins: [
						bearer({
							token: "old",
							refresh: Effect.suspend(() => box.call).pipe(
								Effect.as("new"),
							),
						}),
					],
				});
				box.call = api.post("/auth/refresh");
				const error = yield* after(
					Effect.flip(Effect.timeout(api.get("/me"), "10 seconds")),
					"1 minute",
				);
				expect(error).toMatchObject({ _tag: "HttpError", status: 401 });
				expect(mock.requests.map((request) => request.url)).toEqual([
					`${base}/me`,
					`${base}/auth/refresh`,
				]);
			}),
	);

	it.effect("doesn't send a streamed body again", () =>
		Effect.gen(function* () {
			let refreshes = 0;
			const { mock, api } = yield* setup(server(), {
				plugins: [
					bearer({
						token: "old",
						refresh: () => {
							refreshes += 1;
							return "new";
						},
					}),
				],
			});
			const error = yield* Effect.flip(
				api.post("/upload", {
					body: HttpBody.stream(Stream.make(new Uint8Array([1]))),
				}),
			);
			expect(error).toMatchObject({ status: 401 });
			expect(refreshes).toBe(0);
			expect(mock.requests).toHaveLength(1);
		}),
	);

	it.effect("ends with the 401 when the new token is refused too", () =>
		Effect.gen(function* () {
			let refreshes = 0;
			const { mock, api } = yield* setup([reply.empty(401)], {
				plugins: [
					bearer({
						token: "old",
						refresh: () => {
							refreshes += 1;
							return "new";
						},
					}),
				],
			});
			const error = yield* Effect.flip(api.get("/me"));
			expect(error).toMatchObject({ _tag: "HttpError", status: 401 });
			expect(refreshes).toBe(1);
			expect(mock.requests).toHaveLength(2);
		}),
	);

	it.effect.each([null, undefined, ""] as const)(
		"ends with the 401, sending nothing more, when the refresh gives %j",
		(token) =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup(server(), {
					plugins: [bearer({ token: "old", refresh: () => token })],
				});
				const error = yield* Effect.flip(api.get("/me"));
				expect(error).toMatchObject({ _tag: "HttpError", status: 401 });
				expect(mock.requests).toHaveLength(1);
			}),
	);

	it.effect("fails the call with the refresh Effect's typed error", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(server(), {
				plugins: [
					bearer({ token: "old", refresh: Effect.fail(new TokenError()) }),
				],
			});
			const error = yield* Effect.flip(api.get("/me"));
			expect(error).toBeInstanceOf(TokenError);
			expect(mock.requests).toHaveLength(1);
		}),
	);

	it.effect("makes the call die when a refresh function throws", () =>
		Effect.gen(function* () {
			const { api } = yield* setup(server(), {
				plugins: [
					bearer({
						token: "old",
						refresh: (): string => {
							throw new Error("no refresh");
						},
					}),
				],
			});
			const exit = yield* Effect.exit(api.get("/me"));
			expect(Exit.hasDies(exit)).toBe(true);
		}),
	);

	it.effect("takes the refresh Effect's services from make", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(server(), {
				plugins: [
					bearer({ token: "old", refresh: Effect.service(AccessToken) }),
				],
			}).pipe(Effect.provideService(AccessToken, "new"));
			yield* api.get("/me");
			expect(wire(mock, 1).headers.authorization).toBe("Bearer new");
		}),
	);

	it.effect(
		"doesn't refresh when the Authorization header came from the call or the client",
		() =>
			Effect.gen(function* () {
				let refreshes = 0;
				const refresh = () => {
					refreshes += 1;
					return "new";
				};
				const { mock, api } = yield* setup(server(), {
					headers: { Authorization: "Basic client" },
					plugins: [bearer({ token: "old", refresh })],
				});
				const fromClient = yield* Effect.flip(api.get("/me"));
				const fromCall = yield* Effect.flip(
					api.get("/me", { headers: { authorization: "Basic call" } }),
				);
				expect(fromClient).toMatchObject({ status: 401 });
				expect(fromCall).toMatchObject({ status: 401 });
				expect(refreshes).toBe(0);
				expect(mock.requests).toHaveLength(2);
			}),
	);

	it.effect("doesn't refresh when no token was sent", () =>
		Effect.gen(function* () {
			let refreshes = 0;
			const { mock, api } = yield* setup(server(), {
				plugins: [
					bearer({
						token: () => undefined,
						refresh: () => {
							refreshes += 1;
							return "new";
						},
					}),
				],
			});
			const error = yield* Effect.flip(api.get("/me"));
			expect(error).toMatchObject({ status: 401 });
			expect(refreshes).toBe(0);
			expect(mock.requests).toHaveLength(1);
		}),
	);

	it.effect("doesn't refresh when skipped per call", () =>
		Effect.gen(function* () {
			let refreshes = 0;
			const { mock, api } = yield* setup(server(), {
				plugins: [
					bearer({
						token: "old",
						refresh: () => {
							refreshes += 1;
							return "new";
						},
					}),
				],
			});
			const error = yield* Effect.flip(
				api.get("/me", { plugins: { bearer: false } }),
			);
			expect(error).toMatchObject({ status: 401 });
			expect(wire(mock).headers.authorization).toBeUndefined();
			expect(refreshes).toBe(0);
		}),
	);

	it.effect("leaves a 401 alone without refresh", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(server(), {
				plugins: [bearer({ token: "old" })],
			});
			const error = yield* Effect.flip(api.get("/me"));
			expect(error).toMatchObject({ status: 401 });
			expect(mock.requests).toHaveLength(1);
		}),
	);
});
