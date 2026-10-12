import type * as Effect from "effect/Effect";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import { describe, expectTypeOf, it } from "vitest";

import type { DecodeError, HttpError } from "../../src/Errors.js";
import { checkStatus, decodeOutput } from "../../src/internal/response.js";

declare const response: HttpClientResponse.HttpClientResponse;

const Todo = Schema.Struct({ id: Schema.Finite });
const ApiError = Schema.Struct({ code: Schema.String });

interface Locale {
	readonly _: unique symbol;
}
declare const Localized: Schema.Codec<string, string, Locale, never>;
declare const maybeApiError: typeof ApiError | undefined;

describe("checkStatus", () => {
	it("keeps the response and types the body as unknown without a schema", () => {
		expectTypeOf(checkStatus(response)).toEqualTypeOf<
			Effect.Effect<
				HttpClientResponse.HttpClientResponse,
				HttpError.With<unknown>,
				never
			>
		>();
	});

	it("types the body with the error schema", () => {
		expectTypeOf(checkStatus(response, ApiError)).toEqualTypeOf<
			Effect.Effect<
				HttpClientResponse.HttpClientResponse,
				HttpError.With<{ readonly code: string }>,
				never
			>
		>();
	});

	it("types the body as unknown when the schema may be undefined", () => {
		expectTypeOf(checkStatus(response, maybeApiError)).toEqualTypeOf<
			Effect.Effect<
				HttpClientResponse.HttpClientResponse,
				HttpError.With<unknown>,
				never
			>
		>();
	});

	it("requires the error schema's decoding services", () => {
		expectTypeOf(checkStatus(response, Localized)).toEqualTypeOf<
			Effect.Effect<
				HttpClientResponse.HttpClientResponse,
				HttpError.With<string>,
				Locale
			>
		>();
	});
});

describe("decodeOutput", () => {
	it("succeeds with the schema's type and fails with DecodeError", () => {
		expectTypeOf(decodeOutput(response, Todo)).toEqualTypeOf<
			Effect.Effect<{ readonly id: number }, DecodeError, never>
		>();
	});

	it("requires the output schema's decoding services", () => {
		expectTypeOf(decodeOutput(response, Localized)).toEqualTypeOf<
			Effect.Effect<string, DecodeError, Locale>
		>();
	});
});
