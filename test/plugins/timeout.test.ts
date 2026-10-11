import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import * as Fetch from "../../src/index.js";
import { TimeoutError, timeout } from "../../src/plugins/index.js";
import { base, setup, wire } from "../utils/client.js";
import { after } from "../utils/clock.js";
import { delayed, hang } from "../utils/mockClient.js";
import { reply } from "../utils/reply.js";

describe("timeout", () => {
	it.effect(
		"fails with a TimeoutError and aborts the request when the response is late",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup([hang], {
					plugins: [timeout({ duration: "5 seconds" })],
				});
				const error = yield* after(
					Effect.flip(api.get("/slow", { query: { key: "secret" } })),
					"5 seconds",
				);
				expect(error).toBeInstanceOf(TimeoutError);
				expect(error).toMatchObject({
					method: "GET",
					url: `${base}/slow`,
					duration: "5s",
					message: `GET ${base}/slow: timed out after 5s`,
				});
				expect(wire(mock).signal.aborted).toBe(true);
			}),
	);

	it.effect("lets a response that arrives in time through", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([delayed("4 seconds", reply.json(1))], {
				plugins: [timeout({ duration: "5 seconds" })],
			});
			const value = yield* after(
				api.get("/slow", { output: Schema.Number }),
				"4 seconds",
			);
			expect(value).toBe(1);
		}),
	);

	it.effect("takes a duration per call", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([delayed("8 seconds", reply.json(1))], {
				plugins: [timeout({ duration: "5 seconds" })],
			});
			const value = yield* after(
				api.get("/export", {
					output: Schema.Number,
					plugins: { timeout: { duration: "10 seconds" } },
				}),
				"8 seconds",
			);
			expect(value).toBe(1);
			const error = yield* after(
				Effect.flip(
					api.get("/export", { plugins: { timeout: { duration: 1000 } } }),
				),
				"1 second",
			);
			expect(error).toMatchObject({ _tag: "TimeoutError", duration: "1s" });
		}),
	);

	it.effect("can be skipped per call", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([delayed("1 minute", reply.json(1))], {
				plugins: [timeout({ duration: "5 seconds" })],
			});
			const value = yield* after(
				api.get("/slow", {
					output: Schema.Number,
					plugins: { timeout: false },
				}),
				"1 minute",
			);
			expect(value).toBe(1);
		}),
	);

	it.effect("covers the plugins after it", () =>
		Effect.gen(function* () {
			const slowToken = Fetch.plugin({
				name: "slowToken",
				onRequest: (request) =>
					Effect.as(Effect.sleep("1 minute"), request),
			});
			const { mock, api } = yield* setup([reply.json(1)], {
				plugins: [timeout({ duration: "5 seconds" }), slowToken],
			});
			const error = yield* after(Effect.flip(api.get("/slow")), "5 seconds");
			expect(error).toBeInstanceOf(TimeoutError);
			expect(mock.requests).toHaveLength(0);
		}),
	);

	it("isn't a FetchError", () => {
		const error = new TimeoutError({
			method: "GET",
			url: `${base}/slow`,
			duration: "5s",
		});
		expect(Fetch.isFetchError(error)).toBe(false);
		expect(error._tag).toBe("TimeoutError");
	});
});
