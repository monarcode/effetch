import { createRouter, type RouterHistory } from "@tanstack/react-router";

import { categoryRoute } from "./category.tsx";
import { homeRoute } from "./home.tsx";
import { productRoute } from "./product.tsx";
import { rootRoute } from "./root.tsx";
import type { StoreRuntime } from "./store.ts";

export const routeTree = rootRoute.addChildren([
	homeRoute,
	categoryRoute,
	productRoute,
]);

/** What the tests change, to run the router in Node as a browser runs it. */
export interface TestOptions {
	readonly history?: RouterHistory;
	readonly isServer?: boolean;
	readonly origin?: string;
}

/**
 * The app's router. Its loaders run their effects with `runtime`: the
 * store's in the app, one with a fake backend in the tests.
 *
 * It doesn't preload on hover (`defaultPreload`): a preloaded loader keeps
 * running when the click's navigation is left, so leaving the page
 * wouldn't cancel its request.
 */
export const makeRouter = (runtime: StoreRuntime, options?: TestOptions) =>
	createRouter({ routeTree, context: { runtime }, ...options });

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof makeRouter>;
	}
}
