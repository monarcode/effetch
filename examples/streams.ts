import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as Fetch from "@monarcode/effetch";
import { retry, timeout } from "@monarcode/effetch/plugins";

// Streams and pages: a job's progress as Server-Sent Events, an export as
// newline-delimited JSON, a language model's answer that ends with a
// sentinel, and a list paged by a cursor in a `Link` header.

const ApiError = Schema.Struct({ code: Schema.String });

export class Api extends Fetch.Service<Api>()("examples/streams/Api", {
	baseUrl: "https://api.example.com",
	defaultError: ApiError,
	// `retry` and `timeout` apply to getting each response, not to reading
	// a stream's body.
	plugins: [retry(), timeout({ duration: "10 seconds" })],
}) {}

export const ApiLive = Api.layer.pipe(Layer.provide(FetchHttpClient.layer));

// --- Schemas and endpoints ---

export const JobProgress = Schema.Struct({
	percent: Schema.Finite,
	step: Schema.String,
});

export const User = Schema.Struct({ id: Schema.Finite, email: Schema.String });

/** A job's progress, one event per step, until `percent` reaches 100. */
export const jobEvents = Fetch.endpoint("GET /jobs/:id/events", {
	output: JobProgress,
	stream: "sse",
});

/** Every user, one per line. */
export const exportUsers = Fetch.endpoint("GET /exports/users", {
	output: User,
	stream: "ndjson",
});

/** A page of users. The next page's link is in the `Link` header. */
export const listUsers = Fetch.endpoint("GET /users", {
	output: Schema.Array(User),
	responseMode: "decoded-and-response",
});

export class StreamsApi extends Fetch.Endpoints<StreamsApi>()(
	"examples/streams/StreamsApi",
	Api,
	{ jobEvents, exportUsers, listUsers },
) {}

// --- Using them ---

/** Logs a job's progress, and ends when it's done. */
export const followJob = (id: string) =>
	Effect.gen(function* () {
		const api = yield* StreamsApi;
		return yield* api.jobEvents({ params: { id } }).pipe(
			Stream.tap((event) =>
				Effect.log(`${event.data.step}: ${event.data.percent}%`),
			),
			Stream.takeUntil((event) => event.data.percent >= 100),
			Stream.runLast,
		);
	});

/** Counts the users of an export, as they arrive. */
export const countUsers = Effect.gen(function* () {
	const api = yield* StreamsApi;
	return yield* Stream.runCount(api.exportUsers());
});

const Delta = Schema.fromJsonString(Schema.Struct({ text: Schema.String }));

/**
 * A language model's answer, as it's written. The server ends with
 * `data: [DONE]`, which isn't JSON, so the events are read as text, and
 * decoded up to the sentinel.
 */
export const complete = (prompt: string) =>
	Effect.gen(function* () {
		const api = yield* Api;
		return yield* api
			.sse("/completions", {
				method: "POST",
				input: Schema.Struct({ prompt: Schema.String }),
				body: { prompt },
			})
			.pipe(
				Stream.takeWhile((event) => event.data !== "[DONE]"),
				Stream.mapEffect((event) =>
					Schema.decodeUnknownEffect(Delta)(event.data),
				),
				Stream.map((delta) => delta.text),
				Stream.mkString,
			);
	});

/**
 * The `cursor` of a `Link` header's `rel="next"` URL, decoded: it's
 * percent-encoded in the URL, and `query` encodes it again.
 */
const nextCursor = (link: string | undefined): Option.Option<string> =>
	Option.fromNullishOr(
		/<[^>]*[?&]cursor=([^&>]+)[^>]*>;\s*rel="next"/.exec(link ?? "")?.[1],
	).pipe(Option.flatMap(Option.liftThrowable(decodeURIComponent)));

/** Every user, page by page, following the `Link` header. */
export const allUsers = Effect.gen(function* () {
	const api = yield* StreamsApi;
	return yield* Fetch.paginate(api.listUsers, {
		start: Option.none<string>(),
		request: (cursor) =>
			Option.match(cursor, {
				onNone: () => ({}),
				onSome: (value) => ({ query: { cursor: value } }),
			}),
		next: (_users, _cursor, response) =>
			Option.map(nextCursor(response.headers.link), Option.some),
	}).pipe(Stream.flattenIterable, Stream.runCollect);
});
