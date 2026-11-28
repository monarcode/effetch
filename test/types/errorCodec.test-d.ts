// @effect-diagnostics floatingEffect:off

import type * as Effect from "effect/Effect";
import * as Rpc from "effect/rpc/Rpc";
import * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";

import { describe, expectTypeOf, it } from "vitest";

import { Fetch } from "../../src/index.js";
import { TimeoutError, type TimeoutPlugin } from "../../src/plugins/index.js";

class ApiProblem extends Schema.Class<ApiProblem>("ApiProblem")({
	code: Schema.String,
}) {}

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
	id: Schema.Finite,
}) {}

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
const deleteTodo = Fetch.endpoint("DELETE /todos/:id");

type StatusErrors = { readonly 404: typeof TodoNotFound };

declare const api: Fetch.Client<
	[TimeoutPlugin],
	typeof ApiProblem,
	StatusErrors
>;

class Api extends Fetch.Service<Api>()("Api", {
	baseUrl: "https://api.test",
	defaultError: ApiProblem,
	statusErrors: { 404: TodoNotFound },
}) {}

const todos = api.bind(getTodo);
type CallErrors =
	ReturnType<typeof todos> extends Effect.Effect<any, infer E, any>
		? E
		: never;

type ErrorsOf<C> = C extends Schema.Codec<infer E, any, any, any> ? E : never;

describe("Fetch.errorCodec", () => {
	it("types a bound endpoint's errors as its calls fail", () => {
		const schema = Fetch.errorCodec(todos, { errors: [TimeoutError] });
		expectTypeOf<ErrorsOf<typeof schema>>().toEqualTypeOf<CallErrors>();
		expectTypeOf<CallErrors>().toEqualTypeOf<
			| Fetch.NetworkError
			| Fetch.DecodeError
			| Fetch.HttpError.With<ApiProblem>
			| TodoNotFound
			| TimeoutError
		>();
	});

	it("writes out the members of ErrorCodecErrors", () => {
		const schema = Fetch.errorCodec(todos, { errors: [TimeoutError] });
		expectTypeOf<ErrorsOf<typeof schema>>().toEqualTypeOf<
			Fetch.ErrorCodecErrors<typeof todos, undefined, [typeof TimeoutError]>
		>();
		const fromDefinition = Fetch.errorCodec(deleteTodo, { client: Api });
		expectTypeOf<ErrorsOf<typeof fromDefinition>>().toEqualTypeOf<
			Fetch.ErrorCodecErrors<typeof deleteTodo, typeof Api, []>
		>();
		expectTypeOf<
			Fetch.ErrorCodecErrors<
				{ readonly error: Schema.Struct<{ readonly code: Schema.String }> },
				undefined,
				[]
			>
		>().toEqualTypeOf<
			| Fetch.NetworkError
			| Fetch.HttpError.With<{ readonly code: string }>
			| Fetch.DecodeError
		>();
	});

	it("leaves plugins' errors to `errors`", () => {
		const schema = Fetch.errorCodec(todos);
		expectTypeOf<ErrorsOf<typeof schema>>().toEqualTypeOf<
			Exclude<CallErrors, TimeoutError>
		>();
	});

	it("reads a definition with its client", () => {
		const schema = Fetch.errorCodec(getTodo, { client: Api });
		expectTypeOf<ErrorsOf<typeof schema>>().toEqualTypeOf<
			Exclude<CallErrors, TimeoutError>
		>();
	});

	it("types a definition without a client with a plain HttpError", () => {
		const schema = Fetch.errorCodec(getTodo);
		expectTypeOf<ErrorsOf<typeof schema>>().toEqualTypeOf<
			Fetch.NetworkError | Fetch.DecodeError | Fetch.HttpError
		>();
	});

	it("takes the schemas themselves, with a DecodeError", () => {
		const schema = Fetch.errorCodec({
			error: ApiProblem,
			statusErrors: { 404: TodoNotFound },
		});
		expectTypeOf<ErrorsOf<typeof schema>>().toEqualTypeOf<
			Exclude<CallErrors, TimeoutError>
		>();
	});

	it("has no DecodeError without output", () => {
		const schema = Fetch.errorCodec(deleteTodo, { client: Api });
		expectTypeOf<ErrorsOf<typeof schema>>().toEqualTypeOf<
			Fetch.NetworkError | Fetch.HttpError.With<ApiProblem> | TodoNotFound
		>();
	});

	it("has a DecodeError for a stream without output", () => {
		const events = api.endpoint("GET /events", { stream: "sse" });
		type StreamErrors =
			ReturnType<typeof events> extends Stream.Stream<any, infer E, any>
				? E
				: never;
		const schema = Fetch.errorCodec(events);
		expectTypeOf<ErrorsOf<typeof schema>>().toEqualTypeOf<
			Exclude<StreamErrors, TimeoutError>
		>();
		expectTypeOf<Fetch.DecodeError>().toExtend<ErrorsOf<typeof schema>>();
	});

	it("needs no services for schemas that need none", () => {
		const schema = Fetch.errorCodec(todos, { errors: [TimeoutError] });
		expectTypeOf(schema).toExtend<
			Schema.Codec<unknown, unknown, never, never>
		>();
		expectTypeOf(schema).toEqualTypeOf<
			Fetch.ErrorCodec<CallErrors, never, never>
		>();
	});

	it("is an RPC's error", () => {
		const GetTodo = Rpc.make("GetTodo", {
			success: Todo,
			error: Fetch.errorCodec(todos, { errors: [TimeoutError] }),
		});
		expectTypeOf<Rpc.Error<typeof GetTodo>>().toEqualTypeOf<CallErrors>();
	});

	it("rejects a client without a config", () => {
		// @ts-expect-error: `client` must be a Fetch.Service class or have one's `config`.
		Fetch.errorCodec(getTodo, { client: {} });
	});
});
