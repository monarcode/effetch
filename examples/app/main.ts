import * as Effect from "effect/Effect";

import { AppApiClient } from "./infrastructure/http/app-api-client.js";
import { TodoApi } from "./modules/todos/public.js";
import { sendMoney } from "./modules/wallet/public.js";
import { AppLayer } from "./runtime.js";

// Code outside the modules uses what their `public.ts` exports. It never sees
// a route, a schema it doesn't need or a client.

const payRent = Effect.gen(function* () {
	const todos = yield* TodoApi;

	const task = yield* todos.create({
		body: { title: "Pay rent", due: new Date() },
	});
	const receipt = yield* sendMoney("w_me", "w_landlord", 1200);
	yield* todos.update({ params: { id: task.id }, body: { done: true } });

	const { todos: open } = yield* todos.list({ query: { done: false } });
	return { receipt: receipt.id, open: open.length };
}).pipe(
	Effect.catchTags({
		InsufficientFunds: (error) =>
			Effect.fail(`Only ${error.balance} left, ${error.amount} needed`),
		HttpError: (error) =>
			Effect.fail(`HTTP ${error.status} from ${error.url}`),
		TimeoutError: (error) =>
			Effect.fail(`${error.url} didn't answer within ${error.duration}`),
		NetworkError: () => Effect.fail("You appear to be offline"),
		DecodeError: (error) =>
			Effect.fail(`Unexpected response: ${error.message}`),
	}),
);

// A one-off call, made with a client directly rather than an endpoint.
const ping = Effect.gen(function* () {
	const client = yield* AppApiClient;
	const response = yield* client.head("/health", {
		plugins: { logger: false, retry: false },
	});
	return response.status;
});

export const main = Effect.all([payRent, ping]).pipe(Effect.provide(AppLayer));
