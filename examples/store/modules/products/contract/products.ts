import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

// The module's wire formats, and its endpoints next to the schemas they
// use. The endpoints have no client, so anything can read their routes and
// schemas, such as a test's fake backend. `data/product.api.ts` binds them
// to the client.

export const Product = Schema.Struct({
	id: Schema.Finite,
	title: Schema.String,
	category: Schema.String,
	price: Schema.Finite,
	stock: Schema.Finite,
});
export type Product = typeof Product.Type;

export const Category = Schema.Struct({
	slug: Schema.String,
	name: Schema.String,
});
export type Category = typeof Category.Type;

export const ProductPage = Schema.Struct({
	products: Schema.Array(Product),
	total: Schema.Finite,
});
export type ProductPage = typeof ProductPage.Type;

/** A 404 from an endpoint that takes a product's id. */
export class ProductNotFound extends Schema.TaggedError<ProductNotFound>()(
	"ProductNotFound",
	{ message: Schema.String },
) {}

export const listCategories = Fetch.endpoint("GET /products/categories", {
	output: Schema.Array(Category),
});

export const getProduct = Fetch.endpoint("GET /products/:id", {
	output: Product,
	statusErrors: { 404: ProductNotFound },
});

export const productsInCategory = Fetch.endpoint(
	"GET /products/category/:category",
	{
		query: Schema.Struct({
			sortBy: Schema.optionalKey(Schema.Literals(["price", "rating"])),
			order: Schema.optionalKey(Schema.Literals(["asc", "desc"])),
			limit: Schema.optionalKey(Schema.Finite),
			skip: Schema.optionalKey(Schema.Finite),
		}),
		output: ProductPage,
	},
);
