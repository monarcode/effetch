import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { bearer, logger, retry, timeout } from "@monarcode/effetch/plugins";

// The same app as `builtins.ts`, with endpoints: each route is defined once,
// next to its schemas, and shared as a service with `Fetch.Endpoints`.

const Todo = Schema.Struct({
	id: Schema.Finite,
	title: Schema.String,
	done: Schema.Boolean,
	due: Schema.Date,
});

const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });

const TodoFilters = Schema.Struct({
	done: Schema.optional(Schema.Boolean),
	page: Schema.optional(Schema.Finite),
});

const Credentials = Schema.Struct({
	email: Schema.String,
	password: Schema.String,
});

const Tokens = Schema.Struct({ accessToken: Schema.String });

const ApiError = Schema.Struct({ code: Schema.String, message: Schema.String });

const session: { accessToken: string | undefined } = {
	accessToken: undefined,
};

// --- The client ---

export class Api extends Fetch.Service<Api>()("examples/endpoints/Api", {
	baseUrl: "https://api.example.com",
	defaultError: ApiError,
	plugins: [
		logger({ level: "Info" }),
		retry(),
		timeout({ duration: "10 seconds" }),
		bearer({ token: () => session.accessToken }),
	],
}) {}

// --- The endpoints, with no client ---

export const login = Fetch.endpoint("POST /auth/login", {
	input: Credentials,
	output: Tokens,
});

export const listTodos = Fetch.endpoint("GET /todos", {
	query: TodoFilters,
	output: Schema.Array(Todo),
});

export const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });

export const createTodo = Fetch.endpoint("POST /todos", {
	input: NewTodo,
	output: Todo,
});

export const completeTodo = Fetch.endpoint("PATCH /todos/:id", {
	output: Todo,
	headers: { "content-type": "application/merge-patch+json" },
});

export const deleteTodo = Fetch.endpoint("DELETE /todos/:id");

export const exportTodos = Fetch.endpoint("GET /todos/export", {
	output: Schema.Array(Todo),
});

// --- The endpoints, bound to the client, as a service ---

// Plugin overrides are given when binding, where they're checked against
// `Api`'s plugins.
export class TodoApi extends Fetch.Endpoints<TodoApi>()(
	"examples/endpoints/TodoApi",
	Api,
	{
		login: [login, { plugins: { bearer: false } }],
		list: listTodos,
		get: getTodo,
		create: createTodo,
		complete: completeTodo,
		delete: deleteTodo,
		export: [
			exportTodos,
			{ plugins: { timeout: { duration: "2 minutes" }, retry: false } },
		],
	},
) {}

export const AppLayer = TodoApi.layer.pipe(
	Layer.provide(Api.layer),
	Layer.provide(FetchHttpClient.layer),
);

// --- Using them ---

export const signIn = (email: string, password: string) =>
	Effect.gen(function* () {
		const todos = yield* TodoApi;
		const { accessToken } = yield* todos.login({ body: { email, password } });
		session.accessToken = accessToken;
	});

export const program = (email: string, password: string) =>
	Effect.gen(function* () {
		yield* signIn(email, password);
		const todos = yield* TodoApi;

		const created = yield* todos.create({
			body: { title: "Write docs", due: new Date() },
		});
		yield* todos.complete({
			params: { id: created.id },
			body: { done: true },
		});
		const open = yield* todos.list({ query: { done: false, page: 1 } });

		// A call can override what the binding set: this export is retried.
		const all = yield* todos.export({
			plugins: { retry: { times: 2 } },
		});

		yield* todos.delete({ params: { id: created.id } });
		return { open: open.length, all: all.length };
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
	program(email, password).pipe(Effect.provide(AppLayer));
