import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AppApiClient } from "../../../infrastructure/http/app-api-client.js";
import {
	createTodo,
	getTodo,
	listTodos,
	removeTodo,
	updateTodo,
} from "../contract/todos.js";

// The module's endpoints are its data service. They're defined in
// `contract/todos.ts`, next to their schemas; here each is bound to the
// client, one line per operation, and every type (params, body, success and
// errors) is inferred: there's no interface to keep in step.
//
// `AppApiClient.useSync` reads the shared client once, when the layer is
// built.

const makeTodoApi = AppApiClient.useSync((client) => ({
	list: client.bind(listTodos),
	get: client.bind(getTodo),
	create: client.bind(createTodo),
	update: client.bind(updateTodo),
	remove: client.bind(removeTodo),
}));

export class TodoApi extends Context.Service<
	TodoApi,
	Effect.Success<typeof makeTodoApi>
>()("modules/todos/TodoApi") {}

export const TodoApiLive = Layer.effect(TodoApi)(makeTodoApi);
