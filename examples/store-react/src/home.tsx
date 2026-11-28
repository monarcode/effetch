import { createRoute, Link } from "@tanstack/react-router";

import { rootRoute } from "./root.tsx";
import { RouteError } from "./route-error.tsx";
import { ProductApi } from "./store.ts";

export const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	// Each loader runs its effect with the route's abort signal: leaving the
	// page before the store answers interrupts the effect, and so cancels
	// the request.
	loader: ({ context: { runtime }, abortController }) =>
		runtime.runPromise(
			ProductApi.use((products) => products.categories()),
			{ signal: abortController.signal },
		),
	component: Home,
	errorComponent: RouteError,
});

function Home() {
	const categories = homeRoute.useLoaderData();
	return (
		<>
			<h1>Categories</h1>
			<ul className="categories">
				{categories.map((category) => (
					<li key={category.slug}>
						<Link
							to="/categories/$category"
							params={{ category: category.slug }}
						>
							{category.name}
						</Link>
					</li>
				))}
			</ul>
		</>
	);
}
