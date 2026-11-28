import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Headers from "effect/http/Headers";
import * as Option from "effect/Option";
import * as Rpc from "effect/rpc/Rpc";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import { Fetch } from "../src/index.js";
import { TimeoutError } from "../src/plugins/index.js";
import { setup } from "./utils/client.js";
import { failure, type Step } from "./utils/mockClient.js";
import { reply } from "./utils/reply.js";

class ApiProblem extends Schema.Class<ApiProblem>("ApiProblem")({
	code: Schema.String,
}) {
	get retryable() {
		return this.code === "rate_limited";
	}
}

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
	id: Schema.Finite,
}) {}

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });

const config = {
	defaultError: ApiProblem,
	statusErrors: { 404: TodoNotFound },
} as const;

class Api extends Fetch.Service<Api>()("Api", {
	baseUrl: "https://api.test",
	...config,
}) {}

/** Encodes `value` to JSON text, as an RPC or a page would send it. */
const send = <A>(schema: Schema.Codec<A, unknown>, value: A): string =>
	JSON.stringify(Schema.encodeUnknownSync(Schema.toCodecJson(schema))(value));

/** Decodes what `send` sent. */
const receive = <A>(schema: Schema.Codec<A, unknown>, wire: string): A =>
	Schema.decodeUnknownSync(Schema.toCodecJson(schema))(JSON.parse(wire));

/** The error `getTodo` fails with when the server answers with `step`. */
const failWith = (step: Step) =>
	Effect.gen(function* () {
		const { api } = yield* setup([step], config);
		const todos = api.bind(getTodo);
		return { todos, error: yield* Effect.flip(todos({ params: { id: 9 } })) };
	});

describe("Fetch.errorCodec", () => {
	it.effect("sends an HttpError and decodes its body again", () =>
		Effect.gen(function* () {
			const { todos, error } = yield* failWith(
				reply.json(
					{ code: "rate_limited" },
					{ status: 429, headers: { "set-cookie": "session=secret" } },
				),
			);
			const schema = Fetch.errorCodec(todos);
			const wire = send(schema, error);
			expect(JSON.parse(wire)).toStrictEqual({
				_tag: "HttpError",
				method: "GET",
				url: "https://api.test/todos/9",
				status: 429,
				text: '{"code":"rate_limited"}',
			});
			expect(wire).not.toContain("secret");
			const back = receive(schema, wire);
			expect(back).toBeInstanceOf(Fetch.HttpError);
			const http = back as Fetch.HttpError.With<ApiProblem>;
			expect(http.body).toBeInstanceOf(ApiProblem);
			expect(http.body?.retryable).toBe(true);
			expect(Object.keys(http.headers)).toStrictEqual([]);
			expect(http.message).toBe("GET https://api.test/todos/9: HTTP 429");
		}),
	);

	it.effect(
		"decodes a body that doesn't match as undefined, as the call did",
		() =>
			Effect.gen(function* () {
				const { todos, error } = yield* failWith(
					reply.text("Bad gateway", { status: 502 }),
				);
				const back = receive(
					Fetch.errorCodec(todos),
					send(Fetch.errorCodec(todos), error),
				) as Fetch.HttpError;
				expect(back.body).toBeUndefined();
				expect(back.text).toBe("Bad gateway");
			}),
	);

	it.effect("sends the statusErrors errors as their schemas encode them", () =>
		Effect.gen(function* () {
			const { todos, error } = yield* failWith(
				reply.json({ id: 9 }, { status: 404 }),
			);
			expect(error).toBeInstanceOf(TodoNotFound);
			const back = receive(
				Fetch.errorCodec(todos),
				send(Fetch.errorCodec(todos), error),
			);
			expect(back).toBeInstanceOf(TodoNotFound);
			expect(back).toMatchObject({ id: 9 });
		}),
	);

	it.effect("sends a NetworkError without its cause", () =>
		Effect.gen(function* () {
			const { todos, error } = yield* failWith(failure());
			const wire = send(Fetch.errorCodec(todos), error);
			expect(JSON.parse(wire)).toStrictEqual({
				_tag: "NetworkError",
				method: "GET",
				url: "https://api.test/todos/9",
			});
			const back = receive(Fetch.errorCodec(todos), wire);
			expect(back).toBeInstanceOf(Fetch.NetworkError);
		}),
	);

	it.effect("sends a DecodeError without its issue", () =>
		Effect.gen(function* () {
			const { todos, error } = yield* failWith(reply.json({ id: "nine" }));
			expect(error).toBeInstanceOf(Fetch.DecodeError);
			const wire = send(Fetch.errorCodec(todos), error);
			expect(JSON.parse(wire)).not.toHaveProperty("issue");
			const back = receive(Fetch.errorCodec(todos), wire);
			expect(back).toBeInstanceOf(Fetch.DecodeError);
			expect((back as Fetch.DecodeError).issue).toBeUndefined();
		}),
	);

	it.effect("reads a definition's schemas with its client's", () =>
		Effect.gen(function* () {
			const { error } = yield* failWith(
				reply.json({ code: "rate_limited" }, { status: 429 }),
			);
			const schema = Fetch.errorCodec(getTodo, { client: Api });
			const back = receive(schema, send(schema, error));
			expect((back as Fetch.HttpError.With<ApiProblem>).body).toBeInstanceOf(
				ApiProblem,
			);
			const notFound = new TodoNotFound({ id: 9 });
			expect(receive(schema, send(schema, notFound))).toBeInstanceOf(
				TodoNotFound,
			);
		}),
	);

	it.effect("takes the schemas themselves, for the plain methods", () =>
		Effect.gen(function* () {
			const { error } = yield* failWith(
				reply.json({ code: "down" }, { status: 503 }),
			);
			const schema = Fetch.errorCodec({
				error: ApiProblem,
				statusErrors: { 404: TodoNotFound },
			});
			const back = receive(schema, send(schema, error));
			expect((back as Fetch.HttpError.With<ApiProblem>).body).toBeInstanceOf(
				ApiProblem,
			);
		}),
	);

	it("sends a plain HttpError body as JSON without an error schema", () => {
		const schema = Fetch.errorCodec({});
		const error = new Fetch.HttpError({
			method: "GET",
			url: "/x",
			status: 500,
			headers: Headers.empty,
			text: '{"a":1}',
			body: { a: 1 },
		});
		expect(
			(receive(schema, send(schema, error)) as Fetch.HttpError).body,
		).toStrictEqual({ a: 1 });
	});

	it("adds the errors given, such as a plugin's", () => {
		const timedOut = new TimeoutError({
			method: "GET",
			url: "/x",
			duration: "5 seconds",
		});
		expect(() => send(Fetch.errorCodec({}) as never, timedOut)).toThrow();
		const schema = Fetch.errorCodec({}, { errors: [TimeoutError] });
		expect(receive(schema, send(schema, timedOut))).toBeInstanceOf(
			TimeoutError,
		);
	});

	it("keeps schemas without a _tag from taking other errors", () => {
		const Loose = Schema.Struct({ message: Schema.String });
		const schema = Fetch.errorCodec(
			{ statusErrors: { 400: Loose, 404: TodoNotFound } },
			{ errors: [TimeoutError] },
		);
		expect(
			receive(schema, send(schema, new TodoNotFound({ id: 9 }))),
		).toBeInstanceOf(TodoNotFound);
		const timedOut = new TimeoutError({
			method: "GET",
			url: "/x",
			duration: "5 seconds",
		});
		expect(receive(schema, send(schema, timedOut))).toBeInstanceOf(
			TimeoutError,
		);
		expect(receive(schema, send(schema, { message: "m" }))).toStrictEqual({
			message: "m",
		});
	});

	it("tells schemas without a _tag apart, even with the same fields", () => {
		class Invalid extends Schema.Class<Invalid>("Invalid")({
			code: Schema.String,
		}) {}
		class Conflict extends Schema.Class<Conflict>("Conflict")({
			code: Schema.String,
		}) {}
		const schema = Fetch.errorCodec({
			statusErrors: { 400: Invalid, 409: Conflict },
		});
		const wire = send(schema, new Conflict({ code: "c" }));
		expect(JSON.parse(wire)).toStrictEqual({
			_tag: "effetch/UntaggedError",
			index: 1,
			error: { code: "c" },
		});
		expect(receive(schema, wire)).toBeInstanceOf(Conflict);
		expect(
			receive(schema, send(schema, new Invalid({ code: "i" }))),
		).toBeInstanceOf(Invalid);
	});

	it("reads statusErrors as calls do", () => {
		const schema = Fetch.errorCodec({
			statusErrors: {
				404: undefined,
				notAStatus: Schema.Struct({ method: Schema.String }),
			} as unknown as Fetch.StatusErrorMap,
		});
		const timedOut = new TimeoutError({
			method: "GET",
			url: "/x",
			duration: "1 second",
		});
		// Neither entry is a schema calls try, so neither is a member.
		expect(() => send(schema as never, timedOut)).toThrow();
	});

	it("keeps an HttpError from a loose status error schema", () => {
		const Loose = Schema.Struct({ status: Schema.Finite });
		const schema = Fetch.errorCodec({ statusErrors: { 409: Loose } });
		const error = new Fetch.HttpError({
			method: "GET",
			url: "/x",
			status: 409,
			headers: Headers.empty,
			text: "",
			body: undefined,
		});
		expect(receive(schema, send(schema, error))).toBeInstanceOf(
			Fetch.HttpError,
		);
	});

	it.effect("crosses an RPC as its error", () =>
		Effect.gen(function* () {
			const { todos, error } = yield* failWith(
				reply.json({ code: "rate_limited" }, { status: 429 }),
			);
			const GetTodo = Rpc.make("GetTodo", {
				success: Todo,
				error: Fetch.errorCodec(todos, { errors: [TimeoutError] }),
			});
			// What RpcSerialization.json does with a result.
			const codec = Schema.toCodecJson(Rpc.exitSchema(GetTodo));
			const wire = JSON.stringify(
				Schema.encodeUnknownSync(codec)(Exit.fail(error)),
			);
			const exit = Schema.decodeUnknownSync(codec)(
				JSON.parse(wire),
			) as Exit.Exit<unknown, unknown>;
			const back = Option.getOrThrow(Exit.findErrorOption(exit));
			expect(back).toBeInstanceOf(Fetch.HttpError);
			expect((back as Fetch.HttpError.With<ApiProblem>).body).toBeInstanceOf(
				ApiProblem,
			);
		}),
	);
});
