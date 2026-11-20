import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import {
	Api,
	StreamsApi,
	allUsers,
	complete,
	countUsers,
	exportUsers,
	followJob,
	jobEvents,
	listUsers,
} from "../examples/streams.js";
import { Fetch } from "../src/index.js";
import { FetchTest } from "../src/test/index.js";

const completions = Fetch.endpoint("POST /completions", {
	input: Schema.Struct({ prompt: Schema.String }),
	output: Fetch.text(),
	stream: "sse",
});

const Backend = FetchTest.layer([
	FetchTest.respond(jobEvents, () =>
		Effect.succeed([
			{ data: { percent: 50, step: "build" } },
			{ data: { percent: 100, step: "deploy" } },
			// Not read: the job is done.
			{ data: { percent: 100, step: "extra" } },
		]),
	),
	FetchTest.respond(exportUsers, () =>
		Effect.succeed([
			{ id: 1, email: "a@example.com" },
			{ id: 2, email: "b@example.com" },
		]),
	),
	FetchTest.respond(completions, ({ body }) =>
		Effect.succeed([
			{ data: JSON.stringify({ text: "Echo: " }) },
			{ data: JSON.stringify({ text: body.prompt }) },
			{ data: "[DONE]" },
		]),
	),
	FetchTest.respond(listUsers, ({ query }) =>
		Effect.succeed(
			// The cursor arrives decoded once, as it was before encoding.
			query.cursor === "YQ=="
				? FetchTest.reply(200, [{ id: 2, email: "b@example.com" }])
				: FetchTest.reply(200, [{ id: 1, email: "a@example.com" }], {
						headers: { link: '</users?cursor=YQ%3D%3D>; rel="next"' },
					}),
		),
	),
]);

const TestLive = StreamsApi.layer.pipe(
	Layer.provideMerge(Api.layer),
	Layer.provide(Backend),
);

// Runs `examples/streams.ts` against a fake backend, so it keeps working,
// not only compiling.
describe("examples/streams.ts", () => {
	it.effect("follows a job until it's done", () =>
		Effect.gen(function* () {
			const last = yield* followJob("7");
			expect(Option.map(last, (event) => event.data.step)).toEqual(
				Option.some("deploy"),
			);
		}).pipe(Effect.provide(TestLive)),
	);

	it.effect("counts an export's users", () =>
		Effect.gen(function* () {
			expect(yield* countUsers).toBe(2);
		}).pipe(Effect.provide(TestLive)),
	);

	it.effect("reads an answer up to its sentinel", () =>
		Effect.gen(function* () {
			expect(yield* complete("Hi")).toBe("Echo: Hi");
		}).pipe(Effect.provide(TestLive)),
	);

	it.effect("follows the Link header", () =>
		Effect.gen(function* () {
			const users = yield* allUsers;
			expect(users.map((user) => user.id)).toEqual([1, 2]);
		}).pipe(Effect.provide(TestLive)),
	);
});
