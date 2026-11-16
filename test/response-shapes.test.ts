import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import * as Fetch from "../src/index.js";
import { base, setup, wire } from "./utils/client.js";
import { reply } from "./utils/reply.js";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const todo = { id: 1, title: "Write docs" };
const withTotal = reply.json([todo], { headers: { "x-total-count": "42" } });

describe("responseMode", () => {
	it.effect("gives the decoded body and the response together", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([withTotal]);
			const result = yield* api.get("/todos", {
				output: Schema.Array(Todo),
				responseMode: "decoded-and-response",
			});
			const [todos, response] = result;
			expect(todos).toEqual([todo]);
			expect(response.status).toBe(200);
			expect(response.headers["x-total-count"]).toBe("42");
			expect(Object.isFrozen(result)).toBe(true);
		}),
	);

	it.effect('gives the decoded body alone with "decoded", the default', () =>
		Effect.gen(function* () {
			const { api } = yield* setup([withTotal]);
			const explicit = yield* api.get("/todos", {
				output: Schema.Array(Todo),
				responseMode: "decoded",
			});
			const implicit = yield* api.get("/todos", {
				output: Schema.Array(Todo),
			});
			expect(explicit).toEqual([todo]);
			expect(implicit).toEqual([todo]);
		}),
	);

	it.effect("gives the response twice without output, its body unread", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.text("raw")]);
			const [response, same] = yield* api.post("/x", {
				body: {},
				responseMode: "decoded-and-response",
			});
			expect(same).toBe(response);
			expect(yield* response.text).toBe("raw");
		}),
	);

	it.effect("leaves the body readable after decoding it", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([withTotal]);
			const [, response] = yield* api.get("/todos", {
				output: Schema.Array(Todo),
				responseMode: "decoded-and-response",
			});
			expect(yield* response.text).toBe(JSON.stringify([todo]));
		}),
	);

	it.effect("fails as usual, without the pair, on an error status", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.json({}, { status: 404 })]);
			const error = yield* Effect.flip(
				api.get("/todos", {
					output: Schema.Array(Todo),
					responseMode: "decoded-and-response",
				}),
			);
			expect(error).toMatchObject({ _tag: "HttpError", status: 404 });
		}),
	);

	it.effect("works on request", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([withTotal]);
			const [todos, response] = yield* api.request("GET", "/todos", {
				output: Schema.Array(Todo),
				responseMode: "decoded-and-response",
			});
			expect(todos).toEqual([todo]);
			expect(response.status).toBe(200);
		}),
	);

	it.effect("is taken from client.endpoint, and a call's own wins", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([withTotal]);
			const list = api.endpoint("GET /todos", {
				output: Schema.Array(Todo),
				responseMode: "decoded-and-response",
			});
			expect(list.responseMode).toBe("decoded-and-response");
			const [todos, response] = yield* list();
			expect(todos).toEqual([todo]);
			expect(response.headers["x-total-count"]).toBe("42");
			expect(yield* list({ responseMode: "decoded" })).toEqual([todo]);
			const plain = api.endpoint("GET /todos", {
				output: Schema.Array(Todo),
			});
			expect(plain.responseMode).toBeUndefined();
			const [again] = yield* plain({ responseMode: "decoded-and-response" });
			expect(again).toEqual([todo]);
		}),
	);

	it.effect("is kept by Fetch.endpoint, bind and bindAll", () =>
		Effect.gen(function* () {
			const definition = Fetch.endpoint("GET /todos", {
				output: Schema.Array(Todo),
				responseMode: "decoded-and-response",
			});
			expect(definition.responseMode).toBe("decoded-and-response");
			const { api } = yield* setup([withTotal]);
			const bound = api.bind(definition, { headers: { "x-a": "1" } });
			expect(bound.responseMode).toBe("decoded-and-response");
			const [, response] = yield* bound();
			expect(response.status).toBe(200);
			const { list } = api.bindAll({ list: definition });
			const [todos] = yield* list();
			expect(todos).toEqual([todo]);
			expect(yield* list({ responseMode: "decoded" })).toEqual([todo]);
		}),
	);
});

describe("Fetch.text", () => {
	it.effect("reads the body as text, with Accept: text/*", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([
				reply.text("a,b\n1,2", { headers: { "content-type": "text/csv" } }),
			]);
			const csv = yield* api.get("/export.csv", { output: Fetch.text() });
			expect(csv).toBe("a,b\n1,2");
			expect(wire(mock).headers.accept).toBe("text/*, */*;q=0.1");
		}),
	);

	it.effect("reads a JSON body as its text", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.json({ id: 1 })]);
			const text = yield* api.get("/x", { output: Fetch.text() });
			expect(text).toBe('{"id":1}');
		}),
	);

	it.effect("decodes the text with a schema", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.text("42")]);
			const count = yield* api.get("/count", {
				output: Fetch.text(Schema.NumberFromString),
			});
			expect(count).toBe(42);
		}),
	);

	it.effect("keeps the mark when checks and annotations are added", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.text("hello")]);
			const output = Fetch.text(Schema.String)
				.check(Schema.isMinLength(1))
				.annotate({ description: "A greeting" });
			expect(yield* api.get("/x", { output })).toBe("hello");
			const checked = Fetch.text(Schema.String.check(Schema.isMinLength(1)));
			expect(yield* api.get("/x", { output: checked })).toBe("hello");
			expect(wire(mock, 1).headers.accept).toBe("text/*, */*;q=0.1");
		}),
	);

	it.effect('reads an empty body as ""', () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.empty(204)]);
			expect(yield* api.post("/x", { output: Fetch.text() })).toBe("");
		}),
	);

	it.effect("keeps the text as sent without a schema", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.text("  a,b\n")]);
			expect(yield* api.get("/x", { output: Fetch.text() })).toBe("  a,b\n");
		}),
	);

	it.effect("trims the text before a schema decodes it", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.text("up\n"),
				reply.text(" 42 \n"),
			]);
			const status = yield* api.get("/health", {
				output: Fetch.text(Schema.Literals(["up", "down"])),
			});
			expect(status).toBe("up");
			const count = yield* api.get("/count", {
				output: Fetch.text(Schema.NumberFromString),
			});
			expect(count).toBe(42);
		}),
	);

	it.effect.each([
		["empty", reply.empty(204)],
		["blank", reply.text("  \n")],
	] as const)(
		"fails with DecodeError for an %s body with a schema",
		([, body]) =>
			Effect.gen(function* () {
				const { api } = yield* setup([body]);
				const error = yield* Effect.flip(
					api.get("/count", {
						output: Fetch.text(Schema.NumberFromString),
					}),
				);
				expect(error).toBeInstanceOf(Fetch.DecodeError);
				expect(error.message).toContain("The response body is empty");
			}),
	);

	it.effect("fails with DecodeError when the text doesn't match", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.text("many"), reply.empty(204)]);
			const many = yield* Effect.flip(
				api.get("/count", { output: Fetch.text(Schema.Literal("ok")) }),
			);
			expect(many).toBeInstanceOf(Fetch.DecodeError);
			expect(many).toMatchObject({ status: 200, url: `${base}/count` });
			const empty = yield* Effect.flip(
				api.get("/count", {
					output: Fetch.text(Schema.String.check(Schema.isMinLength(1))),
				}),
			);
			expect(empty).toBeInstanceOf(Fetch.DecodeError);
		}),
	);

	it.effect("keeps an Accept header from the call or the client", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.text("x")], {
				headers: { accept: "text/csv" },
			});
			yield* api.get("/a", { output: Fetch.text() });
			yield* api.get("/b", {
				output: Fetch.text(),
				headers: { accept: "text/plain" },
			});
			expect(wire(mock, 0).headers.accept).toBe("text/csv");
			expect(wire(mock, 1).headers.accept).toBe("text/plain");
		}),
	);

	it.effect("still reads error bodies as JSON", () =>
		Effect.gen(function* () {
			class Missing extends Schema.TaggedError<Missing>()("Missing", {
				reason: Schema.String,
			}) {}
			const { api } = yield* setup([
				reply.json({ reason: "gone" }, { status: 404 }),
				reply.json({ code: "x" }, { status: 500 }),
			]);
			const missing = yield* Effect.flip(
				api.get("/x", {
					output: Fetch.text(),
					statusErrors: { 404: Missing },
				}),
			);
			expect(missing).toBeInstanceOf(Missing);
			const other = yield* Effect.flip(
				api.get("/x", { output: Fetch.text() }),
			);
			expect(other).toMatchObject({
				_tag: "HttpError",
				body: { code: "x" },
			});
		}),
	);

	it.effect("works on endpoints, with the response too", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([
				reply.text("token", { headers: { "x-expires": "60" } }),
			]);
			const token = api.bind(
				Fetch.endpoint("POST /token", {
					output: Fetch.text(),
					responseMode: "decoded-and-response",
				}),
			);
			const [value, response] = yield* token();
			expect(value).toBe("token");
			expect(response.headers["x-expires"]).toBe("60");
			expect(wire(mock).headers.accept).toBe("text/*, */*;q=0.1");
		}),
	);
});

describe("Fetch.bytes", () => {
	it.effect("reads the body as a Uint8Array, with Accept: */*", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([
				reply.text("PNG", { headers: { "content-type": "image/png" } }),
			]);
			const bytes = yield* api.get("/avatar", { output: Fetch.bytes() });
			expect(bytes).toBeInstanceOf(Uint8Array);
			expect([...bytes]).toEqual([80, 78, 71]);
			expect(wire(mock).headers.accept).toBe("*/*");
		}),
	);

	it.effect("gives a copy, so the response still reads its body", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.text("body")]);
			const [bytes, response] = yield* api.get("/x", {
				output: Fetch.bytes(),
				responseMode: "decoded-and-response",
			});
			bytes.fill(120);
			expect(yield* response.text).toBe("body");
		}),
	);

	it.effect("reads an empty body as an empty Uint8Array", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.empty(204)]);
			const bytes = yield* api.post("/x", { output: Fetch.bytes() });
			expect(bytes).toBeInstanceOf(Uint8Array);
			expect(bytes.length).toBe(0);
		}),
	);

	it.effect.each(["bytes", "text"] as const)(
		"fails with DecodeError when the body can't be read, as %s",
		(format) =>
			Effect.gen(function* () {
				const broken = Fetch.plugin({
					name: "broken",
					onResponse: (response) =>
						Effect.succeed(
							HttpClientResponse.fromWeb(
								response.request,
								new Response(
									new ReadableStream({
										start: (controller) =>
											controller.error(new Error("reset")),
									}),
								),
							),
						),
				});
				const { api } = yield* setup([reply.text("x")], {
					plugins: [broken],
				});
				const error = yield* Effect.flip(
					api.get("/x", {
						output: format === "bytes" ? Fetch.bytes() : Fetch.text(),
					}),
				);
				expect(error).toBeInstanceOf(Fetch.DecodeError);
				expect(error.message).toContain("Failed to read the response body");
			}),
	);
});
