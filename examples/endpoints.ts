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
	due: Schema.Date,
});

const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });

const Credentials = Schema.Struct({
	email: Schema.String,
	password: Schema.String,
});

const Tokens = Schema.Struct({ accessToken: Schema.String });

const ApiError = Schema.Struct({ code: Schema.String, message: Schema.String });

const session: { accessToken: string | undefined } = {
	accessToken: undefined,
};

// The endpoints are defined once, with the client, and the service exposes
// them as its methods.
const make = Effect.gen(function* () {
	const api = yield* Fetch.make({
		baseUrl: "https://api.example.com",
		defaultError: ApiError,
		plugins: [
			logger({ level: "Info" }),
			retry(),
			timeout({ duration: "10 seconds" }),
			bearer({ token: () => session.accessToken }),
		],
	});
	return {
		login: api.endpoint("POST /auth/login", {
			input: Credentials,
			output: Tokens,
			plugins: { bearer: false },
		}),
		listTodos: api.endpoint("GET /todos", { output: Schema.Array(Todo) }),
		getTodo: api.endpoint("GET /todos/:id", { output: Todo }),
		createTodo: api.endpoint("POST /todos", { input: NewTodo, output: Todo }),
		completeTodo: api.endpoint("PATCH /todos/:id", {
			output: Todo,
			headers: { "content-type": "application/merge-patch+json" },
		}),
		deleteTodo: api.endpoint("DELETE /todos/:id"),
		exportTodos: api.endpoint("GET /todos/export", {
			output: Schema.Array(Todo),
			plugins: { timeout: { duration: "2 minutes" }, retry: false },
		}),
	};
});

export class Api extends Context.Service<Api, Effect.Success<typeof make>>()(
	"Api",
) {}

export const ApiLive = Layer.effect(Api)(make).pipe(
	Layer.provide(FetchHttpClient.layer),
);

export const signIn = (email: string, password: string) =>
	Effect.gen(function* () {
		const { login } = yield* Api;
		const { accessToken } = yield* login({ body: { email, password } });
		session.accessToken = accessToken;
	});

export const program = (email: string, password: string) =>
	Effect.gen(function* () {
		yield* signIn(email, password);
		const api = yield* Api;

		const created = yield* api.createTodo({
			body: { title: "Write docs", due: new Date() },
		});
		yield* api.completeTodo({
			params: { id: created.id },
			body: { done: true },
		});
		const open = yield* api.listTodos({ query: { done: false, page: 1 } });

		// A call can override what the endpoint set: this export is retried.
		const all = yield* api.exportTodos({
			plugins: { retry: { times: 2 } },
		});

		yield* api.deleteTodo({ params: { id: created.id } });
		return { open: open.length, all: all.length };
	}).pipe(
		Effect.catchTag("TimeoutError", (error) =>
			Effect.fail(`${error.url} didn't answer within ${error.duration}`),
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
