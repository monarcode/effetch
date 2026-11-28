import { Fetch } from "@monarcode/effetch";

import { StoreApiClient } from "../../../infrastructure/http/store-api-client.ts";
import {
	getProduct,
	listCategories,
	productsInCategory,
} from "../contract/products.ts";

// The module's data service is its endpoints, bound to the client: one line
// per operation, and every type (params, query, success and errors)
// inferred, so there's no interface to keep in step. `ProductApi.layer`
// binds them once, when it's built.

export class ProductApi extends Fetch.Endpoints<ProductApi>()(
	"modules/products/ProductApi",
	StoreApiClient,
	{
		categories: listCategories,
		get: getProduct,
		inCategory: productsInCategory,
	},
) {}
