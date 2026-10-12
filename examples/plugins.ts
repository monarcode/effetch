import * as Context from "effect/Context";
import * as Data from "effect/Data";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";

const Todo = Schema.Struct({
	id: Schema.Finite,
	title: Schema.String,
	done: Schema.Boolean,
});

const Tokens = Schema.Struct({ accessToken: Schema.String });

const ApiError = Schema.Struct({ code: Schema.String, message: Schema.String });

export class SessionExpired extends Data.TaggedError("SessionExpired")<{}> {}

export class DeadlineExceeded extends Data.TaggedError("DeadlineExceeded")<{
	readonly method: string;
	readonly url: string;
}> {}

export class Session extends Context.Service<
	Session,
	{
		readonly accessToken: Effect.Effect<string | undefined>;
		readonly signIn: (accessToken: string) => Effect.Effect<void>;
		readonly signOut: Effect.Effect<void>;
	}
>()("Session") {}

export const SessionLive = Layer.effect(Session)(
	Effect.gen(function* () {
		const token = yield* Ref.make<string | undefined>(undefined);
		return {
			accessToken: Ref.get(token),
			signIn: (accessToken: string) => Ref.set(token, accessToken),
			signOut: Ref.set(token, undefined),
		};
	}),
);

/**
 * Sends the session's access token, and signs out and fails with
 * `SessionExpired` when the API answers 401. It needs `Session`, so `make`
 * does too; the calls don't.
 */
const auth = Fetch.plugin({
	name: "auth",
	onRequest: (request) =>
		Effect.gen(function* () {
			const session = yield* Session;
			const token = yield* session.accessToken;
			return token === undefined
				? request
				: HttpClientRequest.bearerToken(request, token);
		}),
	onResponse: (response) =>
		Effect.gen(function* () {
			if (response.status !== 401) {
				return response;
			}
			const session = yield* Session;
			yield* session.signOut;
			return yield* new SessionExpired();
		}),
});

/** Pins the API version. A call can ask for another one. */
const apiVersion = Fetch.plugin({
	name: "apiVersion",
	defaults: { version: "2024-06-01" },
	onRequest: (request, ctx) =>
		Effect.succeed(
			HttpClientRequest.setHeader(
				request,
				"api-version",
				ctx.options.version,
			),
		),
});

const deadlineDefaults: { readonly duration: Duration.Input } = {
	duration: "10 seconds",
};

/**
 * Fails with `DeadlineExceeded` when no response arrives in time. Its
 * `wrap` encloses the plugins after it, so the deadline covers them too.
 */
const deadline = Fetch.plugin({
	name: "deadline",
	defaults: deadlineDefaults,
	wrap: (client, options) =>
		HttpClient.transform(client, (response, request) =>
			Effect.gen(function* () {
				const { duration } = yield* options;
				return yield* Effect.timeoutOrElse(response, {
					duration,
					orElse: () =>
						Effect.fail(
							new DeadlineExceeded({
								method: request.method,
								url: request.url,
							}),
						),
				});
			}),
		),
});

/** Logs every failed call. It can't change the outcome. */
const reportErrors = Fetch.plugin({
	name: "reportErrors",
	onError: (error, ctx) =>
		Effect.logWarning(
			`${ctx.request.method} ${ctx.request.url} failed`,
			error,
		),
});

export const make = Fetch.make({
	baseUrl: "https://api.example.com",
	error: ApiError,
	plugins: [reportErrors, deadline, apiVersion, auth],
});

export class Api extends Context.Service<Api, Effect.Success<typeof make>>()(
	"Api",
) {}

export const ApiLive = Layer.effect(Api)(make).pipe(
	Layer.provide(FetchHttpClient.layer),
	Layer.provideMerge(SessionLive),
);

export const signIn = (email: string, password: string) =>
	Effect.gen(function* () {
		const api = yield* Api;
		const session = yield* Session;
		const { accessToken } = yield* api.post("/auth/login", {
			body: { email, password },
			output: Tokens,
			plugins: { auth: false },
		});
		yield* session.signIn(accessToken);
	});

export const listTodos = Effect.gen(function* () {
	const api = yield* Api;
	return yield* api.get("/todos", { output: Schema.Array(Todo) });
});

export const exportTodos = Effect.gen(function* () {
	const api = yield* Api;
	return yield* api.get("/todos/export", {
		output: Schema.Array(Todo),
		plugins: {
			deadline: { duration: "2 minutes" },
			apiVersion: { version: "2025-01-01" },
		},
	});
});

export const program = (email: string, password: string) =>
	Effect.gen(function* () {
		yield* signIn(email, password);
		const todos = yield* listTodos;
		return todos.length;
	}).pipe(
		Effect.catchTag("SessionExpired", () =>
			Effect.fail("Please sign in again"),
		),
		Effect.catchTag("DeadlineExceeded", (error) =>
			Effect.fail(`${error.method} ${error.url} took too long`),
		),
		Effect.catchTag("HttpError", (error) =>
			Effect.fail(error.body?.message ?? `HTTP ${error.status}`),
		),
		Effect.catchTag("NetworkError", () =>
			Effect.fail("You appear to be offline"),
		),
		Effect.catchTag("DecodeError", (error) =>
			Effect.fail(`Unexpected response: ${error.message}`),
		),
	);

export const main = (email: string, password: string) =>
	program(email, password).pipe(Effect.provide(ApiLive));
