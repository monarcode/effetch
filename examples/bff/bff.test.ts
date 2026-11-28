import { afterAll, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as RpcClient from "effect/rpc/RpcClient";

import { Fetch } from "@monarcode/effetch";
import { FetchTest } from "@monarcode/effetch/test";

import { Transport } from "./client.ts";
import { makeServer } from "./server.ts";
import {
	ApiProblem,
	getProduct,
	ProductNotFound,
	ProductRpcs,
	searchProducts,
} from "./shared.ts";

// The whole trip: the browser's RPC client, the server, and its calls to a
// fake DummyJSON. The errors go from the server to the client as JSON.

const Backend = FetchTest.layer([
	FetchTest.respond(getProduct, ({ params }) =>
		Effect.succeed(
			params.id === "1"
				? { id: 1, title: "Mascara", price: 9.99 }
				: FetchTest.reply(404, {
						message: `Product with id '${params.id}' not found`,
					}),
		),
	),
	FetchTest.respond(searchProducts, ({ query }) =>
		Effect.succeed(
			query.limit < 1
				? FetchTest.reply(
						400,
						{ message: "Invalid 'limit'" },
						{ headers: { "set-cookie": "session=secret" } },
					)
				: {
						products: [{ id: 1, title: "Mascara", price: 9.99 }],
						total: 1,
					},
		),
	),
]);

const server = makeServer(Backend);
afterAll(() => server.dispose());

const Browser = Transport("http://server.test/rpc").pipe(
	Layer.provide(
		Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
			server.handler(new Request(input, init)),
		),
	),
);

/** Runs a test with the RPC client, as the browser would. */
const asBrowser = <A, E, R>(test: Effect.Effect<A, E, R>) =>
	test.pipe(Effect.scoped, Effect.provide(Browser));

describe("The browser's RPC client", () => {
	it.effect("gets what the server's call returned", () =>
		asBrowser(
			Effect.gen(function* () {
				const rpc = yield* RpcClient.make(ProductRpcs);
				const product = yield* rpc.GetProduct({ id: 1 });
				expect(product.title).toBe("Mascara");
			}),
		),
	);

	it.effect("gets a 404 as a ProductNotFound", () =>
		asBrowser(
			Effect.gen(function* () {
				const rpc = yield* RpcClient.make(ProductRpcs);
				const error = yield* Effect.flip(rpc.GetProduct({ id: 9 }));
				expect(error).toBeInstanceOf(ProductNotFound);
				expect(error).toMatchObject({
					message: "Product with id '9' not found",
				});
			}),
		),
	);

	it.effect("gets an HttpError with its body, but not its headers", () =>
		asBrowser(
			Effect.gen(function* () {
				const rpc = yield* RpcClient.make(ProductRpcs);
				const error = yield* Effect.flip(
					rpc.SearchProducts({ query: "phone", limit: 0 }),
				);
				expect(error).toBeInstanceOf(Fetch.HttpError);
				const http = error as Fetch.HttpError.With<ApiProblem>;
				expect(http.status).toBe(400);
				expect(http.body).toBeInstanceOf(ApiProblem);
				expect(Object.keys(http.headers)).toStrictEqual([]);
			}),
		),
	);
});
