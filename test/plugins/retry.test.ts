import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Random from "effect/Random";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";

import { describe, expect } from "vitest";

import * as Fetch from "../../src/index.js";
import {
	bearer,
	logger,
	retry,
	TimeoutError,
	timeout,
} from "../../src/plugins/index.js";
import { base, setup } from "../utils/client.js";
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
