import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { createRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";

import { buyCheapestMessage } from "./messages.ts";
import { rootRoute } from "./root.tsx";
import { RouteError } from "./route-error.tsx";
import { ProductApi } from "./store.ts";
import { useAction } from "./use-action.ts";

/** How many products a page shows. */
const perPage = 8;

/**
 * The page's search params, such as `?page=2`. TanStack Router takes an
 * Effect schema as a Standard Schema, and types `search` from it.
 */
const CategorySearch = Schema.Struct({
	page: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
});

export const categoryRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/categories/$category",
	validateSearch: Schema.toStandardSchemaV1(CategorySearch),
	// The page is the loader's dependency, so another page loads again.
	loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
	loader: ({ context: { runtime }, params, deps, abortController }) =>
		runtime.runPromise(
			ProductApi.use((products) =>
				products.inCategory({
					params: { category: params.category },
					query: { limit: perPage, skip: (deps.page - 1) * perPage },
				}),
			).pipe(
				// A page past the last one is the router's not-found.
				Effect.filterOrFail(
					(result) => deps.page === 1 || result.products.length > 0,
					() => notFound(),
				),
			),
			{ signal: abortController.signal },
		),
	component: CategoryPage,
	notFoundComponent: () => (
		<p className="notice">
			There's no such page. <Link to="/">Back to the store</Link>
		</p>
	),
	errorComponent: RouteError,
});

function CategoryPage() {
	const { category } = categoryRoute.useParams();
	const { page } = categoryRoute.useLoaderDeps();
	const { products, total } = categoryRoute.useLoaderData();
	const pages = Math.max(1, Math.ceil(total / perPage));
	return (
		<>
			<h1>{category}</h1>
			<BuyCheapest key={category} category={category} />
			{products.length === 0 ? (
				<p className="notice">No products here.</p>
			) : (
				<ul className="products">
					{products.map((product) => (
						<li key={product.id}>
							<Link
								to="/products/$productId"
								params={{ productId: String(product.id) }}
							>
								{product.title}
							</Link>
							<span>${product.price}</span>
						</li>
					))}
				</ul>
			)}
			<nav className="pages" aria-label="Pages">
				{page > 1 && (
					<Link
						to="/categories/$category"
						params={{ category }}
						search={{ page: page - 1 }}
					>
						Previous
					</Link>
				)}
				<span>
					Page {page} of {pages}
				</span>
				{page < pages && (
					<Link
						to="/categories/$category"
						params={{ category }}
						search={{ page: page + 1 }}
					>
						Next
					</Link>
				)}
			</nav>
		</>
	);
}

/**
 * The cart workflow, from a form: the button waits while it runs, and its
 * message, such as an `OutOfStock`, shows under it. Leaving the page
 * while it runs interrupts it.
 */
function BuyCheapest({ category }: { readonly category: string }) {
	const { runtime } = categoryRoute.useRouteContext();
	const action = useAction<string>(runtime);
	// The field's text, so it can be emptied and typed again. The browser
	// checks it's a whole number of at least 1 before the form submits.
	const [quantity, setQuantity] = useState("1");
	return (
		<form
			className="buy"
			onSubmit={(event) => {
				event.preventDefault();
				action.run(buyCheapestMessage(category, Number(quantity)));
			}}
		>
			<label>
				Quantity
				<input
					type="number"
					min={1}
					step={1}
					required
					value={quantity}
					onChange={(event) => setQuantity(event.target.value)}
				/>
			</label>
			<button type="submit" disabled={action.pending}>
				{action.pending ? "Buying…" : "Buy the cheapest"}
			</button>
			{action.result !== undefined && <p role="status">{action.result}</p>}
		</form>
	);
}
