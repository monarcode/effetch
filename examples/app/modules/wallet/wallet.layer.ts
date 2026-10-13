import * as Layer from "effect/Layer";

import { WalletApiLive } from "./data/wallet.api.js";

/** Every live layer of the module, for the app's runtime. */
export const WalletModuleLive = Layer.mergeAll(WalletApiLive);
