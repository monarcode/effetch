// Type tests build Effects only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";
import * as Schema from "effect/Schema";

import { describe, expectTypeOf, it } from "vitest";

import * as Fetch from "../../src/index.js";

const ApiError = Schema.Struct({ code: Schema.String });
const Todo = Schema.Struct({ id: Schema.Number });

class Origin extends Context.Service<Origin, string>()("Origin") {}

describe("make", () => {
	it("needs an HttpClient and makes a Client with an unknown error body", () => {
		expectTypeOf(Fetch.make()).toEqualTypeOf<
			Effect.Effect<
				Fetch.Client<[], Schema.Unknown>,
				never,
				HttpClient.HttpClient
			>
		>();
		expectTypeOf(Fetch.make({ baseUrl: "https://api.test" })).toEqualTypeOf<
			Effect.Effect<
				Fetch.Client<[], Schema.Unknown>,
				never,
				HttpClient.HttpClient
			>
		>();
	});

	it("types the client's error schema", () => {
		expectTypeOf(Fetch.make({ error: ApiError })).toEqualTypeOf<
			Effect.Effect<
				Fetch.Client<[], typeof ApiError>,
				never,
				HttpClient.HttpClient
			>
		>();
	});

	it("carries the baseUrl Effect's error and services", () => {
		const fromConfig = Fetch.make({ baseUrl: Config.String("API_URL") });
		expectTypeOf<
			Effect.Error<typeof fromConfig>
		>().toEqualTypeOf<Config.ConfigError>();
		const fromService = Fetch.make({ baseUrl: Effect.service(Origin) });
		expectTypeOf<Effect.Services<typeof fromService>>().toEqualTypeOf<
			HttpClient.HttpClient | Origin
		>();
	});

	it("has defaults for every ClientConfig type parameter", () => {
		const config: Fetch.ClientConfig = {
			baseUrl: "https://api.test",
			headers: { accept: "application/json" },
		};
		expectTypeOf(config).toEqualTypeOf<
			Fetch.ClientConfig<Schema.Unknown, never, never>
		>();
		expectTypeOf(Fetch.make(config)).toEqualTypeOf<
			Effect.Effect<
				Fetch.Client<[], Schema.Unknown>,
				never,
				HttpClient.HttpClient
			>
		>();
	});

	it("rejects options it doesn't know", () => {
		// @ts-expect-error there is no such option
		Fetch.make({ baseURL: "https://api.test" });
		// @ts-expect-error baseUrl is a string or an Effect of one
		Fetch.make({ baseUrl: 42 });
	});
});

declare const api: Fetch.Client<[], typeof ApiError>;

describe("Client", () => {
	it("types HttpError.body with the client's error schema", () => {
		const call = api.get("/todos");
		expectTypeOf<
			Extract<
				Effect.Error<typeof call>,
				{ readonly _tag: "HttpError" }
			>["body"]
		>().toEqualTypeOf<{ readonly code: string } | undefined>();
	});

	it("exposes every method with its body rule", () => {
		api.get("/todos/:id", { params: { id: 1 }, output: Todo });
		api.head("/todos");
		api.options("/todos");
		api.post("/todos", { body: {} });
		api.put("/todos/:id", { params: { id: 1 }, body: {} });
		api.patch("/todos/:id", { params: { id: 1 }, body: {} });
		api.del("/todos/:id", { params: { id: 1 } });
		api.request("TRACE", "/todos");
		// @ts-expect-error head takes no body
		api.head("/todos", { body: {} });
		// @ts-expect-error the :id param is required
		api.del("/todos/:id");
		// @ts-expect-error not an HTTP method
		api.request("FETCH", "/todos");
	});

	it("exposes the HttpClient with NetworkError as its error", () => {
		expectTypeOf(api.httpClient).toEqualTypeOf<
			HttpClient.HttpClient.With<Fetch.NetworkError>
		>();
	});

	it("needs no services for plain schemas", () => {
		const call = api.post("/todos", { body: {}, output: Todo });
		expectTypeOf<Effect.Services<typeof call>>().toBeNever();
	});
});
