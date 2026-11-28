import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { TimeoutError } from "@monarcode/effetch/plugins";

// What the server and the browser share: the schemas, the endpoints the
// server calls, and the RPCs. It holds no client, so the browser's bundle
// gets no base URL and no plugins. The client is in `server.ts`.

export const Product = Schema.Struct({
	id: Schema.Finite,
	title: Schema.String,
	price: Schema.Finite,
});

/** The body of DummyJSON's error responses. A class, so it comes back as one. */
export class ApiProblem extends Schema.Class<ApiProblem>("ApiProblem")({
	message: Schema.String,
}) {}

export class ProductNotFound extends Schema.TaggedError<ProductNotFound>()(
	"ProductNotFound",
	{ message: Schema.String },
) {}

// The endpoints carry their own `error`, rather than the client's
// `defaultError`, so `Fetch.errorCodec` needs no client to read.

export const getProduct = Fetch.endpoint("GET /products/:id", {
	output: Product,
	error: ApiProblem,
	statusErrors: { 404: ProductNotFound },
});

export const searchProducts = Fetch.endpoint("GET /products/search", {
	query: Schema.Struct({
		q: Schema.String,
		limit: Schema.Finite,
		select: Schema.String,
	}),
	output: Schema.Struct({
		products: Schema.Array(Product),
		total: Schema.Finite,
	}),
	error: ApiProblem,
});

// Each RPC fails with what its call fails with. The server's client has
// `timeout`, whose error no endpoint lists, so it's added as `errors`.

export const GetProduct = Rpc.make("GetProduct", {
	payload: { id: Schema.Finite },
	success: Product,
	error: Fetch.errorCodec(getProduct, { errors: [TimeoutError] }),
});

export const SearchProducts = Rpc.make("SearchProducts", {
	payload: { query: Schema.String, limit: Schema.Finite },
	success: Schema.Array(Product),
	error: Fetch.errorCodec(searchProducts, { errors: [TimeoutError] }),
});

export const ProductRpcs = RpcGroup.make(GetProduct, SearchProducts);
