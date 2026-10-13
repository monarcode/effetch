import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { WalletApiClient } from "../../../infrastructure/http/wallet-api-client.js";
import { Balance, Receipt, Transfer } from "../contract/wallet.js";

// Same shape as `todos`: the module's endpoints are its data service, made
// from the client of the backend the module talks to. Operations that take
// more than one call are workflows, in `application/`.

const makeWalletApi = WalletApiClient.useSync((client) => ({
	balance: client.endpoint("GET /wallets/:walletId/balance", {
		output: Balance,
	}),
	transfer: client.endpoint("POST /transfers", {
		input: Transfer,
		output: Receipt,
		plugins: { timeout: { duration: "30 seconds" } },
	}),
}));

export class WalletApi extends Context.Service<
	WalletApi,
	Effect.Success<typeof makeWalletApi>
>()("modules/wallet/WalletApi") {}

export const WalletApiLive = Layer.effect(WalletApi)(makeWalletApi);
