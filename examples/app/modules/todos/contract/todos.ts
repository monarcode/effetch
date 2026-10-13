import * as Schema from "effect/Schema";

// The module's wire formats. Its endpoints import these; nothing outside the
// module needs to.

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
