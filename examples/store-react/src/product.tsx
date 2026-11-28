import * as Effect from "effect/Effect";

import { createRoute, Link, notFound } from "@tanstack/react-router";

import { rootRoute } from "./root.tsx";
import { RouteError } from "./route-error.tsx";
import { ProductApi } from "./store.ts";

export const productRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/products/$productId",
	loader: ({ context: { runtime }, params, abortController }) =>
		runtime.runPromise(
			ProductApi.use((products) =>
				products.get({ params: { id: params.productId } }),
			).pipe(
				// A product the store doesn't have is the router's not-found, which
				// shows the route's `notFoundComponent`, rather than an error.
				Effect.catchTag("ProductNotFound", () => Effect.fail(notFound())),
			),
			{ signal: abortController.signal },
		),
	component: ProductPage,
	notFoundComponent: () => (
		<p className="notice">This product isn't in the store.</p>
	),
	errorComponent: RouteError,
});

function ProductPage() {
	const product = productRoute.useLoaderData();
	return (
		<article className="product">
			<h1>{product.title}</h1>
			<p>
				<Link
					to="/categories/$category"
					params={{ category: product.category }}
				>
					{product.category}
				</Link>
			</p>
			<p className="price">${product.price}</p>
			<p>{product.stock} in stock</p>
		</article>
	);
}
