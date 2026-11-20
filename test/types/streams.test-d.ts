// Type tests build Effects and Streams only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";

import { describe, expectTypeOf, it } from "vitest";

import { Fetch } from "../../src/index.js";
import type { timeout } from "../../src/plugins/index.js";
import { FetchTest } from "../../src/test/index.js";

const Progress = Schema.Struct({ percent: Schema.Finite });
const Row = Schema.Struct({ id: Schema.Finite });
const ApiError = Schema.Struct({ code: Schema.String });
const Prompt = Schema.Struct({ prompt: Schema.String });

class Gone extends Schema.TaggedError<Gone>()("Gone", {
	message: Schema.String,
}) {}
class Locale extends Context.Service<Locale, string>()("Locale") {}

/** A schema whose decoding and encoding need `Locale`. */
declare const Localized: Schema.Codec<string, string, Locale, Locale>;

declare const api: Fetch.Client;
declare const withAuth: Fetch.Client<
	[ReturnType<typeof timeout>],
	typeof ApiError
>;

type ErrorOf<T> =
	T extends Stream.Stream<unknown, infer E, unknown> ? E : never;
type ServicesOf<T> =
	T extends Stream.Stream<unknown, unknown, infer R> ? R : never;
type ElementOf<T> =
	T extends Stream.Stream<infer A, unknown, unknown> ? A : never;

describe("api.sse and api.ndjson", () => {
	it("give typed values", () => {
		expectTypeOf(api.sse("/events")).toEqualTypeOf<
			Stream.Stream<
				Fetch.SseEvent<string>,
				| Fetch.NetworkError
				| Fetch.HttpError.With<unknown>
				| Fetch.DecodeError,
				never
			>
		>();
		expectTypeOf<ElementOf<ReturnType<typeof sseProgress>>>().toEqualTypeOf<
			Fetch.SseEvent<{ readonly percent: number }>
		>();
		expectTypeOf<
			ElementOf<ReturnType<typeof api.ndjson<"/rows", typeof Row>>>
		>().toEqualTypeOf<{ readonly id: number }>();
		expectTypeOf<
			ElementOf<ReturnType<typeof api.ndjson<"/rows">>>
		>().toEqualTypeOf<unknown>();
		expectTypeOf(api.sse("/log", { output: Fetch.text() })).toExtend<
			Stream.Stream<Fetch.SseEvent<string>, unknown, never>
		>();
	});

	it("match CallError and CallServices, with DecodeError always", () => {
		const events = withAuth.sse("/jobs/:id/events", {
			params: { id: 1 },
			output: Localized,
			method: "POST",
			input: Prompt,
			body: { prompt: "Hi" },
			statusErrors: { 410: Gone },
		});
		expectTypeOf<ErrorOf<typeof events>>().toEqualTypeOf<
			| Fetch.CallError<
					typeof Localized,
					typeof ApiError,
					[ReturnType<typeof timeout>],
					{ readonly 410: typeof Gone }
			  >
			| Fetch.DecodeError
		>();
		expectTypeOf<ServicesOf<typeof events>>().toEqualTypeOf<
			Fetch.CallServices<
				typeof Localized,
				typeof ApiError,
				typeof Prompt,
				{ readonly 410: typeof Gone }
			>
		>();
	});

	it("take a body only with a method that has one", () => {
		// @ts-expect-error: a GET request, the default, has no body
		api.sse("/chat", { input: Prompt, body: { prompt: "Hi" } });
		// @ts-expect-error: a GET request has no body
		api.ndjson("/chat", { method: "GET", body: "x" });
		const posted = api.sse("/chat", {
			method: "POST",
			input: Prompt,
			body: { prompt: "Hi" },
		});
		expectTypeOf<ElementOf<typeof posted>>().toEqualTypeOf<
			Fetch.SseEvent<string>
		>();
		// @ts-expect-error: an OPTIONS request has no body, as for endpoints
		api.sse("/chat", { method: "OPTIONS", body: "x" });
		api.ndjson("/rows", { method: "PUT", body: "x" });
		api.sse("/events", { method: "GET" });
	});

	it("reject Fetch.bytes()", () => {
		// @ts-expect-error: Fetch.bytes() can't decode a stream's values
		api.sse("/events", { output: Fetch.bytes() });
		// @ts-expect-error: Fetch.bytes() can't decode a stream's values
		api.ndjson("/rows", { output: Fetch.bytes() });
	});

	it("reject what can't be streamed", () => {
		// @ts-expect-error: responseMode can't be used with a stream
		api.sse("/events", { responseMode: "decoded-and-response" });
		// @ts-expect-error: params are required
		api.ndjson("/jobs/:id/rows");
		// @ts-expect-error: the body must match input
		api.sse("/chat", { method: "POST", input: Prompt, body: { prompt: 1 } });
	});
});

const sseProgress = () => api.sse("/jobs/1/events", { output: Progress });

describe("stream endpoints", () => {
	const events = Fetch.endpoint("GET /jobs/:id/events", {
		output: Progress,
		error: ApiError,
		statusErrors: { 410: Gone },
		stream: "sse",
	});
	const rows = Fetch.endpoint("GET /export", { stream: "ndjson" });
	const plain = Fetch.endpoint("GET /todos", { output: Row });

	it("return a Stream from every way of binding", () => {
		type Expected = Stream.Stream<
			Fetch.SseEvent<{ readonly percent: number }>,
			| Fetch.CallError<
					typeof Progress,
					typeof ApiError,
					[],
					{ readonly 410: typeof Gone }
			  >
			| Fetch.DecodeError,
			Fetch.CallServices<
				typeof Progress,
				typeof ApiError,
				undefined,
				{ readonly 410: typeof Gone }
			>
		>;
		expectTypeOf(events.stream).toEqualTypeOf<"sse">();
		expectTypeOf(plain.stream).toEqualTypeOf<undefined>();
		expectTypeOf(
			api.bind(events)({ params: { id: 1 } }),
		).toEqualTypeOf<Expected>();
		expectTypeOf(
			api.bindAll({ events }).events({ params: { id: 1 } }),
		).toEqualTypeOf<Expected>();
		expectTypeOf(
			api.endpoint("GET /jobs/:id/events", {
				output: Progress,
				error: ApiError,
				statusErrors: { 410: Gone },
				stream: "sse",
			})({ params: { id: 1 } }),
		).toEqualTypeOf<Expected>();
		const boundRows = api.bind(rows);
		expectTypeOf<
			ElementOf<ReturnType<typeof boundRows>>
		>().toEqualTypeOf<unknown>();
		// A plain endpoint still returns an Effect.
		expectTypeOf(api.bind(plain)()).toEqualTypeOf<
			Effect.Effect<
				{ readonly id: number },
				| Fetch.NetworkError
				| Fetch.HttpError.With<unknown>
				| Fetch.DecodeError,
				never
			>
		>();
	});

	it("stream through Fetch.Endpoints", () => {
		class Api extends Fetch.Service<Api>()("types/streams/Api", {
			baseUrl: "https://api.test",
		}) {}
		class JobApi extends Fetch.Endpoints<JobApi>()(
			"types/streams/JobApi",
			Api,
			{
				events,
			},
		) {}
		Effect.gen(function* () {
			const jobs = yield* JobApi;
			expectTypeOf<
				ElementOf<ReturnType<typeof jobs.events>>
			>().toEqualTypeOf<Fetch.SseEvent<{ readonly percent: number }>>();
		});
	});

	it("reject responseMode", () => {
		// @ts-expect-error: a stream endpoint can't take a responseMode
		api.bind(rows)({ responseMode: "decoded-and-response" });
	});

	it("reject what defining them would throw on", () => {
		Fetch.endpoint("GET /a", {
			stream: "sse",
			// @ts-expect-error: a stream can't take a responseMode
			responseMode: "decoded-and-response",
		});
		// @ts-expect-error: Fetch.bytes() can't decode a stream's values
		Fetch.endpoint("GET /b", { stream: "ndjson", output: Fetch.bytes() });
		// @ts-expect-error: a stream can't take a responseMode
		api.endpoint("GET /c", { stream: "ndjson", responseMode: "decoded" });
		// @ts-expect-error: Fetch.bytes() can't decode a stream's values
		api.endpoint("GET /d", { stream: "sse", output: Fetch.bytes() });
		// Without stream, both are fine.
		Fetch.endpoint("GET /e", {
			output: Fetch.bytes(),
			responseMode: "decoded-and-response",
		});
		api.endpoint("GET /f", { stream: "sse", output: Fetch.text() });
	});

	it("are AnyUnboundEndpoints", () => {
		expectTypeOf(events).toExtend<Fetch.AnyUnboundEndpoint>();
		expectTypeOf(rows).toExtend<Fetch.AnyUnboundEndpoint>();
	});
});

describe("Fetch.paginate", () => {
	const Todos = Schema.Array(Row);
	const listTodos = Fetch.endpoint("GET /orgs/:org/todos", {
		query: Schema.Struct({ page: Schema.Finite }),
		output: Todos,
		error: ApiError,
	});
	const listByCursor = Fetch.endpoint("GET /items", {
		output: Todos,
		responseMode: "decoded-and-response",
	});

	it("gives a Stream of pages with the call's error", () => {
		const pages = Fetch.paginate(api.bind(listTodos), {
			start: 1,
			request: (page) => {
				expectTypeOf(page).toEqualTypeOf<number>();
				return { params: { org: "acme" }, query: { page } };
			},
			next: (todos, page, response) => {
				expectTypeOf(todos).toEqualTypeOf<
					ReadonlyArray<{ readonly id: number }>
				>();
				expectTypeOf(response).toEqualTypeOf<undefined>();
				return todos.length === 0 ? Option.none() : Option.some(page + 1);
			},
		});
		expectTypeOf(pages).toEqualTypeOf<
			Stream.Stream<
				ReadonlyArray<{ readonly id: number }>,
				| Fetch.NetworkError
				| Fetch.HttpError.With<{ readonly code: string }>
				| Fetch.DecodeError,
				never
			>
		>();
	});

	it("gives next the response with decoded-and-response", () => {
		const pages = Fetch.paginate(api.bind(listByCursor), {
			start: undefined as string | undefined,
			request: (cursor) =>
				cursor === undefined ? {} : { query: { cursor } },
			next: (items, _, response) => {
				expectTypeOf(items).toEqualTypeOf<
					ReadonlyArray<{ readonly id: number }>
				>();
				expectTypeOf(
					response,
				).toEqualTypeOf<HttpClientResponse.HttpClientResponse>();
				return Option.fromNullishOr(response.headers["x-next"]);
			},
		});
		expectTypeOf<ElementOf<typeof pages>>().toEqualTypeOf<
			ReadonlyArray<{ readonly id: number }>
		>();
	});

	it("types each page's request", () => {
		Fetch.paginate(api.bind(listTodos), {
			start: 1,
			// @ts-expect-error: params are required
			request: (page) => ({ query: { page } }),
			next: () => Option.none(),
		});
		Fetch.paginate(api.bind(listTodos), {
			start: 1,
			// @ts-expect-error: page must be a number
			request: () => ({ params: { org: "acme" }, query: { page: "1" } }),
			next: () => Option.none(),
		});
	});

	it("leaves responseMode to the endpoint", () => {
		Fetch.paginate(api.bind(listByCursor), {
			start: 1,
			// @ts-expect-error: the endpoint's responseMode decides what a page is
			request: () => ({ responseMode: "decoded" }),
			next: () => Option.none(),
		});
	});

	it("rejects definitions and stream endpoints", () => {
		// @ts-expect-error: a definition needs binding first
		Fetch.paginate(listTodos, {
			start: 1,
			request: () => ({}),
			next: () => Option.none(),
		});
		const rows = Fetch.endpoint("GET /rows", { stream: "ndjson" });
		const bound = api.bind(rows);
		// @ts-expect-error: a stream endpoint can't be paged
		Fetch.paginate(bound, {
			start: 1,
			request: () => ({}),
			next: () => Option.none(),
		});
	});
});

describe("FetchTest with stream endpoints", () => {
	const events = Fetch.endpoint("GET /events", {
		output: Progress,
		stream: "sse",
	});
	const raw = Fetch.endpoint("GET /raw", { stream: "sse" });
	const rows = Fetch.endpoint("GET /rows", { output: Row, stream: "ndjson" });

	it("types the handler's result as a list", () => {
		FetchTest.respond(events, () =>
			Effect.succeed([
				{ data: { percent: 1 } },
				{ event: "done", id: "1", data: { percent: 2 } },
			]),
		);
		FetchTest.respond(raw, () => Effect.succeed([{ data: "text" }]));
		FetchTest.respond(rows, () => Effect.succeed([{ id: 1 }]));
		FetchTest.respond(rows, () => Effect.succeed(FetchTest.reply(500)));
		// @ts-expect-error: an SSE handler returns events
		FetchTest.respond(events, () => Effect.succeed([{ percent: 1 }]));
		// @ts-expect-error: an NDJSON handler returns a list
		FetchTest.respond(rows, () => Effect.succeed({ id: 1 }));
	});
});
