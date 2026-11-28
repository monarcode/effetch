import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { Account, Auth, DummyJson, Session } from "./dummyjson.ts";

// Signs in to DummyJSON's demo account, renews the access token when it's
// refused, and signs out:
//
//   pnpm example sign-in
//
// Each call prints a line, so you can see what was sent. A renewed token
// shows as a `POST /auth/refresh` line before the call it was renewed for.

const program = Effect.gen(function* () {
	const session = yield* Session;
	const account = yield* Account;

	yield* Console.log("1. Sign in with the wrong password:");
	yield* session
		.signIn("emilys", "wrong")
		.pipe(
			Effect.catchTag("InvalidCredentials", (error) =>
				Console.log(`   ${error.message}`),
			),
		);

	yield* Console.log("\n2. Sign in, and load the profile:");
	yield* session.signIn("emilys", "emilyspass");
	const user = yield* account.me();
	yield* Console.log(`   Signed in as ${user.firstName} (${user.email})`);

	yield* Console.log(
		"\n3. The access token expires. bearer renews it, and sends the request again:",
	);
	// Rather than wait half an hour for it to expire, make it stale now.
	const saved = yield* session.saved;
	if (Option.isSome(saved)) {
		yield* session.restore({ ...saved.value, accessToken: "stale" });
	}
	const { carts } = yield* account.carts({ params: { id: user.id } });
	for (const cart of carts) {
		yield* Console.log(
			`   Cart ${cart.id}: ${cart.totalQuantity} items, $${cart.discountedTotal}`,
		);
	}

	yield* Console.log("\n4. Sign out. The next call fails with SignedOut:");
	yield* session.signOut;
	yield* account
		.me()
		.pipe(
			Effect.catchTag("SignedOut", (error) =>
				Console.log(`   ${error.message}: sign in again`),
			),
		);
});

const Live = Account.layer.pipe(
	Layer.provide(DummyJson.layer),
	Layer.provideMerge(Session.layer),
	Layer.provide(Auth.layer),
	Layer.provide(FetchHttpClient.layer),
);

Effect.runPromise(program.pipe(Effect.provide(Live)));
