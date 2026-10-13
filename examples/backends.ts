import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { bearer, logger, retry, timeout } from "@monarcode/effetch/plugins";

// Two backends, each with its own base URL, error shape and plugins: one
// client per backend, each in its own service.

const User = Schema.Struct({ id: Schema.String, name: Schema.String });

const Balance = Schema.Struct({
	amount: Schema.Finite,
	currency: Schema.String,
});

const Transfer = Schema.Struct({ to: Schema.String, amount: Schema.Finite });

const Receipt = Schema.Struct({ id: Schema.String });

const UsersError = Schema.Struct({ code: Schema.String });

const WalletError = Schema.Struct({
	error: Schema.String,
	reason: Schema.String,
});

const session: { accessToken: string | undefined } = {
	accessToken: undefined,
};

// Plugins are plain values, so both clients can share one token source.
const auth = bearer({ token: () => session.accessToken });

// `ctx.route` is a method and path, with no host: both backends could have a
// `GET /health`. A plugin shared across backends takes the backend's name,
// and each client gets its own instance.
const reportErrors = (backend: string) =>
	Fetch.plugin({
		name: "reportErrors",
		onError: (error, ctx) =>
			Effect.logWarning(`${backend} ${ctx.route} failed`, error),
	});

const makeUsersApi = Effect.gen(function* () {
	const client = yield* Fetch.make({
		baseUrl: Config.String("USERS_API_URL"),
		defaultError: UsersError,
		plugins: [logger(), reportErrors("users"), retry(), auth],
	});
	return {
		// The client itself, for calls that aren't endpoints.
		client,
		me: client.endpoint("GET /me", { output: User }),
		getUser: client.endpoint("GET /users/:id", { output: User }),
	};
});

export class UsersApi extends Context.Service<
	UsersApi,
	Effect.Success<typeof makeUsersApi>
>()("UsersApi") {}

const makeWalletApi = Effect.gen(function* () {
	const client = yield* Fetch.make({
		baseUrl: Config.String("WALLET_API_URL"),
		defaultError: WalletError,
		plugins: [
			logger(),
			reportErrors("wallet"),
			timeout({ duration: "10 seconds" }),
			auth,
		],
	});
	return {
		client,
		balance: client.endpoint("GET /wallets/:userId/balance", {
			output: Balance,
		}),
		transfer: client.endpoint("POST /transfers", {
			input: Transfer,
			output: Receipt,
			plugins: { timeout: { duration: "30 seconds" } },
		}),
	};
});

export class WalletApi extends Context.Service<
	WalletApi,
	Effect.Success<typeof makeWalletApi>
>()("WalletApi") {}

// One HttpClient for both.
export const ApisLive = Layer.mergeAll(
	Layer.effect(UsersApi)(makeUsersApi),
	Layer.effect(WalletApi)(makeWalletApi),
).pipe(Layer.provide(FetchHttpClient.layer));

// Each backend's errors are caught next to its calls, where `HttpError.body`
// has that backend's error shape.
const currentUser = Effect.gen(function* () {
	const users = yield* UsersApi;
	return yield* users.me();
}).pipe(
	Effect.catchTag("HttpError", (error) =>
		Effect.fail(`users: ${error.body?.code ?? `HTTP ${error.status}`}`),
	),
);

const sendHalf = (userId: string, to: string) =>
	Effect.gen(function* () {
		const wallet = yield* WalletApi;
		const { amount } = yield* wallet.balance({ params: { userId } });
		return yield* wallet.transfer({ body: { to, amount: amount / 2 } });
	}).pipe(
		Effect.catchTag("HttpError", (error) =>
			Effect.fail(`wallet: ${error.body?.reason ?? `HTTP ${error.status}`}`),
		),
	);

// A one-off call to the users backend, with the client rather than an
// endpoint.
const recordActivity = (userId: string, receiptId: string) =>
	Effect.gen(function* () {
		const users = yield* UsersApi;
		yield* users.client.post("/users/:id/activity", {
			params: { id: userId },
			body: { type: "transfer", receipt: receiptId },
		});
	}).pipe(
		Effect.catchTag("HttpError", (error) =>
			Effect.fail(`users: ${error.body?.code ?? `HTTP ${error.status}`}`),
		),
	);

export const program = (to: string) =>
	Effect.gen(function* () {
		const user = yield* currentUser;
		const receipt = yield* sendHalf(user.id, to);
		yield* recordActivity(user.id, receipt.id);
		return receipt;
	}).pipe(
		Effect.catchTags({
			NetworkError: () => Effect.fail("You appear to be offline"),
			DecodeError: (error) =>
				Effect.fail(`Unexpected response: ${error.message}`),
		}),
	);

export const main = (to: string) => program(to).pipe(Effect.provide(ApisLive));
