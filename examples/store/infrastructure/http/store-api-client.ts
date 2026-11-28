import * as Config from "effect/Config";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { retry, timeout } from "@monarcode/effetch/plugins";

// The store's backend: how to reach it, and nothing else. No endpoints and
// no module schemas live here, so this file stays the same size however
// many endpoints the modules define, and it never imports a module. What a
// status means from every endpoint belongs here; what it means from one
// endpoint belongs with that endpoint.

/** The body of the backend's error responses. */
export const StoreApiError = Schema.Struct({ message: Schema.String });

export class StoreApiClient extends Fetch.Service<StoreApiClient>()(
	"infrastructure/http/StoreApiClient",
	{
		// DummyJSON, a free fake store, unless STORE_API_URL says otherwise.
		baseUrl: Config.String("STORE_API_URL").pipe(
			Config.withDefault("https://dummyjson.com"),
		),
		defaultError: StoreApiError,
		plugins: [retry(), timeout({ duration: "10 seconds" })],
	},
) {}
