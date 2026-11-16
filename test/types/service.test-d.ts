// Type tests build Effects only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { describe, expectTypeOf, it } from "vitest";

import * as Fetch from "../../src/index.js";

const ApiError = Schema.Struct({ code: Schema.String });
class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}

class Session extends Context.Service<Session, string>()("Session") {}
class TokenError extends Data.TaggedError("TokenError")<{}> {}

declare const token: Effect.Effect<string, TokenError, Session>;

const bearer = Fetch.plugin({
	name: "bearer",
	onRequest: (request) =>
		Effect.map(token, (value) =>
			HttpClientRequest.bearerToken(request, value),
		),
});

type ApiPlugins = readonly [typeof bearer];
type ApiStatusErrors = { 404: typeof NotFound };

class Api extends Fetch.Service<Api>()("Api", {
	baseUrl: "https://api.test",
	defaultError: ApiError,
	statusErrors: { 404: NotFound },
	plugins: [bearer],
}) {}

class Bare extends Fetch.Service<Bare>()("Bare") {}

describe("Fetch.Service", () => {
	it("infers the config's types", () => {
		expectTypeOf(Api).toExtend<
			Fetch.ServiceClass<
				Api,
				"Api",
				ApiPlugins,
				typeof ApiError,
				never,
				never,
				ApiStatusErrors
			>
		>();
		expectTypeOf(Bare).toExtend<Fetch.ServiceClass<Bare, "Bare">>();
		expectTypeOf(Bare.key).toEqualTypeOf<"Bare">();
		expectTypeOf<Effect.Success<typeof Bare>>().toEqualTypeOf<
			Fetch.Client<[], Schema.Unknown>
		>();
		expectTypeOf<Effect.Success<typeof Api>>().toEqualTypeOf<
			Fetch.Client<ApiPlugins, typeof ApiError, ApiStatusErrors>
		>();
	});

	it("is a key for the client make builds from the config", () => {
		expectTypeOf(Api).toExtend<
			Context.Key<
				Api,
				Fetch.Client<ApiPlugins, typeof ApiError, ApiStatusErrors>
			>
		>();
		const make = Fetch.make({
			baseUrl: "https://api.test",
			defaultError: ApiError,
			statusErrors: { 404: NotFound },
			plugins: [bearer],
		});
		const program = Effect.map(Api, (api) => api);
		expectTypeOf<Effect.Success<typeof program>>().toEqualTypeOf<
			Effect.Success<typeof make>
		>();
		expectTypeOf<Effect.Services<typeof program>>().toEqualTypeOf<Api>();
	});

	it("types the client's calls", () => {
		const program = Effect.gen(function* () {
			const api = yield* Api;
			return yield* api.get("/todos/1");
		});
		expectTypeOf<Effect.Error<typeof program>>().toExtend<
			Fetch.FetchError | NotFound | TokenError
		>();
		expectTypeOf<NotFound>().toExtend<Effect.Error<typeof program>>();
	});

	it("types config from the config", () => {
		expectTypeOf(Api.config.defaultError).toEqualTypeOf<
			typeof ApiError | undefined
		>();
		expectTypeOf(Api.config.statusErrors).toEqualTypeOf<
			ApiStatusErrors | undefined
		>();
		expectTypeOf(Api.config.plugins).toEqualTypeOf<ApiPlugins | undefined>();
		expectTypeOf(Api.config).toEqualTypeOf<
			Fetch.ClientConfig<
				ApiPlugins,
				typeof ApiError,
				never,
				never,
				ApiStatusErrors
			>
		>();
	});

	it("types the layer's error and requirements", () => {
		expectTypeOf(Bare.layer).toEqualTypeOf<
			Layer.Layer<Bare, never, HttpClient.HttpClient>
		>();
		expectTypeOf(Api.layer).toEqualTypeOf<
			Layer.Layer<Api, never, HttpClient.HttpClient | Session>
		>();

		class FromConfig extends Fetch.Service<FromConfig>()("FromConfig", {
			baseUrl: Config.String("API_URL"),
		}) {}
		expectTypeOf(FromConfig.layer).toEqualTypeOf<
			Layer.Layer<FromConfig, Config.ConfigError, HttpClient.HttpClient>
		>();

		class FromService extends Fetch.Service<FromService>()("FromService", {
			baseUrl: Effect.map(Session, (session) => `https://${session}.test`),
			plugins: [bearer],
		}) {}
		expectTypeOf(FromService.layer).toEqualTypeOf<
			Layer.Layer<FromService, never, HttpClient.HttpClient | Session>
		>();
	});

	it("lets a subclass override its layer", () => {
		class Provided extends Fetch.Service<Provided>()("Provided", {
			plugins: [bearer],
		}) {
			static override readonly layer = super.layer.pipe(
				Layer.provide(Layer.succeed(Session)("s")),
			);
		}
		expectTypeOf(Provided.layer).toEqualTypeOf<
			Layer.Layer<Provided, never, HttpClient.HttpClient>
		>();

		// @ts-expect-error an override can't need more than the base layer
		class NeedsMore extends Fetch.Service<NeedsMore>()("NeedsMore") {
			static override readonly layer = Layer.effect(this)(
				Effect.flatMap(Session, () => Fetch.make(this.config)),
			);
		}
		expectTypeOf(NeedsMore).toBeObject();
	});

	it("rejects what make rejects", () => {
		// @ts-expect-error there is no such option
		Fetch.Service<Bad>()("Bad", { baseURL: "https://api.test" });
		// @ts-expect-error baseUrl is a string or an Effect of one
		Fetch.Service<Bad>()("Bad", { baseUrl: 42 });
		interface Bad {
			readonly _: unique symbol;
		}
	});
});

describe("isService", () => {
	it("narrows to ServiceClass.Any", () => {
		const check = (u: unknown) => {
			if (Fetch.isService(u)) {
				expectTypeOf(u).toEqualTypeOf<Fetch.ServiceClass.Any>();
				expectTypeOf(u.key).toEqualTypeOf<string>();
			}
		};
		expectTypeOf(check).toBeFunction();
		expectTypeOf(Api).toExtend<Fetch.ServiceClass.Any>();
		expectTypeOf(Bare).toExtend<Fetch.ServiceClass.Any>();
	});
});
