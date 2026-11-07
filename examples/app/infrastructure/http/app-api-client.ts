import * as Config from "effect/Config";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { logger, retry } from "@monarcode/effetch/plugins";

import { auth, reportErrors, SessionExpired } from "./plugins.js";

// The app's main backend: how to reach it, and nothing else. No endpoints
// and no module schemas live here, so this file stays the same size however
// many endpoints the modules define, and it never imports a module. What a
// status means from every endpoint, such as a 401, belongs here; what it
// means from one endpoint belongs with that endpoint.

/** The body of this backend's non-2xx responses. */
export const AppApiError = Schema.Struct({
	code: Schema.String,
	message: Schema.String,
});

const makeAppApiClient = Fetch.make({
	baseUrl: Config.String("APP_API_URL"),
	defaultError: AppApiError,
	statusErrors: { 401: SessionExpired },
	plugins: [logger(), reportErrors("app"), retry(), auth],
});

export class AppApiClient extends Context.Service<
	AppApiClient,
	Effect.Success<typeof makeAppApiClient>
>()("infrastructure/http/AppApiClient") {}

export const AppApiClientLive = Layer.effect(AppApiClient)(makeAppApiClient);
