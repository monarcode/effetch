import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { bearer, consoleLogger } from "@monarcode/effetch/plugins";

// Signing in to DummyJSON, a free fake API, and staying signed in. Two
// clients for one backend: `Auth` signs in and renews tokens, and
// `DummyJson` makes every other call with the session's token.

// --- What DummyJSON sends ---

export const Tokens = Schema.Struct({
	accessToken: Schema.String,
	refreshToken: Schema.String,
});
export type Tokens = typeof Tokens.Type;

export const User = Schema.Struct({
	id: Schema.Finite,
	firstName: Schema.String,
	email: Schema.String,
});

export const Carts = Schema.Struct({
	carts: Schema.Array(
		Schema.Struct({
			id: Schema.Finite,
			totalQuantity: Schema.Finite,
			discountedTotal: Schema.Finite,
		}),
	),
});

/** The body of DummyJSON's error responses. */
const ApiError = Schema.Struct({ message: Schema.String });

/** A 400 from the login: the username or password is wrong. */
export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
	"InvalidCredentials",
	{ message: Schema.String },
) {}

/** A 401 that renewing the token couldn't fix: sign in again. */
export class SignedOut extends Schema.TaggedError<SignedOut>()("SignedOut", {
	message: Schema.String,
}) {}

// --- Signing in ---

export const login = Fetch.endpoint("POST /auth/login", {
	input: Schema.Struct({
		username: Schema.String,
		password: Schema.String,
		expiresInMins: Schema.Finite,
	}),
	output: Tokens,
	statusErrors: { 400: InvalidCredentials },
});

export const renew = Fetch.endpoint("POST /auth/refresh", {
	input: Schema.Struct({
		refreshToken: Schema.String,
		expiresInMins: Schema.Finite,
	}),
	output: Tokens,
});

/** Signs in and renews tokens. It sends no token of its own. */
export class Auth extends Fetch.Service<Auth>()("Auth", {
	baseUrl: "https://dummyjson.com",
	defaultError: ApiError,
	plugins: [consoleLogger({ detail: "summary" })],
}) {}

/**
 * The signed-in user's tokens. They're kept in memory here. An app keeps
 * them in secure storage, so that a restart doesn't sign the user out.
 */
export class Session extends Context.Service<Session>()("Session", {
	make: Effect.gen(function* () {
		const auth = yield* Auth;
		const signIn = auth.bind(login);
		const refresh = auth.bind(renew);
		const tokens = yield* Ref.make(Option.none<Tokens>());
		const signOut = Ref.set(tokens, Option.none());

		return {
			/** The access token to send, or `undefined` when signed out. */
			accessToken: Effect.map(Ref.get(tokens), (saved) =>
				Option.getOrUndefined(Option.map(saved, (t) => t.accessToken)),
			),
			/**
			 * A new access token, from the refresh token. `undefined` when
			 * there's none, or when the server refuses it (a 400, 401 or 403),
			 * which signs out. Any other failure, such as a 503, fails the
			 * call, and keeps the session for the next try.
			 */
			refresh: Effect.gen(function* () {
				const saved = yield* Ref.get(tokens);
				if (Option.isNone(saved)) return undefined;
				const renewed = yield* refresh({
					body: {
						refreshToken: saved.value.refreshToken,
						expiresInMins: 30,
					},
				});
				yield* Ref.set(tokens, Option.some(renewed));
				return renewed.accessToken;
			}).pipe(
				Fetch.catchStatus([400, 401, 403], () =>
					Effect.as(signOut, undefined),
				),
			),
			signIn: Effect.fn("Session.signIn")(function* (
				username: string,
				password: string,
			) {
				const signedIn = yield* signIn({
					body: { username, password, expiresInMins: 30 },
				});
				yield* Ref.set(tokens, Option.some(signedIn));
			}),
			signOut,
			/** The tokens, to save until the next launch. */
			saved: Ref.get(tokens),
			/** Restores the tokens an earlier launch saved. */
			restore: (saved: Tokens) => Ref.set(tokens, Option.some(saved)),
		};
	}),
}) {
	static readonly layer = Layer.effect(Session, Session.make);
}

// --- Everything else ---

/**
 * The rest of the API. `bearer` sends the session's token, and when the
 * server answers 401, it asks the session for a new one and sends the
 * request again, once.
 */
export class DummyJson extends Fetch.Service<DummyJson>()("DummyJson", {
	...Auth.config,
	// What a 401 means once renewing the token has failed.
	statusErrors: { 401: SignedOut },
	plugins: [
		consoleLogger({ detail: "summary" }),
		bearer({
			token: Session.use((session) => session.accessToken),
			refresh: Session.use((session) => session.refresh),
		}),
	],
}) {}

export const me = Fetch.endpoint("GET /auth/me", { output: User });

export const userCarts = Fetch.endpoint("GET /auth/carts/user/:id", {
	output: Carts,
});

export class Account extends Fetch.Endpoints<Account>()("Account", DummyJson, {
	me,
	carts: userCarts,
}) {}
