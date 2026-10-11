import * as Headers from "effect/http/Headers";

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
});
