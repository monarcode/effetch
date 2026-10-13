import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { describe, expectTypeOf, it } from "vitest";

import { plugin, type Plugin, type PluginContext } from "../../src/Plugin.js";

class A extends Data.TaggedError("A")<{}> {}
class B extends Data.TaggedError("B")<{}> {}
class TimeoutError extends Data.TaggedError("TimeoutError")<{}> {}
class TokenError extends Data.TaggedError("TokenError")<{}> {}
class Session extends Context.Service<Session, { readonly id: string }>()(
	"Session",
) {}
class Clock extends Context.Service<Clock, { readonly now: number }>()(
	"Clock",
) {}

declare const token: Effect.Effect<string | undefined, TokenError, Session>;

const bearer = plugin({
	name: "bearer",
	onRequest: (request) =>
		Effect.map(token, (value) =>
			value === undefined
				? request
				: HttpClientRequest.bearerToken(request, value),
		),
});

const timeout = plugin({
	name: "timeout",
	defaults: { duration: "10 seconds" },
	wrap: (client, options) =>
		HttpClient.transformResponse(client, (response) =>
			Effect.gen(function* () {
				const { duration } = yield* options;
				if (duration === "0 seconds") {
					return yield* new TimeoutError();
				}
				return yield* response;
			}),
		),
});

const retry = plugin({
	name: "retry",
	defaults: { times: 2 },
	wrap: (client) => HttpClient.retry(client, { times: 2 }),
});

describe("plugin()", () => {
	it("infers the literal name", () => {
		expectTypeOf(bearer.name).toEqualTypeOf<"bearer">();
	});

	it("infers Opts from defaults and types ctx.options", () => {
		plugin({
			name: "x",
			defaults: { times: 3 },
			onRequest: (request, ctx) => {
				expectTypeOf(ctx).toEqualTypeOf<PluginContext<{ times: number }>>();
				return Effect.succeed(request);
			},
		});
	});

	it("defaults Opts to undefined without defaults", () => {
		expectTypeOf<Plugin.Options<typeof bearer>>().toEqualTypeOf<undefined>();
	});

	it("infers Opts from defaults only, never from a ctx annotation", () => {
		plugin({
			name: "x",
			// @ts-expect-error ctx.options is undefined without defaults
			onRequest: (request, ctx: PluginContext<{ times: number }>) =>
				Effect.as(Effect.log(ctx.options.times), request),
		});
		plugin({
			name: "x",
			onRequest: (request, ctx) => {
				expectTypeOf(ctx.options).toEqualTypeOf<undefined>();
				return Effect.succeed(request);
			},
		});
	});

	it("unions errors from different hooks", () => {
		const p = plugin({
			name: "p",
			onRequest: (request) =>
				Math.random() > 0.5
					? Effect.fail(new A())
					: Effect.succeed(request),
			onResponse: (response) =>
				Math.random() > 0.5
					? Effect.fail(new B())
					: Effect.succeed(response),
		});
		expectTypeOf<Plugin.Errors<[typeof p]>>().toEqualTypeOf<A | B>();
	});

	it("unions services from different hooks", () => {
		const p = plugin({
			name: "p",
			onRequest: (request) => Effect.as(Effect.service(Session), request),
			onError: () => Effect.asVoid(Effect.service(Clock)),
		});
		expectTypeOf<Plugin.Services<[typeof p]>>().toEqualTypeOf<
			Session | Clock
		>();
	});

	it("lets wrap add an error", () => {
		expectTypeOf<
			Plugin.Errors<[typeof timeout]>
		>().toEqualTypeOf<TimeoutError>();
	});

	it("adds no error for a wrap that only retries", () => {
		expectTypeOf<Plugin.Errors<[typeof retry]>>().toBeNever();
	});

	it("gives hooks and wrap the call's route", () => {
		const p = plugin({
			name: "routes",
			onRequest: (request, ctx) => {
				expectTypeOf(ctx.route).toEqualTypeOf<string | undefined>();
				return Effect.succeed(request);
			},
			onError: (_error, ctx) => {
				expectTypeOf(ctx.route).toEqualTypeOf<string | undefined>();
				return Effect.void;
			},
			wrap: (client, _options, route) => {
				expectTypeOf(route).toEqualTypeOf<
					Effect.Effect<string | undefined>
				>();
				return client;
			},
		});
		expectTypeOf<Plugin.Errors<[typeof p]>>().toBeNever();
		expectTypeOf<Plugin.Services<[typeof p]>>().toBeNever();
	});

	it("rejects hooks returning the wrong type", () => {
		plugin({
			name: "bad",
			// @ts-expect-error onRequest must return a request
			onRequest: () => Effect.succeed(42),
		});
	});
});

describe("Plugin.Errors / Plugin.Services", () => {
	it("collects the token's error and the wrap's error", () => {
		expectTypeOf<
			Plugin.Errors<[typeof bearer, typeof timeout]>
		>().toEqualTypeOf<TokenError | TimeoutError>();
	});

	it("collects the token's services", () => {
		expectTypeOf<
			Plugin.Services<[typeof bearer, typeof timeout]>
		>().toEqualTypeOf<Session>();
	});

	it("is never for no plugins", () => {
		expectTypeOf<Plugin.Errors<[]>>().toBeNever();
		expectTypeOf<Plugin.Services<[]>>().toBeNever();
	});

	it("is unknown, not any, for erased plugin lists", () => {
		type Erased = ReadonlyArray<Plugin.Any>;
		expectTypeOf<Plugin.Errors<Erased>>().toBeUnknown();
		expectTypeOf<Plugin.Services<Erased>>().toBeUnknown();
	});
});

describe("Plugin.Overrides", () => {
	type Overrides = Plugin.Overrides<
		[typeof bearer, typeof timeout, typeof retry]
	>;

	it("accepts false for any plugin", () => {
		expectTypeOf({
			bearer: false,
			timeout: false,
			retry: false,
		} as const).toExtend<Overrides>();
	});

	it("accepts partial options for plugins with defaults", () => {
		expectTypeOf({
			retry: { times: 0 },
			timeout: {},
		}).toExtend<Overrides>();
		expectTypeOf({ retry: { times: "0" } }).not.toExtend<Overrides>();
	});

	it("types option keys", () => {
		// @ts-expect-error times is a number
		const wrongType: Overrides = { retry: { times: "0" } };
		// @ts-expect-error unknown option key
		const unknownKey: Overrides = { retry: { attempts: 1 } };
		void [wrongType, unknownKey];
	});

	it("only accepts false for plugins without defaults", () => {
		// @ts-expect-error bearer has no options
		const withOptions: Overrides = { bearer: {} };
		// @ts-expect-error true is not an override
		const enabled: Overrides = { bearer: true };
		void [withOptions, enabled];
	});

	it("rejects unknown plugin names", () => {
		// @ts-expect-error no plugin called "bearr"
		const typo: Overrides = { bearr: false };
		void typo;
	});

	it("keeps rejecting typos when a plugin's name isn't a literal", () => {
		const name: string = "dynamic";
		const dynamic = plugin({ name, onRequest: Effect.succeed });
		type WithDynamic = Plugin.Overrides<[typeof bearer, typeof dynamic]>;
		const ok: WithDynamic = { bearer: false };
		// @ts-expect-error no plugin called "bearr"
		const typo: WithDynamic = { bearr: false };
		void [ok, typo];
	});

	it("accepts no names without plugins", () => {
		const none: Plugin.Overrides<[]> = {};
		// @ts-expect-error the client has no plugins
		const typo: Plugin.Overrides<[]> = { bearer: false };
		void [none, typo];
	});

	it("accepts no names for an erased plugin list", () => {
		// @ts-expect-error erased lists have no known names
		const erased: Plugin.Overrides<ReadonlyArray<Plugin.Any>> = { x: false };
		void erased;
	});
});
