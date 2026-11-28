import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";

import { showProducts, Transport } from "./client.ts";
import { makeServer } from "./server.ts";

// A server that calls DummyJSON, and a browser client that calls the
// server over Effect RPC, with the call's errors going across as JSON:
//
//   pnpm example bff
//
// In an app, the server runs behind `Deno.serve(server.handler)` or the
// like, and the browser's RPC client uses `fetch`. Here the client's `fetch`
// calls the handler directly, so both run in one process, with real HTTP
// requests and JSON between them.

const server = makeServer(FetchHttpClient.layer);

// Prints each failure as it crossed the wire.
const fetchServer: typeof fetch = async (input, init) => {
	const response = await server.handler(new Request(input, init));
	const text = await response.clone().text();
	if (text.includes('"Failure"')) console.log(`  (the wire: ${text.trim()})`);
	return response;
};

const Browser = Transport("http://server.local/rpc").pipe(
	Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchServer)),
);

await Effect.runPromise(showProducts.pipe(Effect.provide(Browser)));
await server.dispose();
