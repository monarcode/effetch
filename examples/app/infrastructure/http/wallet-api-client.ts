import * as Config from "effect/Config";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { logger, timeout } from "@monarcode/effetch/plugins";

import { auth, reportErrors } from "./plugins.js";

// A second backend, with its own base URL, error body and plugins: one
// client per backend, each in its own service.

/** The body of this backend's non-2xx responses. */
export const WalletApiError = Schema.Struct({
	error: Schema.String,
	reason: Schema.String,
});

const makeWalletApiClient = Fetch.make({
	baseUrl: Config.String("WALLET_API_URL"),
	defaultError: WalletApiError,
	plugins: [
		logger(),
		reportErrors("wallet"),
		timeout({ duration: "10 seconds" }),
		auth,
	],
});

export class WalletApiClient extends Context.Service<
	WalletApiClient,
	Effect.Success<typeof makeWalletApiClient>
>()("infrastructure/http/WalletApiClient") {}

export const WalletApiClientLive =
	Layer.effect(WalletApiClient)(makeWalletApiClient);
