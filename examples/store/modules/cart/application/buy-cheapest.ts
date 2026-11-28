import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { ProductApi } from "../../products/public.ts";
import { CartApi } from "../data/cart.api.ts";

// A workflow: an operation that isn't one HTTP call. It finds the cheapest
// product in a category, fails with a domain error when there's none or not
// enough of it, then puts it in a new cart. The endpoints stay plain; the
// rules live here. It uses the products module through its `public.ts`.

/** The category has no products. */
export class NothingToBuy extends Schema.TaggedError<NothingToBuy>()(
	"NothingToBuy",
	{ category: Schema.String },
) {}

/** Fewer are in stock than the quantity asked for. */
export class OutOfStock extends Schema.TaggedError<OutOfStock>()("OutOfStock", {
	product: Schema.String,
	stock: Schema.Finite,
	wanted: Schema.Finite,
}) {}

export const buyCheapest = Effect.fn("buyCheapest")(function* (
	userId: number,
	category: string,
	quantity: number,
) {
	const products = yield* ProductApi;
	const carts = yield* CartApi;

	const page = yield* products.inCategory({
		params: { category },
		query: { sortBy: "price", order: "asc", limit: 1 },
	});
	const [cheapest] = page.products;
	if (cheapest === undefined) {
		return yield* new NothingToBuy({ category });
	}
	if (cheapest.stock < quantity) {
		return yield* new OutOfStock({
			product: cheapest.title,
			stock: cheapest.stock,
			wanted: quantity,
		});
	}
	return yield* carts.create({
		body: { userId, products: [{ id: cheapest.id, quantity }] },
	});
});
