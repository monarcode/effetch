import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { Fetch } from "@monarcode/effetch";
import { timeout } from "@monarcode/effetch/plugins";

// Lichess TV: the game Lichess features, move by move, as newline-delimited
// JSON. Each line is either a new featured game or a move in it, told
// apart by `t`.

const Player = Schema.Struct({
	color: Schema.Literals(["white", "black"]),
	// Absent for Lichess's computer opponent.
	user: Schema.optionalKey(
		Schema.Struct({
			name: Schema.String,
			title: Schema.optionalKey(Schema.String),
		}),
	),
	rating: Schema.optionalKey(Schema.Finite),
});

/** A new game is featured. */
const Featured = Schema.Struct({
	t: Schema.Literal("featured"),
	d: Schema.Struct({ id: Schema.String, players: Schema.Array(Player) }),
});

/** A move: the position after it, the move itself, and both clocks. */
const Move = Schema.Struct({
	t: Schema.Literal("fen"),
	d: Schema.Struct({
		fen: Schema.String,
		lm: Schema.String,
		wc: Schema.Finite,
		bc: Schema.Finite,
	}),
});

export const TvEvent = Schema.Union([Featured, Move]);
export type TvEvent = typeof TvEvent.Type;

export class Lichess extends Fetch.Service<Lichess>()("Lichess", {
	baseUrl: "https://lichess.org/api",
	plugins: [timeout({ duration: "10 seconds" })],
}) {}

export const tvFeed = Fetch.endpoint("GET /tv/feed", {
	output: TvEvent,
	stream: "ndjson",
});

export class LichessApi extends Fetch.Endpoints<LichessApi>()(
	"LichessApi",
	Lichess,
	{ tvFeed },
) {}

/** The first `count` lines of Lichess TV: the featured game, then moves. */
export const tv = (count: number) =>
	Stream.unwrap(
		Effect.gen(function* () {
			const lichess = yield* LichessApi;
			return lichess.tvFeed().pipe(Stream.take(count));
		}),
	);

/** Who made the move that led to `fen`: the side that isn't to play. */
export const movedBy = (fen: string): "white" | "black" =>
	fen.split(" ")[1] === "b" ? "white" : "black";
