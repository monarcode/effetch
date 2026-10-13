import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";

import { AppApiClientLive } from "./infrastructure/http/app-api-client.js";
import { WalletApiClientLive } from "./infrastructure/http/wallet-api-client.js";
import { TodoModuleLive } from "./modules/todos/todo.layer.js";
import { WalletModuleLive } from "./modules/wallet/wallet.layer.js";

// The composition root: every module's layer, on top of the clients they
// use, on top of one HttpClient. Adding a module adds one line here.

const Clients = Layer.mergeAll(AppApiClientLive, WalletApiClientLive);

const Modules = Layer.mergeAll(TodoModuleLive, WalletModuleLive);

// `provideMerge` keeps the clients available too, for one-off calls that
// aren't worth an endpoint.
export const AppLayer = Modules.pipe(
	Layer.provideMerge(Clients),
	Layer.provide(FetchHttpClient.layer),
);
