import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { Lichess, LichessApi, movedBy, tv } from "./lichess.ts";
import { humanEdits, Wikimedia, WikimediaApi } from "./wikipedia.ts";

// Two live feeds from two backends, each read as it arrives:
//
//   pnpm example live
//
// First the next edits to English Wikipedia, then the moves of the game
// Lichess TV is showing. Both streams end after a few items.

const edits = humanEdits(5).pipe(
	Stream.runForEach((change) => {
		const size = (change.length?.new ?? 0) - (change.length?.old ?? 0);
		return Console.log(
			`  ${change.title}, by ${change.user} (${size >= 0 ? "+" : ""}${size} bytes)`,
		);
	}),
);

const moves = tv(9).pipe(
	Stream.runForEach((line) => {
		if (line.t === "featured") {
			const [white, black] = line.d.players.map((player) =>
				`${player.user?.title ?? ""} ${player.user?.name ?? "Computer"} (${player.rating ?? "?"})`.trim(),
			);
			return Console.log(`  ${white} vs ${black}`);
		}
		return Console.log(
			`  ${movedBy(line.d.fen)} plays ${line.d.lm}. Clocks: white ${line.d.wc}s, black ${line.d.bc}s`,
		);
	}),
);

const program = Effect.gen(function* () {
	yield* Console.log("Wikipedia, live:");
	yield* edits;
	yield* Console.log("\nLichess TV, live:");
	yield* moves;
});

// One layer per backend, both on one HttpClient.
const Live = Layer.mergeAll(
	WikimediaApi.layer.pipe(Layer.provide(Wikimedia.layer)),
	LichessApi.layer.pipe(Layer.provide(Lichess.layer)),
).pipe(Layer.provide(FetchHttpClient.layer));

Effect.runPromise(program.pipe(Effect.provide(Live)));
