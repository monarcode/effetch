import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";

const Todo = Schema.Struct({
	id: Schema.Number,
	title: Schema.String,
	done: Schema.Boolean,
});

const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });

const ApiError = Schema.Struct({ code: Schema.String, message: Schema.String });

const make = Fetch.make({
	baseUrl: "https://api.example.com",
	headers: { accept: "application/json" },
	error: ApiError,
});

class Api extends Context.Service<Api, Effect.Success<typeof make>>()("Api") {}

export const ApiLive = Layer.effect(Api)(make).pipe(
	Layer.provide(FetchHttpClient.layer),
);

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
	Effect.catchTag("HttpError", (error) =>
		error.status === 404
			? Effect.succeed(0)
			: Effect.fail(error.body?.message ?? `HTTP ${error.status}`),
	),
	Effect.catchTag("NetworkError", () =>
		Effect.fail("You appear to be offline"),
	),
	Effect.catchTag("DecodeError", (error) =>
		Effect.fail(`Unexpected response: ${error.message}`),
	),
);

export const main = program.pipe(Effect.provide(ApiLive));
