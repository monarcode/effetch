import * as UrlParams from "effect/http/UrlParams";

import { describe, expect, it } from "vitest";

import { toUrlParams } from "../src/internal/query.js";
import { redacted, supportsRedactedQuery } from "./utils/redacted.js";

const entries = (query: Parameters<typeof toUrlParams>[0]) => [
	...toUrlParams(query),
];

describe("toUrlParams", () => {
	it("is empty without a query", () => {
		expect(entries(undefined)).toEqual([]);
		expect(entries({})).toEqual([]);
	});

	it("stringifies strings, numbers, booleans and bigints", () => {
		expect(
			entries({ s: "a", n: 1, f: 1.5, t: true, no: false, big: 10n }),
		).toEqual([
			["s", "a"],
			["n", "1"],
			["f", "1.5"],
			["t", "true"],
			["no", "false"],
			["big", "10"],
		]);
	});

	it("keeps falsy values that aren't null or undefined", () => {
		expect(entries({ zero: 0, empty: "", no: false })).toEqual([
			["zero", "0"],
			["empty", ""],
			["no", "false"],
		]);
	});

	it("drops null and undefined", () => {
		expect(entries({ a: null, b: undefined, c: "keep" })).toEqual([
			["c", "keep"],
		]);
	});

	it("repeats the key for arrays", () => {
		expect(entries({ tags: ["a", "b"], page: 1 })).toEqual([
			["tags", "a"],
			["tags", "b"],
			["page", "1"],
		]);
	});

	it("drops null and undefined array items, not other falsy ones", () => {
		expect(entries({ tags: ["a", null, undefined, 0, "", false] })).toEqual([
			["tags", "a"],
			["tags", "0"],
			["tags", ""],
			["tags", "false"],
		]);
	});

	it("omits empty arrays", () => {
		expect(entries({ tags: [] })).toEqual([]);
	});

	it.runIf(supportsRedactedQuery)(
		"keeps Redacted values, and serialises them as their value",
		() => {
			const token = redacted("s3cret");
			const params = toUrlParams({ token, ids: [redacted("a b"), 2] });
			expect(entries({ token })).toEqual([["token", token]]);
			expect(UrlParams.toString(params)).toBe("token=s3cret&ids=a+b&ids=2");
			expect(JSON.stringify(params)).not.toContain("s3cret");
		},
	);

	it("serialises with URL encoding", () => {
		expect(
			UrlParams.toString(
				toUrlParams({ q: "a b&c", tags: ["x", "y"], city: "São Paulo" }),
			),
		).toBe("q=a+b%26c&tags=x&tags=y&city=S%C3%A3o+Paulo");
	});
});
