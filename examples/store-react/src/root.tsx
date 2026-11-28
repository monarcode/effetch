import {
	createRootRouteWithContext,
	Link,
	Outlet,
} from "@tanstack/react-router";

import type { StoreRuntime } from "./store.ts";

/** What the router gives every route's loader and component. */
export interface RouterContext {
	readonly runtime: StoreRuntime;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
	component: Layout,
	notFoundComponent: () => <p className="notice">There's no page here.</p>,
});

function Layout() {
	return (
		<>
			<header>
				<Link to="/" className="brand">
					Effetch store
				</Link>
			</header>
			<main>
				<Outlet />
			</main>
		</>
	);
}
