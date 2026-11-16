import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";

const Todo = Schema.Struct({
	id: Schema.Finite,
	title: Schema.String,
	done: Schema.Boolean,
});

const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });

const ApiError = Schema.Struct({ code: Schema.String, message: Schema.String });

class Api extends Fetch.Service<Api>()("Api", {
	baseUrl: "https://api.example.com",
	headers: { accept: "application/json" },
	defaultError: ApiError,
}) {}

export const ApiLive = Api.layer.pipe(Layer.provide(FetchHttpClient.layer));

export const program = Effect.gen(function* () {
	const api = yield* Api;

	const created = yield* api.post("/todos", {
		input: NewTodo,
		body: { title: "Write docs", due: new Date() },
		output: Todo,
	});

	const todos = yield* api.get("/todos", {
		query: { page: 1, done: false, tags: ["work", "urgent"] },
		output: Schema.Array(Todo),
	});

	const updated = yield* api.patch("/todos/:id", {
		params: { id: created.id },
		body: { done: true },
		output: Todo,
	});

	yield* api.del("/todos/:id", { params: { id: updated.id } });

	return todos.length;
}).pipe(
	// A 404 is handled on its own; any other error status is caught below.
	Fetch.catchStatus(404, () => Effect.succeed(0)),
	Effect.catchTags({
		HttpError: (error) =>
			Effect.fail(error.body?.message ?? `HTTP ${error.status}`),
		NetworkError: () => Effect.fail("You appear to be offline"),
		DecodeError: (error) =>
			Effect.fail(`Unexpected response: ${error.message}`),
	}),
);

export const main = program.pipe(Effect.provide(ApiLive));
