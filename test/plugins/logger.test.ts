import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { describe, expect } from "vitest";

import * as Fetch from "../../src/index.js";
import { bearer, logger } from "../../src/plugins/index.js";
import { base, setup } from "../utils/client.js";
import { after } from "../utils/clock.js";
import { captureLogs } from "../utils/logs.js";
import { delayed, failure, hang } from "../utils/mockClient.js";
import { reply } from "../utils/reply.js";

describe("logger", () => {
	it.effect(
		"logs the method, URL, status and duration at Debug, as text and annotations, with the route",
		() =>
			Effect.gen(function* () {
				const logs = captureLogs();
				const { api } = yield* setup(
					[delayed("120 millis", reply.json({}))],
					{
						plugins: [logger()],
					},
				);
				yield* logs.capture(after(api.get("/todos"), "120 millis"));
				expect(logs.entries).toHaveLength(1);
				expect(logs.entries[0]).toMatchObject({
					level: "Debug",
					message: [`GET ${base}/todos 200 (120ms)`],
					annotations: {
						method: "GET",
						url: `${base}/todos`,
						route: "GET /todos",
						status: 200,
						durationMs: 120,
					},
				});
			}),
	);

	it.effect("annotates the route with its params unfilled", () =>
		Effect.gen(function* () {
			const logs = captureLogs();
			const { api } = yield* setup([reply.json({})], {
				plugins: [logger()],
			});
			const getTodo = api.endpoint("GET /todos/:id");
			yield* logs.capture(api.patch("/todos/:id", { params: { id: 1 } }));
			yield* logs.capture(getTodo({ params: { id: 2 } }));
			expect(logs.entries.map((entry) => entry.message)).toEqual([
				[`PATCH ${base}/todos/1 200 (0ms)`],
				[`GET ${base}/todos/2 200 (0ms)`],
			]);
			expect(
				logs.entries.map((entry) => entry.annotations["route"]),
			).toEqual(["PATCH /todos/:id", "GET /todos/:id"]);
		}),
	);

	it.effect("leaves the route out for client.httpClient", () =>
		Effect.gen(function* () {
			const logs = captureLogs();
			const { api } = yield* setup([reply.json({})], {
				plugins: [logger()],
			});
			yield* logs.capture(
				api.httpClient.execute(HttpClientRequest.get("/todos")),
			);
			expect(logs.entries).toHaveLength(1);
			expect(logs.entries[0]?.annotations).not.toHaveProperty("route");
		}),
	);

	it.effect("rounds the duration to whole milliseconds", () =>
		Effect.gen(function* () {
			const logs = captureLogs();
			const { api } = yield* setup(
				[delayed(Duration.millis(120.6), reply.json({}))],
				{ plugins: [logger()] },
			);
			yield* logs.capture(after(api.get("/todos"), "1 second"));
			expect(logs.entries[0]?.message).toEqual([
				`GET ${base}/todos 200 (121ms)`,
			]);
			expect(logs.entries[0]?.annotations["durationMs"]).toBe(121);
		}),
	);

	it.effect("logs at Info when asked", () =>
		Effect.gen(function* () {
			const logs = captureLogs();
			const { api } = yield* setup([reply.empty(404)], {
				plugins: [logger({ level: "Info" })],
			});
			yield* logs.capture(Effect.flip(api.get("/todos")));
			expect(logs.entries[0]).toMatchObject({
				level: "Info",
				message: [`GET ${base}/todos 404 (0ms)`],
			});
		}),
	);

	it.effect("logs a failure with its cause", () =>
		Effect.gen(function* () {
			const logs = captureLogs();
			const { api } = yield* setup([failure()], { plugins: [logger()] });
			const error = yield* logs.capture(Effect.flip(api.get("/todos")));
			expect(logs.entries).toHaveLength(1);
			expect(logs.entries[0]?.message).toEqual([
				`GET ${base}/todos failed (0ms)`,
			]);
			expect(logs.entries[0]?.annotations).toMatchObject({
				method: "GET",
				url: `${base}/todos`,
				route: "GET /todos",
				durationMs: 0,
			});
			const cause = logs.entries[0]?.cause;
			expect(cause && Cause.squash(cause)).toBe(error);
			expect(error).toBeInstanceOf(Fetch.NetworkError);
		}),
	);

	it.effect("keeps tokens, cookies and query strings out of the logs", () =>
		Effect.gen(function* () {
			const logs = captureLogs();
			const { api } = yield* setup(
				[
					reply.json(
						{},
						{ headers: { "set-cookie": "session=secret-set-cookie" } },
					),
				],
				{ plugins: [logger(), bearer({ token: "secret-token" })] },
			);
			yield* logs.capture(
				api.get("/todos", {
					query: { key: "secret-key" },
					headers: { cookie: "session=secret-cookie" },
				}),
			);
			expect(logs.entries).toHaveLength(1);
			const written = JSON.stringify(
				logs.entries.map((entry) => [entry.message, entry.annotations]),
			);
			expect(written).not.toMatch(/secret/);
		}),
	);

	it.effect("can be skipped per call", () =>
		Effect.gen(function* () {
			const logs = captureLogs();
			const { api } = yield* setup([reply.json({})], {
				plugins: [logger()],
			});
			yield* logs.capture(api.get("/todos", { plugins: { logger: false } }));
			expect(logs.entries).toEqual([]);
		}),
	);

	it.effect("logs nothing when a later plugin interrupts the call", () =>
		Effect.gen(function* () {
			const logs = captureLogs();
			const cancel = Fetch.plugin({
				name: "cancel",
				onRequest: () => Effect.interrupt,
			});
			const { api } = yield* setup([reply.json({})], {
				plugins: [logger(), cancel],
			});
			const exit = yield* logs.capture(Effect.exit(api.get("/todos")));
			expect(Exit.hasInterrupts(exit)).toBe(true);
			expect(logs.entries).toEqual([]);
		}),
	);

	it.effect("logs nothing for an interrupted call", () =>
		Effect.gen(function* () {
			const logs = captureLogs();
			const { api } = yield* setup([hang], { plugins: [logger()] });
			yield* logs.capture(
				Effect.gen(function* () {
					const fiber = yield* Effect.forkChild(api.get("/todos"));
					yield* Effect.yieldNow;
					yield* Fiber.interrupt(fiber);
				}),
			);
			expect(logs.entries).toEqual([]);
		}),
	);
});
