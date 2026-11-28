import * as Layer from "effect/Layer";

import { CartApi } from "./data/cart.api.ts";

/** Every live layer of the module, for the app's runtime. */
export const CartModuleLive = Layer.mergeAll(CartApi.layer);
