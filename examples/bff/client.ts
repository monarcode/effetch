import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as RpcClient from "effect/rpc/RpcClient";
import * as RpcSerialization from "effect/rpc/RpcSerialization";

import { ProductRpcs } from "./shared.ts";

// The browser: it calls the RPCs, and catches the server's errors by tag,
// typed as they were on the server.

/** How the browser reaches the server: RPC over HTTP, as JSON, at `url`. */
export const Transport = (url: string) =>
	RpcClient.layerProtocolHttp({ url }).pipe(
		Layer.provide(RpcSerialization.layerJson),
		Layer.provide(FetchHttpClient.layer),
	);

export const showProducts = Effect.gen(function* () {
	const rpc = yield* RpcClient.make(ProductRpcs);

	const phones = yield* rpc.SearchProducts({ query: "phone", limit: 3 });
	yield* Console.log("Search for phone:");
	for (const phone of phones) {
		yield* Console.log(`  ${phone.title}, $${phone.price}`);
	}

	// A 404 on the server is a ProductNotFound here.
	yield* rpc.GetProduct({ id: 9999 }).pipe(
		Effect.flatMap((product) => Console.log(product.title)),
		Effect.catchTag("ProductNotFound", (error) =>
			Console.log(`\nGetProduct 9999: ${error.message}`),
		),
	);

	// Any other status is an HttpError, with the body decoded again from
	// the response text: an ApiProblem, as it was on the server.
	yield* rpc.SearchProducts({ query: "phone", limit: -1 }).pipe(
		Effect.asVoid,
		Effect.catchTag("HttpError", (error) =>
			Console.log(
				`\nSearchProducts with limit -1: HTTP ${error.status}, ${error.body?.message ?? error.text}`,
			),
		),
	);
}).pipe(Effect.scoped);
