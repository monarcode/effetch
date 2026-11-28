import * as Exit from "effect/Exit";
import * as Headers from "effect/http/Headers";
import * as Option from "effect/Option";
import * as Rpc from "effect/rpc/Rpc";
import * as Schema from "effect/Schema";

import { describe, expect, it } from "vitest";

import {
	DecodeError,
	HttpError,
	isFetchError,
	NetworkError,
} from "../src/Errors.js";

const httpError = () =>
	new HttpError({
		method: "GET",
		url: "https://api.test/me",
		status: 401,
		headers: Headers.fromInput({
			"set-cookie": "session=secret",
			authorization: "Bearer secret",
			"content-type": "application/json",
		}),
		text: "{}",
		body: {},
	});

describe("errors", () => {
	it("have readable messages", () => {
		expect(
			new NetworkError({ method: "GET", url: "/x", cause: null }).message,
		).toBe("GET /x: network error");
		expect(httpError().message).toBe("GET https://api.test/me: HTTP 401");
		expect(
			new DecodeError({
				method: "GET",
				url: "/x",
				status: 200,
				issue: null,
				message: "Expected number",
			}).message,
		).toBe("Expected number");
	});

	it("redact sensitive HttpError headers when serialised", () => {
		const json = JSON.stringify(httpError());
		expect(json).not.toContain("secret");
		expect(json).toContain("application/json");
		expect(httpError().headers["content-type"]).toBe("application/json");
	});

	it("rejects plain objects as HttpError headers", () => {
		expect(
			() =>
				new HttpError({
					method: "GET",
					url: "/x",
					status: 500,
					headers: { a: "b" } as unknown as Headers.Headers,
					text: "",
					body: undefined,
				}),
		).toThrow();
	});

	it("isFetchError recognises the three errors only", () => {
		expect(
			isFetchError(new NetworkError({ method: "GET", url: "/", cause: 1 })),
		).toBe(true);
		expect(isFetchError(httpError())).toBe(true);
		expect(isFetchError(new Error("x"))).toBe(false);
		expect(isFetchError({ _tag: "HttpError" })).toBe(false);
	});

	describe("as JSON", () => {
		// What `Schema.toCodecJson` makes of each class: what an RPC's JSON
		// serialization and effetch-query's server rendering use.
		const roundTrip = <A>(schema: Schema.Codec<A, unknown>, value: A) => {
			const codec = Schema.toCodecJson(schema);
			const wire = JSON.stringify(Schema.encodeUnknownSync(codec)(value));
			return {
				wire,
				back: Schema.decodeUnknownSync(codec)(JSON.parse(wire)),
			};
		};

		it("send an HttpError without its headers", () => {
			const { wire, back } = roundTrip(HttpError, httpError());
			expect(JSON.parse(wire)).toStrictEqual({
				_tag: "HttpError",
				method: "GET",
				url: "https://api.test/me",
				status: 401,
				text: "{}",
				body: {},
			});
			expect(wire).not.toContain("secret");
			expect(wire).not.toContain("content-type");
			expect(back).toBeInstanceOf(HttpError);
			expect(isFetchError(back)).toBe(true);
			expect(back.message).toBe("GET https://api.test/me: HTTP 401");
			expect(back.body).toStrictEqual({});
			expect(Headers.isHeaders(back.headers)).toBe(true);
			expect(Object.keys(back.headers)).toStrictEqual([]);
		});

		it("send an HttpError body only when it's JSON", () => {
			class Problem extends Schema.Class<Problem>("Problem")({
				code: Schema.String,
			}) {}
			const withBody = (body: unknown) =>
				new HttpError({
					method: "GET",
					url: "/x",
					status: 500,
					headers: Headers.empty,
					text: '{"code":"down"}',
					body,
				});
			for (const body of [undefined, new Problem({ code: "down" })]) {
				const { wire, back } = roundTrip(HttpError, withBody(body));
				expect(JSON.parse(wire)).not.toHaveProperty("body");
				expect(back.body).toBeUndefined();
				expect(back.text).toBe('{"code":"down"}');
			}
			expect(
				roundTrip(HttpError, withBody(["a", 1, null])).back.body,
			).toStrictEqual(["a", 1, null]);
		});

		it("send a NetworkError without its cause", () => {
			const { wire, back } = roundTrip(
				NetworkError,
				new NetworkError({
					method: "GET",
					url: "/x",
					cause: new TypeError("fetch failed"),
				}),
			);
			expect(JSON.parse(wire)).toStrictEqual({
				_tag: "NetworkError",
				method: "GET",
				url: "/x",
			});
			expect(back).toBeInstanceOf(NetworkError);
			expect(back.cause).toBeUndefined();
			expect(back.message).toBe("GET /x: network error");
		});

		it("send a DecodeError without its issue", () => {
			const { wire, back } = roundTrip(
				DecodeError,
				new DecodeError({
					method: "GET",
					url: "/x",
					status: 200,
					issue: new SyntaxError("Unexpected token"),
					message: "Unexpected token",
				}),
			);
			expect(JSON.parse(wire)).toStrictEqual({
				_tag: "DecodeError",
				method: "GET",
				url: "/x",
				status: 200,
				message: "Unexpected token",
			});
			expect(back).toBeInstanceOf(DecodeError);
			expect(back.issue).toBeUndefined();
			expect(back.message).toBe("Unexpected token");
		});

		it("never take headers from what's decoded", () => {
			const decode = <A>(schema: Schema.Codec<A, unknown>, input: unknown) =>
				Schema.decodeUnknownSync(Schema.toCodecJson(schema))(input);
			const http = decode(HttpError, {
				_tag: "HttpError",
				method: "GET",
				url: "/x",
				status: 500,
				text: "",
				headers: { "set-cookie": "session=secret" },
			});
			expect(Object.keys(http.headers)).toStrictEqual([]);
			expect(http.body).toBeUndefined();
			expect(
				decode(NetworkError, {
					_tag: "NetworkError",
					method: "GET",
					url: "/x",
				}).cause,
			).toBeUndefined();
		});

		it("still decode values built in memory, as before", () => {
			// Their own schema, not its JSON form: a copy of an error decodes
			// whatever its body, and keeps its headers, cause and issue.
			class Problem extends Schema.Class<Problem>("Problem")({
				code: Schema.String,
			}) {}
			for (const body of [undefined, new Problem({ code: "x" })]) {
				const decoded = Schema.decodeUnknownSync(HttpError)({
					...httpError(),
					body,
				});
				expect(decoded.body).toBe(body);
				expect(decoded.headers["content-type"]).toBe("application/json");
			}
			const cause = new TypeError("fetch failed");
			expect(
				Schema.decodeUnknownSync(NetworkError)({
					_tag: "NetworkError",
					method: "GET",
					url: "/x",
					cause,
				}).cause,
			).toBe(cause);
		});

		it("cross an RPC as its error", () => {
			const GetMe = Rpc.make("GetMe", {
				error: Schema.Union([HttpError, NetworkError, DecodeError]),
			});
			// What RpcSerialization.json does with a result.
			const codec = Schema.toCodecJson(Rpc.exitSchema(GetMe));
			const wire = JSON.stringify(
				Schema.encodeUnknownSync(codec)(Exit.fail(httpError())),
			);
			expect(wire).not.toContain("secret");
			const error = Exit.findErrorOption(
				Schema.decodeUnknownSync(codec)(JSON.parse(wire)) as Exit.Exit<
					void,
					HttpError | NetworkError | DecodeError
				>,
			);
			expect(Option.isSome(error)).toBe(true);
			expect(Option.getOrThrow(error)).toBeInstanceOf(HttpError);
			expect(Option.getOrThrow(error)).toMatchObject({ status: 401 });
		});
	});
});
