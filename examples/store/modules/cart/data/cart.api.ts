import { Fetch } from "@monarcode/effetch";

import { StoreApiClient } from "../../../infrastructure/http/store-api-client.ts";
import { createCart } from "../contract/cart.ts";

// The same shape as the products module's `data/`: the endpoints, bound.

export class CartApi extends Fetch.Endpoints<CartApi>()(
	"modules/cart/CartApi",
	StoreApiClient,
	{ create: createCart },
) {}
