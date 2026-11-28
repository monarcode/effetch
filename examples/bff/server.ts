import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";
import * as HttpRouter from "effect/http/HttpRouter";
import * as Layer from "effect/Layer";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";

import { Fetch } from "@monarcode/effetch";
import { retry, timeout } from "@monarcode/effetch/plugins";

import { getProduct, ProductRpcs, searchProducts } from "./shared.ts";

// The server: it calls DummyJSON with Effetch, and serves the RPCs. Only
// the server imports this file.

class DummyJson extends Fetch.Service<DummyJson>()("DummyJson", {
	baseUrl: "https://dummyjson.com",
	plugins: [retry(), timeout({ duration: "10 seconds" })],
}) {}

// Each handler returns the call as it is: its errors go to the browser
// through the RPC's `error` codec.
const Handlers = ProductRpcs.toLayer(
	Effect.gen(function* () {
		const dummyJson = yield* DummyJson;
		const product = dummyJson.bind(getProduct);
		const search = dummyJson.bind(searchProducts);
		return {
			GetProduct: ({ id }) => product({ params: { id } }),
			SearchProducts: ({ query, limit }) =>
				search({ query: { q: query, limit, select: "title,price" } }).pipe(
					Effect.map((page) => page.products),
				),
		};
	}),
);

/**
 * The server as a web handler. `server.handler(request)` takes a `Request`
 * and returns a `Response`, as `Deno.serve`, `Bun.serve` and most Node.js
 * adapters expect. `httpClient` is what it calls DummyJSON with, and
 * `server.dispose()` releases what it holds.
 */
export const makeServer = (httpClient: Layer.Layer<HttpClient.HttpClient>) =>
	HttpRouter.toWebHandler(
		RpcServer.layerHttp({
			group: ProductRpcs,
			path: "/rpc",
			protocol: "http",
		}).pipe(
			Layer.provide(
				Layer.mergeAll(
					Handlers.pipe(Layer.provide(DummyJson.layer)),
					RpcSerialization.layerJson,
				),
			),
			Layer.provide(httpClient),
		),
		{ disableLogger: true },
	);
