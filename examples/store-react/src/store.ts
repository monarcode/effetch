import type * as ManagedRuntime from "effect/ManagedRuntime";

import type { CartApi } from "../../store/modules/cart/public.ts";
import type { ProductApi } from "../../store/modules/products/public.ts";

// The store example's modules, used through their `public.ts` files, as
// any screen uses them. This app only adds screens: the modules, the
// client and the runtime are the store example's own.

export {
	buyCheapest,
	NothingToBuy,
	OutOfStock,
} from "../../store/modules/cart/public.ts";
export {
	ProductApi,
	ProductNotFound,
} from "../../store/modules/products/public.ts";
export type {
	Category,
	Product,
	ProductPage,
} from "../../store/modules/products/public.ts";
export { runtime } from "../../store/runtime.ts";

/** The services the screens' effects use. */
export type StoreServices = ProductApi | CartApi;

/** What the routes run effects with: the store's runtime, or a test's. */
export type StoreRuntime = ManagedRuntime.ManagedRuntime<
	StoreServices,
	unknown
>;
