import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { StoreApiClient } from "./infrastructure/http/store-api-client.ts";
import { CartModuleLive } from "./modules/cart/cart.layer.ts";
import { ProductModuleLive } from "./modules/products/products.layer.ts";

// The composition root: every module's layer, on top of the client they
// use, on top of one HttpClient. A new module is one line here, and a new
// backend is one client file and one line.

const Modules = Layer.mergeAll(ProductModuleLive, CartModuleLive);

export const AppLayer = Modules.pipe(
	Layer.provide(StoreApiClient.layer),
	Layer.provide(FetchHttpClient.layer),
);

/**
 * What the UI runs effects with: `runtime.runPromise(effect)` from a React
 * or React Native component, an event handler or a route loader. It builds
 * the layers once, the first time it runs something.
 */
export const runtime = ManagedRuntime.make(AppLayer);
