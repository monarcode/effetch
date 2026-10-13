import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { WalletApi } from "../data/wallet.api.js";

// A workflow: an operation that isn't one HTTP call. It reads the balance,
// fails with a domain error when it's too low, then sends the transfer. The
// endpoints stay plain; the rules live here.

export class InsufficientFunds extends Schema.TaggedError<InsufficientFunds>()(
	"InsufficientFunds",
	{ balance: Schema.Finite, amount: Schema.Finite },
) {}

export const sendMoney = Effect.fn("sendMoney")(function* (
	from: string,
	to: string,
	amount: number,
) {
	const wallet = yield* WalletApi;
	const balance = yield* wallet.balance({ params: { walletId: from } });
	if (balance.amount < amount) {
		return yield* new InsufficientFunds({ balance: balance.amount, amount });
	}
	return yield* wallet.transfer({ body: { from, to, amount } });
});
