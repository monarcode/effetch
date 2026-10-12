// Type tests build Effects only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Schema from "effect/Schema";

import { describe, expectTypeOf, it } from "vitest";

import * as Fetch from "../../src/index.js";

const ApiError = Schema.Struct({ code: Schema.String });
const Todo = Schema.Struct({ id: Schema.Finite });

class Origin extends Context.Service<Origin, string>()("Origin") {}
class Session extends Context.Service<Session, string>()("Session") {}
class TokenError extends Data.TaggedError("TokenError")<{}> {}
class Unavailable extends Data.TaggedError("Unavailable")<{}> {}

declare const token: Effect.Effect<string, TokenError, Session>;

const bearer = Fetch.plugin({
	name: "bearer",
	onRequest: (request) =>
		Effect.map(token, (value) =>
			HttpClientRequest.bearerToken(request, value),
		),
});

const retry = Fetch.plugin({
	name: "retry",
	defaults: { times: 2 },
	wrap: (client) => HttpClient.retry(client, { times: 2 }),
});

const unavailable = Fetch.plugin({
	name: "unavailable",
	wrap: (client) =>
		HttpClient.transformResponse(client, (response) =>
			Effect.gen(function* () {
				const received = yield* response;
				if (received.status === 503) {
					return yield* new Unavailable();
				}
				return received;
			}),
		),
});

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
			Fetch.ClientConfig<[], Schema.Unknown, never, never>
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

describe("make with plugins", () => {
	it("requires the plugins' services from make", () => {
		expectTypeOf(Fetch.make({ plugins: [bearer, retry] })).toEqualTypeOf<
			Effect.Effect<
				Fetch.Client<
					readonly [typeof bearer, typeof retry],
					Schema.Unknown
				>,
				never,
				HttpClient.HttpClient | Session
			>
		>();
	});

	it("rejects things that aren't plugins", () => {
		// @ts-expect-error a plugin needs a name
		Fetch.make({ plugins: [{ onRequest: Effect.succeed }] });
		// @ts-expect-error plugins is a list
		Fetch.make({ plugins: bearer });
	});
});

const inline = Fetch.make({
	plugins: [
		Fetch.plugin({
			name: "plain",
			onRequest: (request) => Effect.succeed(request),
		}),
		Fetch.plugin({
			name: "withOptions",
			defaults: { version: "1" },
			onRequest: (request, ctx) =>
				Effect.succeed(
					HttpClientRequest.setHeader(
						request,
						"x-version",
						ctx.options.version,
					),
				),
		}),
	],
});
declare const inlineApi: Effect.Success<typeof inline>;

describe("make with plugins written inline", () => {
	it("infers their errors, services and options, not any", () => {
		expectTypeOf<
			Effect.Services<typeof inline>
		>().toEqualTypeOf<HttpClient.HttpClient>();
		const call = inlineApi.get("/todos");
		expectTypeOf<Effect.Error<typeof call>>().toEqualTypeOf<
			Fetch.NetworkError | Fetch.HttpError.With<unknown>
		>();
		inlineApi.get("/todos", {
			plugins: { plain: false, withOptions: { version: "2" } },
		});
		// @ts-expect-error plain has no options
		inlineApi.get("/todos", { plugins: { plain: { version: "2" } } });
		// @ts-expect-error version is a string
		inlineApi.get("/todos", { plugins: { withOptions: { version: 2 } } });
	});
});

declare const plugged: Fetch.Client<
	readonly [typeof bearer, typeof retry, typeof unavailable]
>;

describe("Client with plugins", () => {
	it("adds the plugins' errors to calls, which need no services", () => {
		const call = plugged.get("/todos", { output: Todo });
		expectTypeOf<Effect.Error<typeof call>>().toEqualTypeOf<
			| Fetch.NetworkError
			| Fetch.HttpError.With<unknown>
			| Fetch.DecodeError
			| TokenError
			| Unavailable
		>();
		expectTypeOf<Effect.Services<typeof call>>().toBeNever();
	});

	it("adds the plugins' errors to httpClient", () => {
		expectTypeOf(plugged.httpClient).toEqualTypeOf<
			HttpClient.HttpClient.With<
				Fetch.NetworkError | TokenError | Unavailable
			>
		>();
	});

	it("types per-call overrides from the plugins", () => {
		plugged.get("/todos", {
			plugins: { bearer: false, retry: { times: 0 }, unavailable: false },
		});
		plugged.post("/todos", { body: {}, plugins: { retry: {} } });
		// @ts-expect-error no plugin is called "retyr"
		plugged.get("/todos", { plugins: { retyr: false } });
		// @ts-expect-error times is a number
		plugged.get("/todos", { plugins: { retry: { times: "0" } } });
		// @ts-expect-error bearer has no options to override
		plugged.get("/todos", { plugins: { bearer: { scheme: "Token" } } });
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
