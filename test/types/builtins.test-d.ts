// @effect-diagnostics floatingEffect:off

import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";
import * as Schedule from "effect/Schedule";

import { describe, expectTypeOf, it } from "vitest";

import * as Fetch from "../../src/index.js";
import {
	bearer,
	type BearerPlugin,
	consoleLogger,
	type ConsoleLoggerPlugin,
	logger,
	type LoggerPlugin,
	type RefreshSource,
	retry,
	type RetryBudgetPlugin,
	type RetryPlugin,
	type TimeoutError,
	timeout,
	type TimeoutPlugin,
} from "../../src/plugins/index.js";

class TokenError extends Data.TaggedError("TokenError")<{}> {}
class Session extends Context.Service<Session, string>()("Session") {}
class RefreshError extends Data.TaggedError("RefreshError")<{}> {}
class Auth extends Context.Service<Auth, string>()("Auth") {}

declare const token: Effect.Effect<string, TokenError, Session>;
declare const sessionToken: Effect.Effect<string | undefined, never, Session>;
declare const refreshToken: Effect.Effect<string | null, RefreshError, Auth>;

describe("bearer", () => {
	it("adds nothing for the string and function forms", () => {
		expectTypeOf(bearer({ token: "token" })).toEqualTypeOf<BearerPlugin>();
		expectTypeOf(bearer({ token: () => "token" })).toEqualTypeOf<
			BearerPlugin<never, never>
		>();
		expectTypeOf(
			bearer({ token: async (request) => request.url }),
		).toEqualTypeOf<BearerPlugin<never, never>>();
	});

	it("carries the Effect form's error and services", () => {
		expectTypeOf(bearer({ token })).toEqualTypeOf<
			BearerPlugin<TokenError, Session>
		>();
		expectTypeOf(bearer({ token: sessionToken })).toEqualTypeOf<
			BearerPlugin<never, Session>
		>();
	});

	it("adds the refresh Effect's error and services to the token's", () => {
		expectTypeOf(
			bearer({ token: "token", refresh: async () => "new" }),
		).toEqualTypeOf<BearerPlugin<never, never>>();
		expectTypeOf(
			bearer({ token: "token", refresh: refreshToken }),
		).toEqualTypeOf<BearerPlugin<RefreshError, Auth>>();
		expectTypeOf(bearer({ token, refresh: refreshToken })).toEqualTypeOf<
			BearerPlugin<TokenError | RefreshError, Session | Auth>
		>();
	});

	it("takes a function or an Effect as the refresh, not a string", () => {
		expectTypeOf<RefreshSource>().not.toExtend<string>();
		expectTypeOf(refreshToken).toExtend<RefreshSource<RefreshError, Auth>>();
		// @ts-expect-error a fixed string can't be a new token
		bearer({ token: "token", refresh: "new" });
		// @ts-expect-error a refresh function returns a string, null or undefined
		bearer({ token: "token", refresh: () => 42 });
	});

	it("rejects tokens that aren't strings", () => {
		// @ts-expect-error a token is a string
		bearer({ token: 42 });
		// @ts-expect-error a token function returns a string, null or undefined
		bearer({ token: () => 42 });
		// @ts-expect-error a token Effect succeeds with a string
		bearer({ token: Effect.succeed(42) });
	});
});

describe("logger, consoleLogger, retry and timeout", () => {
	it("have named plugin types", () => {
		expectTypeOf(logger()).toEqualTypeOf<LoggerPlugin>();
		expectTypeOf(consoleLogger()).toEqualTypeOf<ConsoleLoggerPlugin>();
		expectTypeOf(
			consoleLogger({ enabled: false }),
		).toEqualTypeOf<ConsoleLoggerPlugin>();
		expectTypeOf<Fetch.Plugin.Errors<[ConsoleLoggerPlugin]>>().toBeNever();
		expectTypeOf<Fetch.Plugin.Services<[ConsoleLoggerPlugin]>>().toBeNever();
		expectTypeOf(retry()).toEqualTypeOf<RetryPlugin>();
		expectTypeOf(
			timeout({ duration: "1 second" }),
		).toEqualTypeOf<TimeoutPlugin>();
		expectTypeOf<
			Fetch.Plugin.Errors<[TimeoutPlugin]>
		>().toEqualTypeOf<TimeoutError>();
	});

	it("give retry with a budget its own plugin type, adding TimeoutError", () => {
		expectTypeOf(retry({ times: 3 })).toEqualTypeOf<RetryPlugin>();
		expectTypeOf(retry({ retryAfter: true })).toEqualTypeOf<RetryPlugin>();
		expectTypeOf(
			retry({ budget: "30 seconds" }),
		).toEqualTypeOf<RetryBudgetPlugin>();
		expectTypeOf<Fetch.Plugin.Errors<[RetryPlugin]>>().toBeNever();
		expectTypeOf<
			Fetch.Plugin.Errors<[RetryBudgetPlugin]>
		>().toEqualTypeOf<TimeoutError>();
		retry({ retryAfter: false });
		retry({ retryAfter: { max: "30 seconds" } });
		// @ts-expect-error not a duration
		retry({ retryAfter: { max: "soon" } });
		// @ts-expect-error not a duration
		retry({ budget: "soon" });
		expectTypeOf(retry({ budget: undefined })).toEqualTypeOf<RetryPlugin>();
		const maybe: { readonly budget?: number } = {};
		expectTypeOf(retry(maybe)).toEqualTypeOf<RetryBudgetPlugin>();
		const widened = { times: 3, budget: "30 seconds" as string };
		// @ts-expect-error a string that may not be a duration
		retry(widened);
	});

	it("check their options", () => {
		retry({ times: 1, schedule: Schedule.spaced("1 second") });
		// @ts-expect-error not an HTTP method
		retry({ methods: ["FETCH"] });
		// @ts-expect-error timeout needs a duration
		timeout({});
		// @ts-expect-error not a duration
		timeout({ duration: "soon" });
		// @ts-expect-error logs at Debug or Info only
		logger({ level: "Warn" });
		consoleLogger({
			enabled: true,
			detail: "headers",
			only: "errors",
			collapsed: false,
			slow: "1 second",
			maxBodyLength: 100,
			redact: { headers: ["x-a"], query: [/^q/], body: ["otp"] },
			filter: (call) => call.route !== "GET /health",
			color: "ansi",
		});
		consoleLogger({ redact: false, color: false, slow: false });
		// @ts-expect-error not a detail level
		consoleLogger({ detail: "everything" });
		// @ts-expect-error not a duration
		consoleLogger({ slow: "soon" });
		// @ts-expect-error not a color mode
		consoleLogger({ color: true });
	});
});

const make = Fetch.make({
	plugins: [
		logger(),
		consoleLogger(),
		retry(),
		timeout({ duration: "10 seconds" }),
		bearer({ token }),
	],
});
type Api = Effect.Success<typeof make>;
declare const api: Api;

describe("make with the built-ins", () => {
	it("requires the token's services from make only", () => {
		expectTypeOf<Effect.Services<typeof make>>().toEqualTypeOf<
			HttpClient.HttpClient | Session
		>();
		const call = api.del("/todos/:id", { params: { id: 1 } });
		expectTypeOf<Effect.Services<typeof call>>().toBeNever();
	});

	it("adds TimeoutError and the token's error to calls", () => {
		const call = api.get("/todos");
		expectTypeOf<Effect.Error<typeof call>>().toEqualTypeOf<
			| Fetch.NetworkError
			| Fetch.HttpError.With<unknown>
			| TimeoutError
			| TokenError
		>();
	});

	it("types the per-call overrides", () => {
		api.get("/todos", {
			plugins: {
				logger: false,
				consoleLogger: { detail: "summary", slow: false },
				retry: { times: 0 },
				timeout: { duration: "1 minute" },
				bearer: false,
			},
		});
		// @ts-expect-error bearer can only be skipped
		api.get("/todos", { plugins: { bearer: { scheme: "Token" } } });
		// @ts-expect-error logger can only be skipped
		api.get("/todos", { plugins: { logger: { level: "Info" } } });
		api.get("/todos", { plugins: { consoleLogger: false } });
		// @ts-expect-error consoleLogger's color is set once, by make
		api.get("/todos", { plugins: { consoleLogger: { color: "css" } } });
		// @ts-expect-error only times can be overridden
		api.get("/todos", { plugins: { retry: { methods: ["POST"] } } });
		// @ts-expect-error not a duration
		api.get("/todos", { plugins: { timeout: { duration: "soon" } } });
	});
});

describe("retry with a budget, per call", () => {
	const makeBudget = Fetch.make({
		plugins: [retry({ budget: "30 seconds" })],
	});
	const budgetApi = {} as Effect.Success<typeof makeBudget>;

	it("adds TimeoutError to calls", () => {
		const call = budgetApi.get("/todos");
		expectTypeOf<TimeoutError>().toExtend<Effect.Error<typeof call>>();
	});

	it("overrides times and budget", () => {
		budgetApi.get("/todos", { plugins: { retry: { budget: "5 seconds" } } });
		budgetApi.get("/todos", {
			plugins: { retry: { times: 1, budget: "5 seconds" } },
		});
		// @ts-expect-error not a duration
		budgetApi.get("/todos", { plugins: { retry: { budget: "soon" } } });
		// @ts-expect-error a client without a budget has none to override
		api.get("/todos", { plugins: { retry: { budget: "5 seconds" } } });
	});
});
