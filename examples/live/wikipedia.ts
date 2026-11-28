import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { Fetch } from "@monarcode/effetch";
import { timeout } from "@monarcode/effetch/plugins";

// Every change to every Wikimedia wiki, as it happens: Server-Sent Events
// from Wikimedia's EventStreams. Each event's `data` is one change.

/** One change, as the `data` of an event. */
export const Change = Schema.Struct({
	// "edit", "new", "log" or "categorize".
	type: Schema.String,
	title: Schema.String,
	user: Schema.String,
	bot: Schema.Boolean,
	server_name: Schema.String,
	// The page's size before and after, in bytes, for edits.
	length: Schema.optionalKey(
		Schema.Struct({
			old: Schema.optionalKey(Schema.Finite),
			new: Schema.optionalKey(Schema.Finite),
		}),
	),
});
export type Change = typeof Change.Type;

export class Wikimedia extends Fetch.Service<Wikimedia>()("Wikimedia", {
	baseUrl: "https://stream.wikimedia.org/v2",
	// Wikimedia asks clients for a User-Agent that names them. A browser
	// can't set one, so send `api-user-agent` from a web page instead.
	headers: { "user-agent": "effetch-examples" },
	// Until the response starts. Reading the stream has no time limit.
	plugins: [timeout({ duration: "10 seconds" })],
}) {}

export const recentChanges = Fetch.endpoint("GET /stream/recentchange", {
	output: Change,
	stream: "sse",
});

export class WikimediaApi extends Fetch.Endpoints<WikimediaApi>()(
	"WikimediaApi",
	Wikimedia,
	{ recentChanges },
) {}

/** The next `count` edits to English Wikipedia made by people, not bots. */
export const humanEdits = (count: number) =>
	Stream.unwrap(
		Effect.gen(function* () {
			const wikimedia = yield* WikimediaApi;
			return wikimedia.recentChanges().pipe(
				Stream.map((event) => event.data),
				Stream.filter(
					(change) =>
						change.server_name === "en.wikipedia.org" &&
						change.type === "edit" &&
						!change.bot,
				),
				// Ends the stream, and closes the connection, after `count`.
				Stream.take(count),
			);
		}),
	);
