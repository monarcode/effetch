import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { bearer } from "@monarcode/effetch/plugins";

// Plugins and errors shared by the app's clients. Plugins are plain values,
// so one `auth` serves every backend that takes the same token.

export const session: { accessToken: string | undefined } = {
	accessToken: undefined,
};

export const auth = bearer({ token: () => session.accessToken });

/**
 * What a 401 means from any of the app's backends: the token is no longer
 * valid. Each client turns it into this error with `statusErrors`.
 */
export class SessionExpired extends Schema.TaggedError<SessionExpired>()(
	"SessionExpired",
	{ message: Schema.String },
) {}

// `ctx.route` is a method and a path, with no host: two backends can both
// have a `GET /health`. A plugin that groups by route takes the backend's
// name, and each client gets its own instance.
export const reportErrors = (backend: string) =>
	Fetch.plugin({
		name: "reportErrors",
		onError: (error, ctx) =>
			Effect.logWarning(`${backend} ${ctx.route} failed`, error),
	});
