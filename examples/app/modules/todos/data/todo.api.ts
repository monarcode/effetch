import { Fetch } from "@monarcode/effetch";

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
// `TodoApi.layer` binds them to the shared client once, when it's built.

export class TodoApi extends Fetch.Endpoints<TodoApi>()(
	"modules/todos/TodoApi",
	AppApiClient,
	{
		list: listTodos,
		get: getTodo,
		create: createTodo,
		update: updateTodo,
		remove: removeTodo,
	},
) {}
