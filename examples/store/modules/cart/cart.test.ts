import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { FetchTest } from "@monarcode/effetch/test";

import { StoreApiClient } from "../../infrastructure/http/store-api-client.ts";
import { productsInCategory } from "../products/contract/products.ts";
import { ProductModuleLive } from "../products/products.layer.ts";
import { CartModuleLive } from "./cart.layer.ts";
import { createCart } from "./contract/cart.ts";
import { buyCheapest, NothingToBuy, OutOfStock } from "./public.ts";

// The workflow, run as in production: the real modules and the real
// `StoreApiClient`, with its plugins and errors. Only the HttpClient under
// it is fake, answering from the endpoints' own definitions.

const phone = {
	id: 128,
	title: "Realme C35",
	category: "smartphones",
	price: 149.99,
	stock: 3,
};

const Backend = FetchTest.layer([
	FetchTest.respond(productsInCategory, ({ params }) =>
		Effect.succeed({
			products: params.category === "smartphones" ? [phone] : [],
			total: params.category === "smartphones" ? 1 : 0,
		}),
	),
	// `body` is decoded with `NewCart`, as the real backend would read it.
	FetchTest.respond(
		createCart,
		({ body }) =>
			Effect.succeed({
				id: 1,
				products: body.products.map((line) => ({
					...line,
					title: phone.title,
				})),
				discountedTotal: phone.price * (body.products[0]?.quantity ?? 0),
			}),
		{ status: 201 },
	),
]);

const TestLayer = Layer.mergeAll(ProductModuleLive, CartModuleLive).pipe(
	Layer.provide(StoreApiClient.layer),
	Layer.provideMerge(Backend),
);

describe("buyCheapest", () => {
	it.effect("asks for the cheapest product, and puts it in a cart", () =>
		Effect.gen(function* () {
			const cart = yield* buyCheapest(7, "smartphones", 2);
			expect(cart.products).toStrictEqual([
				{ id: 128, title: "Realme C35", quantity: 2 },
			]);

			const [search, created] = yield* FetchTest.requests;
			expect(search?.query).toStrictEqual({
				sortBy: "price",
				order: "asc",
				limit: "1",
			});
			expect(created?.body).toStrictEqual({
				userId: 7,
				products: [{ id: 128, quantity: 2 }],
			});
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("fails with OutOfStock, and makes no cart", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(buyCheapest(7, "smartphones", 5));
			expect(error).toStrictEqual(
				new OutOfStock({ product: "Realme C35", stock: 3, wanted: 5 }),
			);
			const routes = (yield* FetchTest.requests).map((sent) => sent.route);
			expect(routes).toStrictEqual(["GET /products/category/:category"]);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("fails with NothingToBuy for an empty category", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(buyCheapest(7, "flying-cars", 1));
			expect(error).toBeInstanceOf(NothingToBuy);
		}).pipe(Effect.provide(TestLayer)),
	);
});
