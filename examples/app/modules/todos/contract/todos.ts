import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";

// The module's wire formats, and its endpoints next to the schemas they use.
// The endpoints are defined without a client, so they can be read (route,
// method, schemas) at module level; `data/todo.api.ts` binds them to the
// client the module talks to.

export const Todo = Schema.Struct({
	id: Schema.Finite,
	title: Schema.String,
	done: Schema.Boolean,
	due: Schema.Date,
});
export type Todo = typeof Todo.Type;

export const TodoPage = Schema.Struct({
	todos: Schema.Array(Todo),
	total: Schema.Finite,
});
export type TodoPage = typeof TodoPage.Type;

export const NewTodo = Schema.Struct({
	title: Schema.String,
	due: Schema.Date,
});
export type NewTodo = typeof NewTodo.Type;

export const TodoPatch = Schema.Struct({ done: Schema.Boolean });
export type TodoPatch = typeof TodoPatch.Type;

export const listTodos = Fetch.endpoint("GET /todos", { output: TodoPage });
export const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
export const createTodo = Fetch.endpoint("POST /todos", {
	input: NewTodo,
	output: Todo,
});
export const updateTodo = Fetch.endpoint("PATCH /todos/:id", {
	input: TodoPatch,
	output: Todo,
	headers: { "content-type": "application/merge-patch+json" },
});
export const removeTodo = Fetch.endpoint("DELETE /todos/:id");
