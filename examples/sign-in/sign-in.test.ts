import { describe, expect, it } from "@effect/vitest";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { FetchTest } from "@monarcode/effetch/test";

import {
	Account,
	Auth,
	DummyJson,
	InvalidCredentials,
	login,
	me,
	renew,
	Session,
	SignedOut,
} from "./dummyjson.ts";

// The sign-in flow against a fake DummyJSON: a backend that hands out
// numbered tokens, and accepts only the newest one.

const tokens = (n: number) => ({
	accessToken: `access-${n}`,
	refreshToken: `refresh-${n}`,
});

const Backend = FetchTest.layer([
	FetchTest.respond(login, ({ body }) =>
		Effect.succeed(
			body.password === "right"
				? tokens(1)
				: FetchTest.reply(400, { message: "Invalid credentials" }),
		),
	),
	FetchTest.respond(renew, ({ body }) =>
		Effect.succeed(
			body.refreshToken === "refresh-1"
				? tokens(2)
				: body.refreshToken === "while-down"
					? FetchTest.reply(503, { message: "Service unavailable" })
					: FetchTest.reply(403, { message: "Invalid refresh token" }),
		),
	),
	FetchTest.respond(me, ({ headers }) =>
		Effect.succeed(
			headers.authorization === "Bearer access-2"
				? { id: 1, firstName: "Emily", email: "emily@example.com" }
				: FetchTest.reply(401, { message: "Invalid/Expired Token!" }),
		),
	),
]);

// `consoleLogger` prints through Effect's `Console`: keep the tests quiet.
const Quiet = Layer.succeed(Console.Console, {
	...globalThis.console,
	log: () => {},
	group: () => {},
	groupCollapsed: () => {},
	groupEnd: () => {},
});

const TestLayer = Account.layer.pipe(
	Layer.provide(DummyJson.layer),
	Layer.provideMerge(Session.layer),
	Layer.provide(Auth.layer),
	Layer.provideMerge(Backend),
	Layer.provide(Quiet),
);

describe("Signing in", () => {
	it.effect("turns a wrong password into InvalidCredentials", () =>
		Effect.gen(function* () {
			const session = yield* Session;
			const error = yield* Effect.flip(session.signIn("emilys", "wrong"));
			expect(error).toBeInstanceOf(InvalidCredentials);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("renews a refused token, and sends the request again", () =>
		Effect.gen(function* () {
			const session = yield* Session;
			const account = yield* Account;
			// The backend refuses access-1, the token the login gives.
			yield* session.signIn("emilys", "right");
			const user = yield* account.me();
			expect(user.firstName).toBe("Emily");

			const sent = (yield* FetchTest.requests).map(
				(request) =>
					`${request.route} ${request.headers.authorization ?? ""}`,
			);
			expect(sent).toStrictEqual([
				"POST /auth/login ",
				"GET /auth/me Bearer access-1",
				"POST /auth/refresh ",
				"GET /auth/me Bearer access-2",
			]);
			const saved = yield* session.saved;
			expect(Option.map(saved, (t) => t.accessToken)).toStrictEqual(
				Option.some("access-2"),
			);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("signs out when the refresh token is refused too", () =>
		Effect.gen(function* () {
			const session = yield* Session;
			const account = yield* Account;
			yield* session.restore({
				accessToken: "stale",
				refreshToken: "revoked",
			});
			const error = yield* Effect.flip(account.me());
			expect(error).toBeInstanceOf(SignedOut);
			expect(Option.isNone(yield* session.saved)).toBe(true);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("keeps the session when renewing fails for another reason", () =>
		Effect.gen(function* () {
			const session = yield* Session;
			const account = yield* Account;
			yield* session.restore({
				accessToken: "stale",
				refreshToken: "while-down",
			});
			const error = yield* Effect.flip(account.me());
			expect(error).toMatchObject({ _tag: "HttpError", status: 503 });
			expect(Option.isSome(yield* session.saved)).toBe(true);
		}).pipe(Effect.provide(TestLayer)),
	);
});
