import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

// The cart's wire formats and endpoints, laid out as the products module's.

export const NewCart = Schema.Struct({
	userId: Schema.Finite,
	products: Schema.Array(
		Schema.Struct({ id: Schema.Finite, quantity: Schema.Finite }),
	),
});
export type NewCart = typeof NewCart.Type;

export const Cart = Schema.Struct({
	id: Schema.Finite,
	products: Schema.Array(
		Schema.Struct({
			id: Schema.Finite,
			title: Schema.String,
			quantity: Schema.Finite,
		}),
	),
	discountedTotal: Schema.Finite,
});
export type Cart = typeof Cart.Type;

export const createCart = Fetch.endpoint("POST /carts/add", {
	input: NewCart,
	output: Cart,
});
