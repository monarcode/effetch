import * as Effect from "effect/Effect";

import { buyCheapest } from "./modules/cart/public.ts";
import { ProductApi } from "./modules/products/public.ts";
import { runtime } from "./runtime.ts";

// Code outside the modules, here standing in for a screen. It imports the
// modules only through their `public.ts`, and never sees a route, a schema
// it doesn't need, or the client:
//
//   pnpm example store

/** Buys the cheapest product in `category`, and says what happened. */
const buy = (category: string, quantity: number) =>
	buyCheapest(1, category, quantity).pipe(
		Effect.map((cart) => {
			const [line] = cart.products;
			return `Cart ${cart.id}: ${line?.quantity} × ${line?.title}, $${cart.discountedTotal}`;
		}),
		// A message for each error the screen knows about...
		Effect.catchTags({
			NothingToBuy: (error) =>
				Effect.succeed(`There's nothing in ${error.category}`),
			OutOfStock: (error) =>
				Effect.succeed(
					`Only ${error.stock} ${error.product} left, not ${error.wanted}`,
				),
		}),
		// ...and one for the rest, such as being offline.
		Effect.catch((error) =>
			Effect.succeed(`Something went wrong (${error._tag})`),
		),
	);

/** A product page, or a message when the product is gone. */
const productPage = (id: number) =>
	Effect.gen(function* () {
		const products = yield* ProductApi;
		const product = yield* products.get({ params: { id } });
		return `${product.title}: $${product.price}, ${product.stock} in stock`;
	}).pipe(
		Effect.catchTag("ProductNotFound", (error) =>
			Effect.succeed(error.message),
		),
		Effect.catch((error) =>
			Effect.succeed(`Something went wrong (${error._tag})`),
		),
	);

console.log(await runtime.runPromise(buy("smartphones", 2)));
console.log(await runtime.runPromise(buy("smartphones", 500)));
console.log(await runtime.runPromise(buy("flying-cars", 1)));
console.log(await runtime.runPromise(productPage(1)));
console.log(await runtime.runPromise(productPage(9999)));

await runtime.dispose();
