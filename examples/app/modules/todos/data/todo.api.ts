import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AppApiClient } from "../../../infrastructure/http/app-api-client.js";
import { NewTodo, Todo, TodoPage, TodoPatch } from "../contract/todos.js";

// The module's endpoints are its data service. Each operation is one line,
// next to the schemas it uses, and every type (params, body, success and
// errors) is inferred: there's no interface to keep in step.
//
// `AppApiClient.useSync` reads the shared client once, when the layer is
// built.

const makeTodoApi = AppApiClient.useSync((client) => ({
	list: client.endpoint("GET /todos", { output: TodoPage }),
	get: client.endpoint("GET /todos/:id", { output: Todo }),
	create: client.endpoint("POST /todos", { input: NewTodo, output: Todo }),
	update: client.endpoint("PATCH /todos/:id", {
		input: TodoPatch,
		output: Todo,
		headers: { "content-type": "application/merge-patch+json" },
	}),
	remove: client.endpoint("DELETE /todos/:id"),
}));

export class TodoApi extends Context.Service<
	TodoApi,
	Effect.Success<typeof makeTodoApi>
>()("modules/todos/TodoApi") {}

export const TodoApiLive = Layer.effect(TodoApi)(makeTodoApi);
