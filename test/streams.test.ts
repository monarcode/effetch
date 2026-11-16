import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { describe, expect, vi } from "vitest";

import * as Fetch from "../src/index.js";
import { consoleLogger, retry, timeout } from "../src/plugins/index.js";
import { FetchTest } from "../src/test/index.js";

const base = "https://api.test";
const encoder = new TextEncoder();

interface Sent {
	readonly method: string;
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string | undefined;
	readonly signal: AbortSignal;
}

interface Served {
	readonly status?: number | undefined;
	readonly headers?: Readonly<Record<string, string>> | undefined;
	/** The body's chunks, sent one by one, or `null` for no body. */
	readonly chunks?: ReadonlyArray<string | Uint8Array> | null | undefined;
	/** After the chunks: end the body, fail it, or keep it open. */
	readonly end?: "close" | "error" | "hang" | undefined;
}

/** An `HttpClient` that streams `serve(request)`'s chunks, and records requests. */
const streamingClient = (serve: (sent: Sent) => Served) => {
	const sent: Array<Sent> = [];
	const pulls = { count: 0 };
	const client = HttpClient.make((request, url, signal) => {
		const body = request.body;
		const recorded: Sent = {
			method: request.method,
			url: url.href,
			headers: { ...request.headers },
			body:
				body._tag === "Uint8Array"
					? new TextDecoder().decode(body.body)
					: undefined,
			signal,
		};
		sent.push(recorded);
		const served = serve(recorded);
		const chunks = [...(served.chunks ?? [])];
		const stream =
			served.chunks === null
				? null
				: new ReadableStream<Uint8Array>({
						pull(controller) {
							pulls.count += 1;
							const next = chunks.shift();
							if (next !== undefined) {
								controller.enqueue(
									typeof next === "string"
										? encoder.encode(next)
										: next,
								);
							} else if (served.end === "error") {
								controller.error(new TypeError("connection reset"));
							} else if (served.end !== "hang") {
								controller.close();
							}
						},
					});
		return Effect.succeed(
			HttpClientResponse.fromWeb(
				request,
				new Response(stream, {
					status: served.status ?? 200,
					headers: served.headers ?? {},
				}),
			),
		);
	});
	return {
		layer: Layer.succeed(HttpClient.HttpClient, client),
		sent,
		pulls,
	};
};

const collect = <A, E, R>(stream: Stream.Stream<A, E, R>) =>
	Effect.map(Stream.runCollect(stream), (chunk) => [...chunk]);

const defectOf = <A, E, R>(self: Effect.Effect<A, E, R>) =>
	Effect.map(Effect.exit(self), (exit) => {
		expect(Exit.hasDies(exit)).toBe(true);
		return Exit.isFailure(exit)
			? (Cause.squash(exit.cause) as Error).message
			: "";
	});

const Progress = Schema.Struct({ percent: Schema.Finite });

describe("api.sse", () => {
	it.effect("parses events across chunk boundaries", () =>
		Effect.gen(function* () {
			const euro = encoder.encode("€");
			const mock = streamingClient(() => ({
				chunks: [
					'data: {"perc',
					'ent": 1}\r\n\r',
					'\nevent: done\nid: 7\ndata: {"percent": 2}\n\n',
					': a comment\ndata: "',
					euro.slice(0, 1),
					euro.slice(1),
					'"\n\n',
				],
			}));
			const events = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* collect(
					api.sse("/jobs/1/events", {
						output: Schema.Union([Progress, Schema.String]),
					}),
				);
			}).pipe(Effect.provide(mock.layer));
			expect(events).toEqual([
				{ event: "message", id: undefined, data: { percent: 1 } },
				{ event: "done", id: "7", data: { percent: 2 } },
				// The id carries over; the comment is ignored.
				{ event: "message", id: "7", data: "€" },
			]);
			expect(mock.sent[0]?.headers.accept).toBe("text/event-stream");
		}),
	);

	it.effect("gives the text without output, and with Fetch.text", () =>
		Effect.gen(function* () {
			const mock = streamingClient(() => ({
				chunks: [
					"data: a\ndata: b\n\nretry: 1000\n\ndata:  42 \n\ndata: x",
				],
			}));
			const [raw, text] = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* Effect.all([
					collect(api.sse("/raw")),
					collect(api.sse("/raw", { output: Fetch.text() })),
				]);
			}).pipe(Effect.provide(mock.layer));
			// Multi-line data is joined with \n; `retry:` is ignored; the last
			// event, without a blank line, is dropped.
			const expected = [
				{ event: "message", id: undefined, data: "a\nb" },
				{ event: "message", id: undefined, data: " 42 " },
			];
			expect(raw).toEqual(expected);
			expect(text).toEqual(expected);
			const counted = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* collect(
					api.sse("/raw", { output: Fetch.text(Schema.NumberFromString) }),
				);
			}).pipe(
				Effect.provide(
					streamingClient(() => ({ chunks: ["data:  42 \n\n"] })).layer,
				),
			);
			expect(counted.map((event) => event.data)).toEqual([42]);
		}),
	);

	it.effect("fails with a DecodeError when an event doesn't decode", () =>
		Effect.gen(function* () {
			const run = (chunk: string) =>
				Effect.gen(function* () {
					const api = yield* Fetch.make({ baseUrl: base });
					return yield* Effect.flip(
						collect(api.sse("/events", { output: Progress })),
					);
				}).pipe(
					Effect.provide(
						streamingClient(() => ({ chunks: [chunk] })).layer,
					),
				);
			const mismatch = yield* run(
				'data: {"percent": 1}\n\ndata: {"percent": "x"}\n\n',
			);
			expect(mismatch).toBeInstanceOf(Fetch.DecodeError);
			expect(mismatch.message).toContain(
				"The data of event 2 doesn't match the output schema",
			);
			const invalid = yield* run("data: nope\n\n");
			expect(invalid.message).toContain(
				"The data of event 1 isn't valid JSON",
			);
			expect(invalid).toMatchObject({
				method: "GET",
				url: "https://api.test/events",
				status: 200,
			});
		}),
	);

	it.effect("fails with a DecodeError when the body breaks off", () =>
		Effect.gen(function* () {
			const mock = streamingClient(() => ({
				chunks: ["data: 1\n\n"],
				end: "error",
			}));
			const error = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* Effect.flip(collect(api.sse("/events")));
			}).pipe(Effect.provide(mock.layer));
			expect(error).toBeInstanceOf(Fetch.DecodeError);
			expect(error.message).toContain("Failed to read the response body");
		}),
	);

	it.effect("fails before streaming on an error status", () =>
		Effect.gen(function* () {
			class Gone extends Schema.TaggedError<Gone>()("Gone", {
				message: Schema.String,
			}) {}
			const mock = streamingClient((sent) =>
				sent.url.endsWith("/gone")
					? { status: 410, chunks: ['{"message":"Job gone"}'] }
					: { status: 500, chunks: ['{"code":"boom"}'] },
			);
			const [gone, failed] = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({
					baseUrl: base,
					defaultError: Schema.Struct({ code: Schema.String }),
				});
				return yield* Effect.all([
					Effect.flip(
						collect(api.sse("/gone", { statusErrors: { 410: Gone } })),
					),
					Effect.flip(collect(api.sse("/broken"))),
				]);
			}).pipe(Effect.provide(mock.layer));
			expect(gone).toBeInstanceOf(Gone);
			expect(failed).toMatchObject({
				_tag: "HttpError",
				status: 500,
				body: { code: "boom" },
			});
		}),
	);

	it.effect("sends a body with another method, and keeps a set accept", () =>
		Effect.gen(function* () {
			const mock = streamingClient(() => ({ chunks: ["data: ok\n\n"] }));
			yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				yield* collect(
					api.sse("/completions", {
						method: "POST",
						input: Schema.Struct({ prompt: Schema.String }),
						body: { prompt: "Hi" },
						headers: { accept: "text/event-stream; charset=utf-8" },
					}),
				);
			}).pipe(Effect.provide(mock.layer));
			expect(mock.sent[0]).toMatchObject({
				method: "POST",
				body: '{"prompt":"Hi"}',
			});
			expect(mock.sent[0]?.headers.accept).toBe(
				"text/event-stream; charset=utf-8",
			);
		}),
	);

	// Live clock: the test waits for the stream to block on the open body.
	it.live("aborts the request when the stream is interrupted", () =>
		Effect.gen(function* () {
			const mock = streamingClient(() => ({
				chunks: ["data: 1\n\n"],
				end: "hang",
			}));
			const api = yield* Fetch.make({
				baseUrl: base,
				plugins: [
					retry(),
					timeout({ duration: "1 second" }),
					consoleLogger({ detail: "full", color: false }),
				],
			}).pipe(Effect.provide(mock.layer));
			// Taking part of it ends it early.
			const first = yield* collect(api.sse("/events").pipe(Stream.take(1)));
			expect(first).toHaveLength(1);
			expect(mock.sent[0]?.signal.aborted).toBe(true);
			// Interrupting it while it waits for more.
			const fiber = yield* Effect.forkChild(collect(api.sse("/events")));
			yield* Effect.yieldNow;
			yield* Effect.sleep("10 millis");
			expect(mock.sent[1]?.signal.aborted).toBe(false);
			yield* Fiber.interrupt(fiber);
			expect(mock.sent[1]?.signal.aborted).toBe(true);
		}),
	);

	it.effect("dies on responseMode and Fetch.bytes", () =>
		Effect.gen(function* () {
			const mock = streamingClient(() => ({ chunks: [] }));
			const api = yield* Fetch.make({ baseUrl: base }).pipe(
				Effect.provide(mock.layer),
			);
			const withMode = yield* defectOf(
				collect(
					api.sse("/events", {
						responseMode: "decoded-and-response" as never,
					}),
				),
			);
			expect(withMode).toBe(
				"api.sse: responseMode can't be used with a stream, which gives the body's values",
			);
			const withBytes = yield* defectOf(
				// Rejected by the types too.
				collect(api.ndjson("/rows", { output: Fetch.bytes() as never })),
			);
			expect(withBytes).toContain(
				"api.ndjson: Fetch.bytes() can't decode a stream's values",
			);
			expect(mock.sent).toHaveLength(0);
		}),
	);
});

describe("stream edge cases", () => {
	const run = <A, E>(
		serve: (sent: Sent) => Served,
		use: (api: Fetch.Client) => Stream.Stream<A, E, never>,
	) =>
		Effect.gen(function* () {
			const api = yield* Fetch.make({ baseUrl: base });
			const seen: Array<A> = [];
			const exit = yield* Effect.exit(
				Stream.runForEach(use(api), (value) =>
					Effect.sync(() => seen.push(value)),
				),
			);
			return { seen, exit };
		}).pipe(Effect.provide(streamingClient(serve).layer));

	it.effect("gives the events before one that doesn't decode", () =>
		Effect.gen(function* () {
			const body =
				'data: {"percent":1}\n\ndata: {"percent":2}\n\ndata: [DONE]\n\n';
			const { seen, exit } = yield* run(
				() => ({ chunks: [body] }),
				(api) => api.sse("/events", { output: Progress }),
			);
			expect(seen.map((event) => event.data)).toEqual([
				{ percent: 1 },
				{ percent: 2 },
			]);
			expect(Exit.isFailure(exit)).toBe(true);
			// Stopping before it doesn't read it.
			const taken = yield* run(
				() => ({ chunks: [body] }),
				(api) =>
					api.sse("/events", { output: Progress }).pipe(Stream.take(2)),
			);
			expect(taken.seen).toHaveLength(2);
			expect(Exit.isSuccess(taken.exit)).toBe(true);
			// The same through FetchTest, which sends the body in one chunk.
			const events = Fetch.endpoint("GET /events", {
				output: Fetch.text(),
				stream: "sse",
			});
			const viaFake = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* collect(
					api
						.bind(events)()
						.pipe(Stream.takeWhile((event) => event.data !== "[DONE]")),
				);
			}).pipe(
				Effect.provide(
					FetchTest.layer([
						FetchTest.respond(events, () =>
							Effect.succeed([{ data: "a" }, { data: "[DONE]" }]),
						),
					]),
				),
			);
			expect(viaFake.map((event) => event.data)).toEqual(["a"]);
		}),
	);

	it.effect("gives the events before a parse error", () =>
		Effect.gen(function* () {
			const { seen, exit } = yield* run(
				() => ({
					chunks: [`data: 1\n\ndata: ${"x".repeat(11 * 1024 * 1024)}`],
				}),
				(api) => api.sse("/events"),
			);
			expect(seen.map((event) => event.data)).toEqual(["1"]);
			expect(Exit.isFailure(exit)).toBe(true);
		}),
	);

	it.effect("gives nothing for a 204 or a 205", () =>
		Effect.gen(function* () {
			for (const status of [204, 205]) {
				const sse = yield* run(
					() => ({
						status,
						chunks: null,
						headers: { "content-type": "text/plain" },
					}),
					(api) => api.sse("/events"),
				);
				const ndjson = yield* run(
					() => ({ status, chunks: null }),
					(api) => api.ndjson("/rows"),
				);
				expect([sse.seen, ndjson.seen]).toEqual([[], []]);
				expect([
					Exit.isSuccess(sse.exit),
					Exit.isSuccess(ndjson.exit),
				]).toEqual([true, true]);
			}
			// A 200 without a body can't be read.
			const error = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* Effect.flip(collect(api.ndjson("/rows")));
			}).pipe(
				Effect.provide(streamingClient(() => ({ chunks: null })).layer),
			);
			expect(error.message).toContain("Failed to read the response body");
		}),
	);

	it.effect("fails when the response isn't an event stream", () =>
		Effect.gen(function* () {
			const page = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* Effect.flip(collect(api.sse("/events")));
			}).pipe(
				Effect.provide(
					streamingClient(() => ({
						headers: { "content-type": "text/html; charset=utf-8" },
						chunks: ["<html>Sign in</html>"],
					})).layer,
				),
			);
			expect(page).toBeInstanceOf(Fetch.DecodeError);
			expect(page.message).toBe(
				"The response isn't an event stream: its content type is text/html, not text/event-stream",
			);
			const events = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* collect(api.sse("/events"));
			}).pipe(
				Effect.provide(
					streamingClient(() => ({
						headers: {
							"content-type": "Text/Event-Stream; charset=utf-8",
						},
						chunks: ["data: ok\n\n"],
					})).layer,
				),
			);
			expect(events.map((event) => event.data)).toEqual(["ok"]);
		}),
	);

	it.effect("fails with a DecodeError without TextDecoder", () =>
		Effect.gen(function* () {
			const error = yield* Effect.acquireUseRelease(
				Effect.sync(() => vi.stubGlobal("TextDecoder", undefined)),
				() =>
					Effect.gen(function* () {
						const api = yield* Fetch.make({ baseUrl: base });
						return yield* Effect.flip(collect(api.ndjson("/rows")));
					}).pipe(
						Effect.provide(
							streamingClient(() => ({ chunks: ['{"id":1}\n'] })).layer,
						),
					),
				() => Effect.sync(() => vi.unstubAllGlobals()),
			);
			expect(error).toBeInstanceOf(Fetch.DecodeError);
			expect(error.message).toContain("reading a stream needs TextDecoder");
		}),
	);
});

describe("api.ndjson", () => {
	const Row = Schema.Struct({ id: Schema.Finite });

	it.effect("gives one value per line", () =>
		Effect.gen(function* () {
			const mock = streamingClient(() => ({
				chunks: ['{"id":1}\n\n{"i', 'd":2}\r\n  \n{"id":3}'],
			}));
			const [rows, raw] = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* Effect.all([
					collect(api.ndjson("/export", { output: Row })),
					collect(api.ndjson("/export")),
				]);
			}).pipe(Effect.provide(mock.layer));
			expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
			expect(raw).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
			expect(mock.sent[0]?.headers.accept).toBe("application/x-ndjson");
		}),
	);

	it.effect("names the line that doesn't decode", () =>
		Effect.gen(function* () {
			const mock = streamingClient(() => ({
				chunks: ['{"id":1}\n\n{"id":"x"}\n'],
			}));
			const error = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* Effect.flip(
					collect(api.ndjson("/export", { output: Row })),
				);
			}).pipe(Effect.provide(mock.layer));
			expect(error).toBeInstanceOf(Fetch.DecodeError);
			expect(error.message).toContain(
				"Line 3 doesn't match the output schema",
			);
			const invalid = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* Effect.flip(collect(api.ndjson("/export")));
			}).pipe(
				Effect.provide(streamingClient(() => ({ chunks: ["{]\n"] })).layer),
			);
			expect(invalid.message).toContain("Line 1 isn't valid JSON");
		}),
	);

	it.effect("gives each line's text with Fetch.text", () =>
		Effect.gen(function* () {
			const mock = streamingClient(() => ({ chunks: ["a b\nc\n"] }));
			const lines = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* collect(api.ndjson("/log", { output: Fetch.text() }));
			}).pipe(Effect.provide(mock.layer));
			expect(lines).toEqual(["a b", "c"]);
		}),
	);
});

describe("stream endpoints", () => {
	const events = Fetch.endpoint("GET /jobs/:id/events", {
		output: Progress,
		stream: "sse",
	});
	const rows = Fetch.endpoint("GET /export", {
		output: Schema.Struct({ id: Schema.Finite }),
		stream: "ndjson",
	});

	it.effect(
		"stream through bind, bindAll, client.endpoint and Fetch.Endpoints",
		() =>
			Effect.gen(function* () {
				class Api extends Fetch.Service<Api>()("test/streams/Api", {
					baseUrl: base,
				}) {}
				class JobApi extends Fetch.Endpoints<JobApi>()(
					"test/streams/JobApi",
					Api,
					{
						events,
						rows: [rows, { headers: { "x-op": "rows" } }],
					},
				) {}
				const mock = streamingClient((sent) => ({
					chunks: sent.url.endsWith("/export")
						? ['{"id":1}\n']
						: ['data: {"percent": 5}\n\n'],
				}));
				const result = yield* Effect.gen(function* () {
					const api = yield* Api;
					const jobs = yield* JobApi;
					const all = api.bindAll({ events });
					const inline = api.endpoint("GET /jobs/:id/events", {
						output: Progress,
						stream: "sse",
					});
					return yield* Effect.all([
						collect(api.bind(events)({ params: { id: 1 } })),
						collect(all.events({ params: { id: 2 } })),
						collect(inline({ params: { id: 3 } })),
						collect(jobs.events({ params: { id: 4 } })),
						collect(jobs.rows()),
					]);
				}).pipe(
					Effect.provide(
						JobApi.layer.pipe(
							Layer.provideMerge(Api.layer),
							Layer.provide(mock.layer),
						),
					),
				);
				const event = {
					event: "message",
					id: undefined,
					data: { percent: 5 },
				};
				expect(result).toEqual([
					[event],
					[event],
					[event],
					[event],
					[{ id: 1 }],
				]);
				expect(mock.sent.map((sent) => sent.headers.accept)).toEqual([
					"text/event-stream",
					"text/event-stream",
					"text/event-stream",
					"text/event-stream",
					"application/x-ndjson",
				]);
				expect(mock.sent[4]?.headers["x-op"]).toBe("rows");
				expect(events.stream).toBe("sse");
			}),
	);

	it("checks the stream option when the endpoint is defined", () => {
		expect(() =>
			Fetch.endpoint("GET /x", { stream: "csv" as never }),
		).toThrow('stream must be "sse" or "ndjson", got "csv"');
		expect(() =>
			Fetch.endpoint("GET /x", {
				stream: "sse",
				responseMode: "decoded-and-response" as never,
			}),
		).toThrow(
			"The endpoint GET /x: responseMode can't be used with a stream",
		);
		expect(() =>
			Fetch.endpoint("GET /x", {
				stream: "ndjson",
				output: Fetch.bytes() as never,
			}),
		).toThrow("The endpoint GET /x: Fetch.bytes() can't decode");
	});

	it.effect("dies on a call's responseMode", () =>
		Effect.gen(function* () {
			const mock = streamingClient(() => ({ chunks: [] }));
			const message = yield* defectOf(
				Effect.gen(function* () {
					const api = yield* Fetch.make({ baseUrl: base });
					return yield* collect(
						api.bind(rows)({
							responseMode: "decoded-and-response" as never,
						}),
					);
				}).pipe(Effect.provide(mock.layer)),
			);
			expect(message).toContain(
				"The endpoint GET /export: responseMode can't be used with a stream",
			);
		}),
	);

	it.effect("are answered by FetchTest", () =>
		Effect.gen(function* () {
			const backend = FetchTest.layer([
				FetchTest.respond(events, ({ params }) =>
					Effect.succeed([
						{ data: { percent: 10 } },
						{ event: "done", id: params.id, data: { percent: 100 } },
					]),
				),
				FetchTest.respond(rows, () =>
					Effect.succeed([{ id: 1 }, { id: 2 }]),
				),
			]);
			const [sse, ndjson] = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* Effect.all([
					collect(api.bind(events)({ params: { id: 9 } })),
					collect(api.bind(rows)()),
				]);
			}).pipe(Effect.provide(backend));
			expect(sse).toEqual([
				{ event: "message", id: undefined, data: { percent: 10 } },
				{ event: "done", id: "9", data: { percent: 100 } },
			]);
			expect(ndjson).toEqual([{ id: 1 }, { id: 2 }]);
		}),
	);

	it.effect("round-trip text through FetchTest", () =>
		Effect.gen(function* () {
			const notes = Fetch.endpoint("GET /notes", {
				output: Fetch.text(),
				stream: "sse",
			});
			const sent = [
				{ data: "a\rb" },
				{ event: "note", id: "2", data: "c\r\nd" },
				{ data: "" },
			];
			const received = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* collect(api.bind(notes)());
			}).pipe(
				Effect.provide(
					FetchTest.layer([
						FetchTest.respond(notes, () => Effect.succeed(sent)),
					]),
				),
			);
			// Line ends arrive as \n, as the SSE rules give them.
			expect(received).toEqual([
				{ event: "message", id: undefined, data: "a\nb" },
				{ event: "note", id: "2", data: "c\nd" },
				{ event: "message", id: "2", data: "" },
			]);
		}),
	);

	it.effect("die in FetchTest on values that can't be sent", () =>
		Effect.gen(function* () {
			const notes = Fetch.endpoint("GET /notes", { stream: "sse" });
			const lines = Fetch.endpoint("GET /lines", {
				output: Fetch.text(),
				stream: "ndjson",
			});
			const send = (result: ReadonlyArray<unknown>, sse: boolean) =>
				defectOf(
					Effect.gen(function* () {
						const api = yield* Fetch.make({ baseUrl: base });
						return yield* collect<unknown, unknown, never>(
							sse ? api.bind(notes)() : api.bind(lines)(),
						);
					}).pipe(
						Effect.provide(
							FetchTest.layer([
								sse
									? FetchTest.respond(notes, () =>
											Effect.succeed(result as never),
										)
									: FetchTest.respond(lines, () =>
											Effect.succeed(result as never),
										),
							]),
						),
					),
				);
			expect(yield* send([{ id: "1\nevent: x", data: "x" }], true)).toBe(
				"FetchTest: event 1 the handler for GET /notes returned has a line break in its id or event, which can't be sent",
			);
			expect(yield* send([{ event: "a\rb", data: "x" }], true)).toContain(
				"has a line break in its id or event",
			);
			expect(yield* send(["one", "two\nthree"], false)).toBe(
				"FetchTest: value 2 the handler for GET /lines returned has a line break, which would split it in two lines",
			);
			expect(yield* send(["one", "  "], false)).toBe(
				"FetchTest: value 2 the handler for GET /lines returned is blank, and the client skips blank lines",
			);
		}),
	);

	it.effect("dies in FetchTest when a handler doesn't return a list", () =>
		Effect.gen(function* () {
			const backend = FetchTest.layer([
				FetchTest.respond(rows, () => Effect.succeed({ id: 1 } as never)),
			]);
			const message = yield* defectOf(
				Effect.gen(function* () {
					const api = yield* Fetch.make({ baseUrl: base });
					return yield* collect(api.bind(rows)());
				}).pipe(Effect.provide(backend)),
			);
			expect(message).toBe(
				"FetchTest: the handler for GET /export, a stream endpoint, must return a list of values or a reply",
			);
		}),
	);
});

describe("Fetch.paginate", () => {
	const Todo = Schema.Struct({ id: Schema.Finite });
	const listTodos = Fetch.endpoint("GET /todos", {
		query: Schema.Struct({ page: Schema.Finite }),
		output: Schema.Array(Todo),
	});
	const pages: Record<string, ReadonlyArray<{ id: number }>> = {
		"1": [{ id: 1 }, { id: 2 }],
		"2": [{ id: 3 }],
		"3": [],
	};
	const backend = () =>
		FetchTest.layer([
			FetchTest.respond(listTodos, ({ query }) =>
				Effect.succeed(pages[String(query.page)] ?? []),
			),
		]);

	it.effect("pages by number, and stops", () =>
		Effect.gen(function* () {
			const [all, sent] = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				const all = yield* collect(
					Fetch.paginate(api.bind(listTodos), {
						start: 1,
						request: (page) => ({ query: { page } }),
						next: (todos, page) =>
							todos.length === 0 ? Option.none() : Option.some(page + 1),
					}),
				);
				return [all, yield* FetchTest.requests] as const;
			}).pipe(Effect.provide(backend()));
			// Each page is one value, even when it's a list.
			expect(all).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 3 }], []]);
			expect(sent.map((request) => request.url)).toEqual([
				"https://api.test/todos?page=1",
				"https://api.test/todos?page=2",
				"https://api.test/todos?page=3",
			]);
		}),
	);

	it.effect("is lazy: take(1) sends one request", () =>
		Effect.gen(function* () {
			const sent = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				yield* collect(
					Fetch.paginate(api.bind(listTodos), {
						start: 1,
						request: (page) => ({ query: { page } }),
						next: (_, page) => Option.some(page + 1),
					}).pipe(Stream.take(1)),
				);
				return yield* FetchTest.requests;
			}).pipe(Effect.provide(backend()));
			expect(sent).toHaveLength(1);
		}),
	);

	it.effect("reads a cursor from a Link header", () =>
		Effect.gen(function* () {
			const listByCursor = Fetch.endpoint("GET /items", {
				output: Schema.Array(Todo),
				responseMode: "decoded-and-response",
			});
			const linked = FetchTest.layer([
				FetchTest.respond(listByCursor, ({ query }) =>
					Effect.succeed(
						query.cursor === "b"
							? FetchTest.reply(200, [{ id: 2 }])
							: FetchTest.reply(200, [{ id: 1 }], {
									headers: { link: '</items?cursor=b>; rel="next"' },
								}),
					),
				),
			]);
			const cursorOf = (link: string | undefined) =>
				Option.fromNullishOr(
					/<[^>]*[?&]cursor=([^&>]+)[^>]*>;\s*rel="next"/.exec(
						link ?? "",
					)?.[1],
				);
			const items = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* collect(
					Fetch.paginate(api.bind(listByCursor), {
						start: undefined as string | undefined,
						request: (cursor) =>
							cursor === undefined ? {} : { query: { cursor } },
						next: (_, __, response) => cursorOf(response.headers.link),
					}),
				);
			}).pipe(Effect.provide(linked));
			expect(items).toEqual([[{ id: 1 }], [{ id: 2 }]]);
		}),
	);

	it.effect("keeps the endpoint's responseMode", () =>
		Effect.gen(function* () {
			const listPairs = Fetch.endpoint("GET /pairs", {
				output: Schema.Array(Todo),
				responseMode: "decoded-and-response",
			});
			const seen: Array<unknown> = [];
			const pages = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* collect(
					Fetch.paginate(api.bind(listPairs), {
						start: 1,
						// Not allowed by the types; ignored if given anyway.
						request: () => ({ responseMode: "decoded" }) as never,
						next: (page, _, response) => {
							seen.push(response.status);
							return Option.none();
						},
					}),
				);
			}).pipe(
				Effect.provide(
					FetchTest.layer([
						FetchTest.respond(listPairs, () =>
							Effect.succeed([{ id: 1 }, { id: 2 }]),
						),
					]),
				),
			);
			expect(pages).toEqual([[{ id: 1 }, { id: 2 }]]);
			expect(seen).toEqual([200]);
		}),
	);

	it.effect("fails with the call's error", () =>
		Effect.gen(function* () {
			const failing = FetchTest.layer([FetchTest.fail(listTodos, 503)]);
			const error = yield* Effect.gen(function* () {
				const api = yield* Fetch.make({ baseUrl: base });
				return yield* Effect.flip(
					collect(
						Fetch.paginate(api.bind(listTodos), {
							start: 1,
							request: (page) => ({ query: { page } }),
							next: () => Option.none(),
						}),
					),
				);
			}).pipe(Effect.provide(failing));
			expect(error).toMatchObject({ _tag: "HttpError", status: 503 });
		}),
	);

	it("rejects definitions and stream endpoints", () => {
		expect(() =>
			Fetch.paginate(listTodos as never, {
				start: 1,
				request: () => ({}) as never,
				next: () => Option.none(),
			}),
		).toThrow("Fetch.paginate takes a bound endpoint");
		const streamed = Object.assign(() => Effect.void, {
			route: "GET /rows",
			stream: "ndjson",
		});
		expect(() =>
			Fetch.paginate(streamed as never, {
				start: 1,
				request: () => ({}) as never,
				next: () => Option.none(),
			}),
		).toThrow(
			"Fetch.paginate can't page through GET /rows, whose calls return a stream",
		);
	});
});
