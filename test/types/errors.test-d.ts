import type * as Headers from "effect/http/Headers";
import * as Schema from "effect/Schema";

import { describe, expectTypeOf, it } from "vitest";

import { Fetch } from "../../src/index.js";

// The errors' JSON encoding leaves fields out, but what you construct them
// with and read from them is unchanged: code that builds them by hand, such
// as effetch-query's, keeps compiling.
describe("error classes", () => {
	it("take the same constructor arguments", () => {
		expectTypeOf<
			Omit<ConstructorParameters<typeof Fetch.HttpError>[0], "_tag">
		>().toEqualTypeOf<{
			readonly method: string;
			readonly url: string;
			readonly status: number;
			readonly headers: Headers.Headers;
			readonly text: string;
			readonly body: unknown;
		}>();
		expectTypeOf<
			Omit<ConstructorParameters<typeof Fetch.NetworkError>[0], "_tag">
		>().toEqualTypeOf<{
			readonly method: string;
			readonly url: string;
			readonly cause: unknown;
		}>();
		expectTypeOf<
			Omit<ConstructorParameters<typeof Fetch.DecodeError>[0], "_tag">
		>().toEqualTypeOf<{
			readonly method: string;
			readonly url: string;
			readonly status: number;
			readonly issue: unknown;
			readonly message: string;
		}>();
	});

	it("keep their fields", () => {
		expectTypeOf<
			Fetch.HttpError["headers"]
		>().toEqualTypeOf<Headers.Headers>();
		expectTypeOf<Fetch.HttpError["body"]>().toEqualTypeOf<unknown>();
		expectTypeOf<Fetch.NetworkError["cause"]>().toEqualTypeOf<unknown>();
		expectTypeOf<Fetch.DecodeError["issue"]>().toEqualTypeOf<unknown>();
	});

	it("encode to what they send", () => {
		expectTypeOf<
			Schema.Codec.Encoded<typeof Fetch.HttpError>
		>().toEqualTypeOf<{
			readonly _tag: "HttpError";
			readonly method: string;
			readonly url: string;
			readonly status: number;
			readonly headers?: unknown;
			readonly text: string;
			readonly body?: unknown;
		}>();
		expectTypeOf(Schema.toCodecJson(Fetch.NetworkError)).toExtend<
			Schema.Codec<Fetch.NetworkError, Schema.Json>
		>();
	});
});
