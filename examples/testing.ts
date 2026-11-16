import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { FetchTest } from "@monarcode/effetch/test";

import { AppApiClient } from "./app/infrastructure/http/app-api-client.js";
import { SessionExpired } from "./app/infrastructure/http/plugins.js";
import {
	createTodo,
	getTodo,
	listTodos,
	removeTodo,
	TodoNotFound,
} from "./app/modules/todos/contract/todos.js";
import { TodoApi } from "./app/modules/todos/public.js";

// Tests for the todos module of `app/`, against a fake backend made from its
// endpoints. The module runs as in production: the real `AppApiClient`, with
// its plugins, `defaultError` and `statusErrors`. Only the `HttpClient` under
// it is fake.
//
// Each test is an Effect that fails when a check doesn't hold, so any test
// runner can run it: `it.effect` with `@effect/vitest`, or
// `Effect.runPromise` in Jest, Bun or Deno.

const due = new Date(Date.UTC(2026, 0, 31));

/** The fake backend: one handler per endpoint the tests call. */
const Backend = FetchTest.layer([
	// `params.id` is a string, as it is in a URL.
	FetchTest.respond(getTodo, ({ params }) =>
		Effect.succeed(
			params.id === "1"
				? { id: 1, title: "Write docs", done: false, due }
				: // Decoded by the client into `TodoNotFound`, by `statusErrors`.
					FetchTest.reply(404, { message: `No todo ${params.id}` }),
		),
	),
	// `body` is decoded with `NewTodo`, so `due` is a `Date` here, and the
	// result is encoded with `Todo`, so it goes back as a string.
	FetchTest.respond(
		createTodo,
		({ body }) => Effect.succeed({ id: 2, done: false, ...body }),
		{ status: 201 },
	),
	FetchTest.respond(removeTodo, () => Effect.void),
	// `fail` encodes the body with the client's `statusErrors` schema for
	// 401, once the endpoint is bound: here the definition has none, so it's
	// sent as it is, and the client decodes it into `SessionExpired`.
	FetchTest.fail(listTodos, 401, { message: "Session expired" }),
]);

/**
 * The module's layer on the fake backend. `provideMerge` keeps the
 * backend's `Recorder` reachable from the tests, for `FetchTest.requests`.
 */
const TestLayer = TodoApi.layer.pipe(
	Layer.provide(AppApiClient.layer),
	Layer.provideMerge(Backend),
	Layer.provide(
		ConfigProvider.layer(
			ConfigProvider.fromUnknown({ APP_API_URL: "https://api.test/v1" }),
		),
	),
);

/** Fails the test with `message` unless `ok`. */
const check = (ok: boolean, message: string) =>
	ok ? Effect.void : Effect.die(new Error(message));

export const getsATodo = Effect.gen(function* () {
	const todos = yield* TodoApi;
	const todo = yield* todos.get({ params: { id: 1 } });
	yield* check(todo.due instanceof Date, "due should be decoded to a Date");
	yield* check(todo.title === "Write docs", `unexpected title ${todo.title}`);
}).pipe(Effect.provide(TestLayer));

export const failsWithTodoNotFound = Effect.gen(function* () {
	const todos = yield* TodoApi;
	const error = yield* Effect.flip(todos.get({ params: { id: 9 } }));
	yield* check(
		error instanceof TodoNotFound && error.message === "No todo 9",
		`expected TodoNotFound, got ${String(error)}`,
	);
}).pipe(Effect.provide(TestLayer));

export const createsATodo = Effect.gen(function* () {
	const todos = yield* TodoApi;
	const todo = yield* todos.create({ body: { title: "Ship rc.3", due } });
	yield* check(todo.id === 2, `unexpected id ${todo.id}`);
	// What was sent, as the backend received it.
	const [sent] = yield* FetchTest.requests;
	yield* check(
		sent?.url === "https://api.test/v1/todos",
		`unexpected URL ${sent?.url}`,
	);
	yield* check(
		JSON.stringify(sent?.body) ===
			JSON.stringify({ title: "Ship rc.3", due: due.toISOString() }),
		`unexpected body ${JSON.stringify(sent?.body)}`,
	);
}).pipe(Effect.provide(TestLayer));

export const removesATodo = Effect.gen(function* () {
	const todos = yield* TodoApi;
	const response = yield* todos.remove({ params: { id: 1 } });
	yield* check(
		response.status === 204,
		`unexpected status ${response.status}`,
	);
}).pipe(Effect.provide(TestLayer));

export const failsWithSessionExpired = Effect.gen(function* () {
	const todos = yield* TodoApi;
	const error = yield* Effect.flip(todos.list());
	yield* check(
		error instanceof SessionExpired,
		`expected SessionExpired, got ${String(error)}`,
	);
}).pipe(Effect.provide(TestLayer));
