import { it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Random from "effect/Random";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";

import { describe, expect } from "vitest";

import { Fetch } from "../../src/index.js";
import {
	bearer,
	logger,
	retry,
	TimeoutError,
	timeout,
} from "../../src/plugins/index.js";
import { base, setup, wire } from "../utils/client.js";
import { after } from "../utils/clock.js";
import { captureLogs } from "../utils/logs.js";
import { delayed, failure, hang } from "../utils/mockClient.js";
import { reply } from "../utils/reply.js";

const Todo = Schema.Struct({ id: Schema.Finite });

const everySecond = Schedule.spaced("1 second");

describe("retry", () => {
	it.effect(
		"retries a NetworkError up to times, then fails with the last one",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup([failure()], {
					plugins: [retry({ schedule: everySecond })],
				});
				const error = yield* after(
					Effect.flip(api.get("/todos")),
					"1 minute",
				);
				expect(error).toBeInstanceOf(Fetch.NetworkError);
				expect(mock.requests).toHaveLength(3);
			}),
	);

	it.effect("succeeds when a later attempt does", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(
				[failure(), reply.empty(503), reply.json({ id: 1 })],
				{ plugins: [retry({ schedule: everySecond })] },
			);
			const todo = yield* after(
				api.get("/todos/1", { output: Todo }),
				"1 minute",
			);
			expect(todo).toEqual({ id: 1 });
			expect(mock.requests).toHaveLength(3);
		}),
	);

	it.effect("gives back the last response when the retries run out", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(
				[
					reply.text("first", { status: 503 }),
					reply.text("second", { status: 502 }),
					reply.text("last", { status: 500 }),
				],
				{ plugins: [retry({ schedule: everySecond })] },
			);
			const error = yield* after(Effect.flip(api.get("/todos")), "1 minute");
			expect(error).toMatchObject({
				_tag: "HttpError",
				status: 500,
				text: "last",
			});
			expect(mock.requests).toHaveLength(3);
		}),
	);

	it.effect("leaves other statuses and decoding failures alone", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(
				[reply.empty(404), reply.json({ id: "1" })],
				{ plugins: [retry({ schedule: everySecond })] },
			);
			const notFound = yield* after(
				Effect.flip(api.get("/todos")),
				"1 minute",
			);
			expect(notFound).toMatchObject({ _tag: "HttpError", status: 404 });
			const invalid = yield* after(
				Effect.flip(api.get("/todos/1", { output: Todo })),
				"1 minute",
			);
			expect(invalid).toBeInstanceOf(Fetch.DecodeError);
			expect(mock.requests).toHaveLength(2);
		}),
	);

	it.effect("never retries POST or PATCH by default", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([failure(), reply.empty(503)], {
				plugins: [retry({ schedule: everySecond })],
			});
			const post = yield* after(
				Effect.flip(api.post("/todos", { body: {} })),
				"1 minute",
			);
			expect(post).toBeInstanceOf(Fetch.NetworkError);
			const patch = yield* after(
				Effect.flip(api.patch("/todos/1", { body: {} })),
				"1 minute",
			);
			expect(patch).toMatchObject({ _tag: "HttpError", status: 503 });
			expect(mock.requests).toHaveLength(2);
		}),
	);

	it.effect("retries the configured methods and statuses only", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(
				[
					reply.empty(409),
					reply.empty(409),
					reply.json({ id: 1 }),
					reply.empty(503),
				],
				{
					plugins: [
						retry({
							methods: ["POST"],
							statuses: [409],
							schedule: everySecond,
						}),
					],
				},
			);
			const created = yield* after(
				api.post("/todos", { body: {}, output: Todo }),
				"1 minute",
			);
			expect(created).toEqual({ id: 1 });
			expect(mock.requests).toHaveLength(3);
			yield* after(Effect.flip(api.get("/todos")), "1 minute");
			expect(mock.requests).toHaveLength(4);
		}),
	);

	it.effect("takes times per call, and 0 turns it off", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([failure()], {
				plugins: [retry({ times: 3, schedule: everySecond })],
			});
			yield* after(
				Effect.flip(
					api.get("/todos", { plugins: { retry: { times: 0 } } }),
				),
				"1 minute",
			);
			expect(mock.requests).toHaveLength(1);
			yield* after(
				Effect.flip(
					api.get("/todos", { plugins: { retry: { times: 1 } } }),
				),
				"1 minute",
			);
			expect(mock.requests).toHaveLength(3);
			yield* after(Effect.flip(api.get("/todos")), "1 minute");
			expect(mock.requests).toHaveLength(7);
		}),
	);

	it.effect("can be skipped per call", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([failure()], {
				plugins: [retry({ schedule: everySecond })],
			});
			yield* after(
				Effect.flip(api.get("/todos", { plugins: { retry: false } })),
				"1 minute",
			);
			expect(mock.requests).toHaveLength(1);
		}),
	);

	it.effect.each([
		[0, 160, 320],
		[0.5, 200, 400],
	] as const)(
		"backs off exponentially from 200ms, with jitter, by default (random %d: %dms, then %dms)",
		([random, first, second]) =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup(
					[failure(), failure(), reply.json({ id: 1 })],
					{ plugins: [retry()] },
				);
				const fiber = yield* Effect.forkChild(
					api.get("/todos/1", { output: Todo }).pipe(
						Effect.provideService(Random.Random, {
							nextIntUnsafe: () => 0,
							nextDoubleUnsafe: () => random,
						}),
					),
				);
				yield* TestClock.adjust(first - 1);
				expect(mock.requests).toHaveLength(1);
				yield* TestClock.adjust(1);
				expect(mock.requests).toHaveLength(2);
				yield* TestClock.adjust(second - 1);
				expect(mock.requests).toHaveLength(2);
				yield* TestClock.adjust(1);
				expect(mock.requests).toHaveLength(3);
				expect(yield* Fiber.join(fiber)).toEqual({ id: 1 });
			}),
	);

	it.effect("doesn't retry a timeout", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([hang], {
				plugins: [
					retry({ schedule: everySecond }),
					timeout({ duration: "5 seconds" }),
				],
			});
			const error = yield* after(Effect.flip(api.get("/todos")), "1 minute");
			expect(error).toBeInstanceOf(TimeoutError);
			expect(mock.requests).toHaveLength(1);
		}),
	);

	it.effect(
		"in the recommended order, gives each attempt its own timeout and a fresh token, logged once",
		() =>
			Effect.gen(function* () {
				const tokens = ["first", "second"];
				const logs = captureLogs();
				const { mock, api } = yield* setup(
					[
						delayed("4 seconds", failure()),
						delayed("4 seconds", reply.json({ id: 1 })),
					],
					{
						plugins: [
							logger(),
							retry({ schedule: everySecond }),
							timeout({ duration: "5 seconds" }),
							bearer({ token: () => tokens.shift() }),
						],
					},
				);
				const todo = yield* logs.capture(
					after(api.get("/todos/1", { output: Todo }), "1 minute"),
				);
				expect(todo).toEqual({ id: 1 });
				expect(
					mock.requests.map((request) => request.headers.authorization),
				).toEqual(["Bearer first", "Bearer second"]);
				expect(logs.entries.map((entry) => entry.message[0])).toEqual([
					`GET ${base}/todos/1 200 (9000ms)`,
				]);
			}),
	);
});

describe("retry with retryAfter", () => {
	// Forks `call`, then checks how many requests were sent just before and
	// at `wait` after the first one.
	const expectRetryAt = <A, E>(
		call: Effect.Effect<A, E>,
		mock: { readonly requests: ReadonlyArray<unknown> },
		wait: Duration.Input,
	) =>
		Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(call);
			yield* TestClock.adjust(
				Duration.toMillis(Duration.fromInputUnsafe(wait)) - 1,
			);
			expect(mock.requests).toHaveLength(1);
			yield* TestClock.adjust(1);
			expect(mock.requests).toHaveLength(2);
			return yield* Fiber.join(fiber);
		});

	const busy = (retryAfter: string, status = 503) =>
		reply.empty(status, { headers: { "Retry-After": retryAfter } });

	it.effect.each([429, 503])(
		"waits the seconds a %d's Retry-After asks",
		(status) =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup(
					[busy("5", status), reply.json({ id: 1 })],
					{
						plugins: [retry({ schedule: everySecond, retryAfter: true })],
					},
				);
				const todo = yield* expectRetryAt(
					api.get("/todos/1", { output: Todo }),
					mock,
					"5 seconds",
				);
				expect(todo).toEqual({ id: 1 });
			}),
	);

	it.effect("waits until a Retry-After date", () =>
		Effect.gen(function* () {
			const now = yield* Clock.currentTimeMillis;
			const { mock, api } = yield* setup(
				[busy(new Date(now + 8000).toUTCString()), reply.json({ id: 1 })],
				{ plugins: [retry({ schedule: everySecond, retryAfter: true })] },
			);
			yield* expectRetryAt(api.get("/todos/1"), mock, "8 seconds");
		}),
	);

	it.effect("retries at once for a Retry-After date in the past", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(
				[busy("Thu, 01 Jan 1970 00:00:00 GMT"), reply.json({ id: 1 })],
				{ plugins: [retry({ schedule: everySecond, retryAfter: true })] },
			);
			yield* TestClock.adjust("10 seconds");
			const response = yield* api.get("/todos/1");
			expect(response.status).toBe(200);
			expect(mock.requests).toHaveLength(2);
		}),
	);

	it.effect.each([
		["true caps it at 1 minute", true, "1 minute"],
		["max caps it", { max: "10 seconds" }, "10 seconds"],
	] as const)("%s", ([, retryAfter, wait]) =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([busy("3600"), reply.json({})], {
				plugins: [retry({ schedule: everySecond, retryAfter })],
			});
			yield* expectRetryAt(api.get("/todos"), mock, wait);
		}),
	);

	it.effect.each([
		["it's off", "120", undefined],
		["it's false", "120", false],
		["the header can't be read", "soon", true],
		["the header is a fraction", "1.5", true],
		["the header is negative", "-5", true],
		["the header has a sign", "+10", true],
	] as const)("follows the schedule when %s", ([, header, retryAfter]) =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([busy(header), reply.json({})], {
				plugins: [
					retry(
						retryAfter === undefined
							? { schedule: everySecond }
							: { schedule: everySecond, retryAfter },
					),
				],
			});
			yield* expectRetryAt(api.get("/todos"), mock, "1 second");
		}),
	);

	it.effect("doesn't cap the schedule's delay when there's no header", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(
				[reply.empty(503), reply.json({})],
				{
					plugins: [
						retry({
							schedule: Schedule.spaced("30 seconds"),
							retryAfter: { max: "5 seconds" },
						}),
					],
				},
			);
			yield* expectRetryAt(api.get("/todos"), mock, "30 seconds");
		}),
	);

	it.effect("follows the schedule after a NetworkError", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([failure(), reply.json({})], {
				plugins: [retry({ schedule: everySecond, retryAfter: true })],
			});
			yield* expectRetryAt(api.get("/todos"), mock, "1 second");
		}),
	);
});

describe("retry with a budget", () => {
	const tenSeconds = Schedule.spaced("10 seconds");

	it.effect(
		"stops before a wait that would end after the budget, with the last response",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup(
					[
						reply.text("first", { status: 503 }),
						reply.text("second", { status: 503 }),
						reply.text("third", { status: 503 }),
					],
					{
						plugins: [
							retry({
								times: 5,
								schedule: tenSeconds,
								budget: "15 seconds",
							}),
						],
					},
				);
				const error = yield* after(
					Effect.flip(api.get("/todos")),
					"1 minute",
				);
				expect(error).toMatchObject({
					_tag: "HttpError",
					status: 503,
					text: "second",
				});
				expect(mock.requests).toHaveLength(2);
			}),
	);

	it.effect("doesn't wait until exactly the end of the budget", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(
				[
					reply.text("first", { status: 503 }),
					reply.text("second", { status: 503 }),
					reply.text("third", { status: 503 }),
				],
				{
					plugins: [
						retry({
							times: 5,
							schedule: tenSeconds,
							budget: "20 seconds",
						}),
					],
				},
			);
			const error = yield* after(Effect.flip(api.get("/todos")), "1 minute");
			expect(error).toMatchObject({ _tag: "HttpError", text: "second" });
			expect(mock.requests).toHaveLength(2);
		}),
	);

	it.effect(
		"ends with the last NetworkError when the budget stops the retries",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup([failure()], {
					plugins: [
						retry({
							times: 5,
							schedule: tenSeconds,
							budget: "15 seconds",
						}),
					],
				});
				const error = yield* after(
					Effect.flip(api.get("/todos")),
					"1 minute",
				);
				expect(error).toBeInstanceOf(Fetch.NetworkError);
				expect(mock.requests).toHaveLength(2);
			}),
	);

	it.effect(
		"fails with TimeoutError, and aborts the attempt, when the budget runs out during it",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup(
					[reply.empty(503), delayed("1 minute", reply.json({}))],
					{
						plugins: [
							retry({ schedule: everySecond, budget: "5 seconds" }),
						],
					},
				);
				const error = yield* after(
					Effect.flip(api.get("/todos")),
					"1 minute",
				);
				expect(error).toBeInstanceOf(TimeoutError);
				expect(error).toMatchObject({
					method: "GET",
					url: `${base}/todos`,
					duration: "5s",
				});
				expect(mock.requests).toHaveLength(2);
				expect(wire(mock, 1).signal.aborted).toBe(true);
			}),
	);

	it.effect("bounds a call that isn't retried, or with times 0", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([hang], {
				plugins: [retry({ budget: "5 seconds" })],
			});
			const post = yield* after(
				Effect.flip(api.post("/todos", { body: {} })),
				"1 minute",
			);
			expect(post).toBeInstanceOf(TimeoutError);
			const once = yield* after(
				Effect.flip(
					api.get("/todos", { plugins: { retry: { times: 0 } } }),
				),
				"1 minute",
			);
			expect(once).toBeInstanceOf(TimeoutError);
			expect(mock.requests).toHaveLength(2);
		}),
	);

	it.effect("takes the budget per call", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([failure()], {
				plugins: [
					retry({ times: 5, schedule: tenSeconds, budget: "15 seconds" }),
				],
			});
			yield* after(
				Effect.flip(
					api.get("/todos", {
						plugins: { retry: { budget: "35 seconds" } },
					}),
				),
				"1 minute",
			);
			expect(mock.requests).toHaveLength(4);
			yield* after(
				Effect.flip(
					api.get("/todos", {
						plugins: { retry: { budget: "5 seconds" } },
					}),
				),
				"1 minute",
			);
			expect(mock.requests).toHaveLength(5);
		}),
	);

	it.effect("takes a budget per call when the plugin has none", () =>
		Effect.gen(function* () {
			const options: { readonly budget?: number } = {};
			const { mock, api } = yield* setup([hang], {
				plugins: [retry(options)],
			});
			const error = yield* after(
				Effect.flip(
					api.get("/todos", {
						plugins: { retry: { budget: "5 seconds" } },
					}),
				),
				"1 minute",
			);
			expect(error).toBeInstanceOf(TimeoutError);
			expect(error).toMatchObject({ duration: "5s" });
			expect(mock.requests).toHaveLength(1);
		}),
	);

	it.effect("leaves the call alone when skipped per call", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup(
				[delayed("1 minute", reply.json({}))],
				{
					plugins: [retry({ budget: "5 seconds" })],
				},
			);
			const response = yield* after(
				api.get("/todos", { plugins: { retry: false } }),
				"2 minutes",
			);
			expect(response.status).toBe(200);
			expect(mock.requests).toHaveLength(1);
		}),
	);

	it.effect("gives each attempt its own timeout, under the budget", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([hang], {
				plugins: [
					retry({
						times: 10,
						schedule: everySecond,
						budget: "25 seconds",
					}),
					timeout({ duration: "10 seconds" }),
				],
			});
			const error = yield* after(Effect.flip(api.get("/todos")), "1 minute");
			expect(error).toMatchObject({ _tag: "TimeoutError", duration: "10s" });
			expect(mock.requests).toHaveLength(1);
		}),
	);
});
