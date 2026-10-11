import { it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SchemaIssue from "effect/SchemaIssue";

import { describe, expect } from "vitest";

import { DecodeError, HttpError } from "../src/Errors.js";
import { checkStatus, decodeOutput } from "../src/internal/response.js";
import { type Reply, reply, respond } from "./utils/reply.js";

const url = "https://api.test/todos/1";

const send = (next: Reply) => respond(next, url);

const unreadable = (status: number) =>
	HttpClientResponse.fromWeb(
		HttpClientRequest.get(url),
		new Response(
			new ReadableStream({
				start: (controller) => controller.error(new Error("stream broke")),
			}),
			{ status },
		),
	);

const withSecretQuery = [
	HttpClientRequest.get(`${url}?api_key=secret#frag`),
	HttpClientRequest.get(url).pipe(
		HttpClientRequest.setUrlParam("api_key", "secret"),
	),
];

const Todo = Schema.Struct({ id: Schema.Number, title: Schema.String });
const ApiError = Schema.Struct({ code: Schema.String });

class Locale extends Context.Service<Locale, { readonly tag: string }>()(
	"Locale",
) {}

const Localized = Schema.String.pipe(
	Schema.decode({
		decode: SchemaGetter.transformEffect((s: string) =>
			Effect.map(Effect.service(Locale), (l) => `${l.tag}:${s}`),
		),
		encode: SchemaGetter.passthrough(),
	}),
);

describe("checkStatus", () => {
	it.effect("passes 2xx responses through unchanged", () =>
		Effect.gen(function* () {
			for (const status of [200, 201, 204, 299]) {
				const response = send(reply.empty(status));
				expect(yield* checkStatus(response)).toBe(response);
			}
		}),
	);

	it.effect("fails a non-2xx response with an HttpError", () =>
		Effect.gen(function* () {
			const response = send(
				reply.json(
					{ code: "not_found" },
					{ status: 404, headers: { "x-request-id": "r1" } },
				),
			);
			const error = yield* Effect.flip(checkStatus(response, ApiError));
			expect(error).toBeInstanceOf(HttpError);
			expect(error._tag).toBe("HttpError");
			expect(error.method).toBe("GET");
			expect(error.url).toBe(url);
			expect(error.status).toBe(404);
			expect(error.headers["x-request-id"]).toBe("r1");
			expect(error.text).toBe('{"code":"not_found"}');
			expect(error.body).toEqual({ code: "not_found" });
			expect(error.message).toBe(`GET ${url}: HTTP 404`);
		}),
	);

	it.effect("treats 3xx, 4xx and 5xx as errors", () =>
		Effect.gen(function* () {
			for (const status of [300, 301, 304, 400, 401, 500, 503]) {
				const error = yield* Effect.flip(
					checkStatus(send(reply.empty(status))),
				);
				expect(error.status).toBe(status);
			}
		}),
	);

	it.effect("parses the JSON body when there is no error schema", () =>
		Effect.gen(function* () {
			const bodies: ReadonlyArray<readonly [string, unknown]> = [
				['{"a":1}', { a: 1 }],
				["[1,2]", [1, 2]],
				["null", null],
				["0", 0],
				['"text"', "text"],
			];
			for (const [text, expected] of bodies) {
				const response = send(reply.text(text, { status: 400 }));
				const error = yield* Effect.flip(checkStatus(response));
				expect(error.body).toEqual(expected);
				expect(error.text).toBe(text);
			}
		}),
	);

	it.effect("leaves body undefined when the error schema doesn't match", () =>
		Effect.gen(function* () {
			const response = send(
				reply.json({ message: "nope" }, { status: 422 }),
			);
			const error = yield* Effect.flip(checkStatus(response, ApiError));
			expect(error.body).toBeUndefined();
			expect(error.text).toBe('{"message":"nope"}');
		}),
	);

	it.effect("leaves body undefined for an empty or non-JSON body", () =>
		Effect.gen(function* () {
			const html = "<html><body>Bad gateway</body></html>";
			const replies = [
				reply.empty(500),
				reply.text(" \n", { status: 500 }),
				reply.text(html, {
					status: 502,
					headers: { "content-type": "text/html" },
				}),
			];
			for (const next of replies) {
				for (const schema of [
					undefined,
					ApiError,
					Schema.NullOr(ApiError),
				]) {
					const error = yield* Effect.flip(
						checkStatus(send(next), schema),
					);
					expect(error.text).toBe(next.body ?? "");
					expect(error.body).toBeUndefined();
				}
			}
		}),
	);

	it.effect("has an empty text when the body can't be read", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				checkStatus(unreadable(500), ApiError),
			);
			expect(error.status).toBe(500);
			expect(error.text).toBe("");
			expect(error.body).toBeUndefined();
		}),
	);

	it.effect("leaves the query string and fragment out of the error", () =>
		Effect.gen(function* () {
			for (const request of withSecretQuery) {
				const error = yield* Effect.flip(
					checkStatus(respond(reply.empty(500), request)),
				);
				expect(error.url).toBe(url);
				expect(error.message).not.toContain("secret");
			}
		}),
	);

	it.effect("uses the error schema's decoding services", () =>
		Effect.gen(function* () {
			const response = send(reply.json("boom", { status: 400 }));
			const error = yield* Effect.flip(
				checkStatus(response, Localized),
			).pipe(Effect.provideService(Locale, { tag: "en" }));
			expect(error.body).toBe("en:boom");
		}),
	);
});

describe("decodeOutput", () => {
	it.effect("decodes a JSON body", () =>
		Effect.gen(function* () {
			const response = send(reply.json({ id: 1, title: "Write docs" }));
			expect(yield* decodeOutput(response, Todo)).toEqual({
				id: 1,
				title: "Write docs",
			});
		}),
	);

	it.effect("applies the schema's transformations", () =>
		Effect.gen(function* () {
			const response = send(reply.json({ at: "2026-10-11T00:00:00.000Z" }));
			const decoded = yield* decodeOutput(
				response,
				Schema.Struct({ at: Schema.Date }),
			);
			expect(decoded.at).toBeInstanceOf(Date);
			expect(decoded.at.toISOString()).toBe("2026-10-11T00:00:00.000Z");
		}),
	);

	it.effect("ignores the content type", () =>
		Effect.gen(function* () {
			const response = send(reply.text('{"id":1,"title":"x"}'));
			expect(yield* decodeOutput(response, Todo)).toEqual({
				id: 1,
				title: "x",
			});
		}),
	);

	it.effect("fails with a DecodeError when the body doesn't match", () =>
		Effect.gen(function* () {
			const response = send(
				reply.json({ id: "one", title: "x" }, { status: 201 }),
			);
			const error = yield* Effect.flip(decodeOutput(response, Todo));
			expect(error).toBeInstanceOf(DecodeError);
			expect(error._tag).toBe("DecodeError");
			expect(error.method).toBe("GET");
			expect(error.url).toBe(url);
			expect(error.status).toBe(201);
			expect(SchemaIssue.isIssue(error.issue)).toBe(true);
			expect(error.message).toContain('["id"]');
		}),
	);

	it.effect("leaves the query string and fragment out of the error", () =>
		Effect.gen(function* () {
			for (const request of withSecretQuery) {
				const error = yield* Effect.flip(
					decodeOutput(respond(reply.json({ id: "one" }), request), Todo),
				);
				expect(error.url).toBe(url);
			}
		}),
	);

	it.effect("fails with a DecodeError on invalid JSON", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				decodeOutput(send(reply.text("{not json")), Todo),
			);
			expect(error.status).toBe(200);
			expect(error.message).toMatch(/^The response body isn't valid JSON: /);
			expect(error.issue).toBeInstanceOf(SyntaxError);
		}),
	);

	it.effect("fails with a DecodeError when the body can't be read", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(decodeOutput(unreadable(200), Todo));
			expect(error.message).toBe(
				"Failed to read the response body: stream broke",
			);
		}),
	);

	it.effect("decodes an empty or whitespace body as JSON null", () =>
		Effect.gen(function* () {
			const cases: ReadonlyArray<
				readonly [Schema.Codec<unknown, unknown>, unknown]
			> = [
				[Schema.Void, undefined],
				[Schema.Undefined, undefined],
				[Schema.UndefinedOr(Todo), undefined],
				[Schema.NullOr(Todo), null],
				[Schema.Unknown, null],
			];
			for (const next of [
				reply.empty(204),
				reply.text(""),
				reply.text("\n "),
			]) {
				for (const [schema, expected] of cases) {
					expect(yield* decodeOutput(send(next), schema)).toBe(expected);
				}
			}
		}),
	);

	it.effect("says the body is empty when the schema requires a value", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				decodeOutput(send(reply.empty(204)), Todo),
			);
			expect(error.status).toBe(204);
			expect(SchemaIssue.isIssue(error.issue)).toBe(true);
			expect(error.message).toMatch(
				/^The response body is empty, but the output schema requires a value: /,
			);
		}),
	);

	it.effect("uses the output schema's decoding services", () =>
		Effect.gen(function* () {
			const response = send(reply.json("hello"));
			expect(
				yield* decodeOutput(response, Localized).pipe(
					Effect.provideService(Locale, { tag: "fr" }),
				),
			).toBe("fr:hello");
		}),
	);
});
