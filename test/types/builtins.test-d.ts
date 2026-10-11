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
	logger,
	type LoggerPlugin,
	retry,
	type RetryPlugin,
	type TimeoutError,
	timeout,
	type TimeoutPlugin,
} from "../../src/plugins/index.js";

class TokenError extends Data.TaggedError("TokenError")<{}> {}
class Session extends Context.Service<Session, string>()("Session") {}

declare const token: Effect.Effect<string, TokenError, Session>;
declare const sessionToken: Effect.Effect<string | undefined, never, Session>;

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

	it("rejects tokens that aren't strings", () => {
		// @ts-expect-error a token is a string
		bearer({ token: 42 });
		// @ts-expect-error a token function returns a string, null or undefined
		bearer({ token: () => 42 });
		// @ts-expect-error a token Effect succeeds with a string
		bearer({ token: Effect.succeed(42) });
	});
});

describe("logger, retry and timeout", () => {
	it("have named plugin types", () => {
		expectTypeOf(logger()).toEqualTypeOf<LoggerPlugin>();
		expectTypeOf(retry()).toEqualTypeOf<RetryPlugin>();
		expectTypeOf(
			timeout({ duration: "1 second" }),
		).toEqualTypeOf<TimeoutPlugin>();
		expectTypeOf<
			Fetch.Plugin.Errors<[TimeoutPlugin]>
		>().toEqualTypeOf<TimeoutError>();
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
	});
});

const make = Fetch.make({
	plugins: [
		logger(),
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
				retry: { times: 0 },
				timeout: { duration: "1 minute" },
				bearer: false,
			},
		});
		// @ts-expect-error bearer can only be skipped
		api.get("/todos", { plugins: { bearer: { scheme: "Token" } } });
		// @ts-expect-error logger can only be skipped
		api.get("/todos", { plugins: { logger: { level: "Info" } } });
		// @ts-expect-error only times can be overridden
		api.get("/todos", { plugins: { retry: { methods: ["POST"] } } });
		// @ts-expect-error not a duration
		api.get("/todos", { plugins: { timeout: { duration: "soon" } } });
	});
});
