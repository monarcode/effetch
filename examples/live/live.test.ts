import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { FetchTest } from "@monarcode/effetch/test";

import { Lichess, LichessApi, movedBy, tv, tvFeed } from "./lichess.ts";
import {
	type Change,
	humanEdits,
	recentChanges,
	Wikimedia,
	WikimediaApi,
} from "./wikipedia.ts";

// Both feeds against one fake backend: a list of events for the SSE
// endpoint, and a list of lines for the NDJSON one.

const change = (title: string, overrides: Partial<Change> = {}): Change => ({
	type: "edit",
	title,
	user: "Ada",
	bot: false,
	server_name: "en.wikipedia.org",
	length: { old: 100, new: 120 },
	...overrides,
});

const Backend = FetchTest.layer([
	FetchTest.respond(recentChanges, () =>
		Effect.succeed([
			{ data: change("By a bot", { bot: true }) },
			{
				data: change("On another wiki", {
					server_name: "de.wikipedia.org",
				}),
			},
			{ data: change("A new page", { type: "new" }) },
			{ event: "message", id: "1", data: change("Kept") },
			{ data: change("Kept too") },
			{ data: change("One too many") },
		]),
	),
	FetchTest.respond(tvFeed, () =>
		Effect.succeed([
			{
				t: "featured",
				d: {
					id: "game1",
					players: [
						{ color: "white", user: { name: "Ada" }, rating: 2000 },
						{ color: "black", rating: 1800 },
					],
				},
			},
			{
				t: "fen",
				d: {
					fen: "8/8/8/8/4P3/8/8/8 b - - 0 1",
					lm: "e2e4",
					wc: 60,
					bc: 60,
				},
			},
		] as const),
	),
]);

const TestLayer = Layer.mergeAll(
	WikimediaApi.layer.pipe(Layer.provide(Wikimedia.layer)),
	LichessApi.layer.pipe(Layer.provide(Lichess.layer)),
).pipe(Layer.provide(Backend));

describe("Live feeds", () => {
	it.effect("keeps people's edits to English Wikipedia, up to the count", () =>
		Effect.gen(function* () {
			const edits = yield* Stream.runCollect(humanEdits(2));
			expect(edits.map((edit) => edit.title)).toStrictEqual([
				"Kept",
				"Kept too",
			]);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("tells Lichess TV's featured games and moves apart", () =>
		Effect.gen(function* () {
			const [featured, move] = yield* Stream.runCollect(tv(5));
			expect(featured?.t).toBe("featured");
			expect(move).toMatchObject({ t: "fen", d: { lm: "e2e4" } });
			if (move?.t === "fen") expect(movedBy(move.d.fen)).toBe("white");
		}).pipe(Effect.provide(TestLayer)),
	);
});
