import * as Layer from "effect/Layer";

import { ProductApi } from "./data/product.api.ts";

/** Every live layer of the module, for the app's runtime. */
export const ProductModuleLive = Layer.mergeAll(ProductApi.layer);
