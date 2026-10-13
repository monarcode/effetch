import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { bearer, logger, retry, timeout } from "@monarcode/effetch/plugins";

const Todo = Schema.Struct({
	id: Schema.Finite,
	title: Schema.String,
	done: Schema.Boolean,
});

const Tokens = Schema.Struct({ accessToken: Schema.String });

const ApiError = Schema.Struct({ code: Schema.String, message: Schema.String });

const session: { accessToken: string | undefined } = {
	accessToken: undefined,
};

export const makeApi = Fetch.make({
	baseUrl: "https://api.example.com",
	defaultError: ApiError,
	plugins: [
		logger({ level: "Info" }),
		retry(),
		timeout({ duration: "10 seconds" }),
		bearer({ token: () => session.accessToken }),
	],
});

export class Api extends Context.Service<Api, Effect.Success<typeof makeApi>>()(
	"Api",
) {}

export const ApiLive = Layer.effect(Api)(makeApi).pipe(
	Layer.provide(FetchHttpClient.layer),
);

export const signIn = (email: string, password: string) =>
	Effect.gen(function* () {
		const api = yield* Api;
		const { accessToken } = yield* api.post("/auth/login", {
			body: { email, password },
			output: Tokens,
			plugins: { bearer: false },
		});
		session.accessToken = accessToken;
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
			timeout: { duration: "2 minutes" },
			retry: { times: 0 },
		},
	});
});

export const isHealthy = Effect.gen(function* () {
	const api = yield* Api;
	return yield* api
		.head("/health", { plugins: { logger: false, retry: false } })
		.pipe(
			Effect.as(true),
			Effect.catchTag("HttpError", () => Effect.succeed(false)),
		);
});

export const program = (email: string, password: string) =>
	Effect.gen(function* () {
		yield* signIn(email, password);
		const todos = yield* listTodos;
		return todos.filter((todo) => !todo.done).length;
	}).pipe(
		Effect.catchTags({
			TimeoutError: (error) =>
				Effect.fail(`${error.url} didn't answer within ${error.duration}`),
			HttpError: (error) =>
				Effect.fail(error.body?.message ?? `HTTP ${error.status}`),
			NetworkError: () => Effect.fail("You appear to be offline"),
			DecodeError: (error) =>
				Effect.fail(`Unexpected response: ${error.message}`),
		}),
	);

export const main = (email: string, password: string) =>
	program(email, password).pipe(Effect.provide(ApiLive));
