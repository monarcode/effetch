import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Headers from "effect/http/Headers";
import * as Option from "effect/Option";
import * as Rpc from "effect/rpc/Rpc";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

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

/** Sends `value` with `schema`, and decodes what was sent. */
const roundTrip = (schema: Schema.Top, value: unknown): unknown => {
	const codec = schema as Schema.Codec<unknown, unknown>;
	return receive(codec, send(codec, value));
};

/** Runs `f` with `a` and `b`, then with them the other way round. */
const inBothOrders = <A, B>(
	a: A,
	b: B,
	f: (first: A | B, second: A | B) => void,
) => {
	f(a, b);
	f(b, a);
};

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
		inBothOrders(Invalid, Conflict, (a, b) => {
			const schema = Fetch.errorCodec({ statusErrors: { 400: a, 409: b } });
			const wire = send(schema, new Conflict({ code: "c" }));
			expect(JSON.parse(wire)).toStrictEqual({
				_tag: "effetch/UntaggedError",
				identifier: "Conflict",
				error: { code: "c" },
			});
			expect(receive(schema, wire)).toBeInstanceOf(Conflict);
			expect(roundTrip(schema, new Invalid({ code: "i" }))).toBeInstanceOf(
				Invalid,
			);
		});
	});

	it("sends a struct without an identifier by its place among those", () => {
		const Short = Schema.Struct({ message: Schema.String });
		const Long = Schema.Struct({ message: Schema.String, id: Schema.Finite });
		const schema = Fetch.errorCodec(
			{ statusErrors: { 400: Short, 404: TodoNotFound, 409: Long } },
			{ errors: [TimeoutError] },
		);
		expect(JSON.parse(send(schema, { message: "m", id: 1 }))).toStrictEqual({
			_tag: "effetch/UntaggedError",
			index: 1,
			error: { message: "m", id: 1 },
		});
		inBothOrders(Short, Long, (a, b) => {
			const schema = Fetch.errorCodec({ statusErrors: { 400: a, 409: b } });
			expect(roundTrip(schema, { message: "m", id: 1 })).toStrictEqual({
				message: "m",
				id: 1,
			});
			expect(roundTrip(schema, { message: "m" })).toStrictEqual({
				message: "m",
			});
			// More fields than either takes: it goes as the one that keeps most.
			const extra = { message: "m", id: 1, extra: true };
			expect(roundTrip(schema, extra)).toStrictEqual({
				message: "m",
				id: 1,
			});
		});
	});

	it("sends a struct as the schema it was made with, not one with the same JSON", () => {
		inBothOrders(
			Schema.Struct({ at: Schema.String }),
			Schema.Struct({ at: Schema.Date }),
			(a, b) => {
				const schema = Fetch.errorCodec({
					statusErrors: { 400: a, 409: b },
				});
				const back = roundTrip(schema, { at: new Date(0) });
				expect(back).toStrictEqual({ at: new Date(0) });
				expect(roundTrip(schema, { at: "noon" })).toStrictEqual({
					at: "noon",
				});
			},
		);
		inBothOrders(
			Schema.Struct({ message: Schema.String, request_id: Schema.String }),
			Schema.Struct({
				message: Schema.String,
				requestId: Schema.String,
			}).pipe(Schema.encodeKeys({ requestId: "request_id" })),
			(a, b) => {
				const schema = Fetch.errorCodec({
					statusErrors: { 400: a, 409: b },
				});
				expect(
					roundTrip(schema, { message: "m", requestId: "r" }),
				).toStrictEqual({ message: "m", requestId: "r" });
				expect(
					roundTrip(schema, { message: "m", request_id: "r" }),
				).toStrictEqual({ message: "m", request_id: "r" });
			},
		);
	});

	it("doesn't send an error as a schema that drops some of its fields", () => {
		const Message = Schema.Struct({ message: Schema.String });
		inBothOrders(
			Schema.Union([
				Schema.Struct({ message: Schema.String, id: Schema.Finite }),
				Schema.Struct({ code: Schema.String }),
			]),
			Message,
			(a, b) => {
				const schema = Fetch.errorCodec({
					statusErrors: { 400: a, 409: b },
				});
				expect(roundTrip(schema, { message: "m", id: 1 })).toStrictEqual({
					message: "m",
					id: 1,
				});
				expect(roundTrip(schema, { code: "c" })).toStrictEqual({
					code: "c",
				});
			},
		);
		inBothOrders(
			Schema.Record(Schema.String, Schema.String),
			Message,
			(a, b) => {
				const schema = Fetch.errorCodec({
					statusErrors: { 400: a, 409: b },
				});
				const fields = { message: "m", other: "o" };
				expect(roundTrip(schema, fields)).toStrictEqual(fields);
			},
		);
		class Conflict extends Schema.Class<Conflict>("Conflict")({
			message: Schema.String,
			id: Schema.Finite,
		}) {}
		inBothOrders(Message, Conflict, (a, b) => {
			const schema = Fetch.errorCodec({ statusErrors: { 400: a, 409: b } });
			const back = roundTrip(schema, new Conflict({ message: "m", id: 1 }));
			expect(back).toBeInstanceOf(Conflict);
			expect(back).toMatchObject({ id: 1 });
		});
	});

	it("sends the members of a union as themselves", () => {
		class Gone extends Schema.TaggedError<Gone>()("Gone", {
			id: Schema.Finite,
		}) {}
		inBothOrders(
			Schema.Union([TodoNotFound, Gone]),
			Schema.Struct({ id: Schema.Finite }),
			(a, b) => {
				const schema = Fetch.errorCodec({
					statusErrors: { 404: a, 409: b },
				});
				const wire = send(schema, new Gone({ id: 1 }));
				expect(JSON.parse(wire)).toStrictEqual({ _tag: "Gone", id: 1 });
				expect(receive(schema, wire)).toBeInstanceOf(Gone);
				expect(roundTrip(schema, { id: 1 })).toStrictEqual({ id: 1 });
			},
		);
		// A union of its own, with a check or an identifier, stays one.
		const Problem = Schema.Union([
			Schema.Struct({ code: Schema.String }),
			Schema.Struct({ message: Schema.String }),
		]).annotate({ identifier: "Problem" });
		const schema = Fetch.errorCodec({
			statusErrors: { 400: Problem, 409: Problem, 422: [Problem] },
		});
		expect(JSON.parse(send(schema, { code: "c" }))).toStrictEqual({
			_tag: "effetch/UntaggedError",
			identifier: "Problem",
			error: { code: "c" },
		});
	});

	it("sends a class as the nearest class listed", () => {
		class Base extends Schema.Class<Base>("Base")({ a: Schema.String }) {}
		class Mid extends Base.extend<Mid>("Mid")({ b: Schema.String }) {}
		class Sub extends Mid {}
		class Other extends Schema.Class<Other>("Other")({
			c: Schema.String,
		}) {}
		const mid = new Mid({ a: "a", b: "b" });
		const check = (schema: Schema.Top) => {
			const back = roundTrip(schema, mid);
			expect(back).toBeInstanceOf(Mid);
			expect(back).toMatchObject({ a: "a", b: "b" });
			expect(roundTrip(schema, new Sub({ a: "a", b: "b" }))).toBeInstanceOf(
				Mid,
			);
			expect(roundTrip(schema, new Base({ a: "a" }))).not.toBeInstanceOf(
				Mid,
			);
		};
		inBothOrders(Base, Mid, (a, b) => {
			check(Fetch.errorCodec({ statusErrors: { 400: a, 409: b } }));
		});
		inBothOrders(Base, Mid.annotate({ description: "A mid" }), (a, b) => {
			check(Fetch.errorCodec({ statusErrors: { 400: a, 409: b } }));
		});
		inBothOrders(Base, Schema.Union([Mid, Other]), (a, b) => {
			check(Fetch.errorCodec({ statusErrors: { 400: a, 409: b } }));
		});
		// A struct with the same fields is no class.
		inBothOrders(
			Schema.Struct({ a: Schema.String, b: Schema.String }),
			Mid,
			(a, b) => {
				const schema = Fetch.errorCodec({
					statusErrors: { 400: a, 409: b },
				});
				expect(roundTrip(schema, mid)).toBeInstanceOf(Mid);
				expect(roundTrip(schema, { a: "a", b: "b" })).not.toBeInstanceOf(
					Mid,
				);
			},
		);
	});

	it("tells apart errors whose _tag isn't sent", () => {
		const Invalid = Schema.Struct({
			_tag: Schema.tagDefaultOmit("Invalid"),
			code: Schema.String,
		});
		const Conflict = Schema.Struct({
			_tag: Schema.tagDefaultOmit("Conflict"),
			code: Schema.String,
		});
		inBothOrders(Invalid, Conflict, (a, b) => {
			const schema = Fetch.errorCodec({ statusErrors: { 400: a, 409: b } });
			const wire = send(schema, { _tag: "Conflict" as const, code: "c" });
			expect(JSON.parse(wire)).toStrictEqual({
				_tag: "effetch/UntaggedError",
				tag: "Conflict",
				error: { code: "c" },
			});
			expect(receive(schema, wire)).toStrictEqual({
				_tag: "Conflict",
				code: "c",
			});
		});
		// A class with the tag's name is another error.
		class ConflictClass extends Schema.Class<ConflictClass>("Conflict")({
			code: Schema.String,
		}) {}
		inBothOrders(Conflict, ConflictClass, (a, b) => {
			const schema = Fetch.errorCodec({ statusErrors: { 400: a, 409: b } });
			expect(
				roundTrip(schema, new ConflictClass({ code: "c" })),
			).toBeInstanceOf(ConflictClass);
			expect(
				roundTrip(schema, { _tag: "Conflict" as const, code: "c" }),
			).not.toBeInstanceOf(ConflictClass);
		});
	});

	it("tells apart schemas with the same identifier by their place", () => {
		class Mid extends Schema.Class<Mid>("Mid")({ a: Schema.String }) {}
		inBothOrders(Mid, Mid.annotate({ description: "A mid" }), (a, b) => {
			const schema = Fetch.errorCodec({ statusErrors: { 400: a, 409: b } });
			expect(roundTrip(schema, new Mid({ a: "a" }))).toBeInstanceOf(Mid);
		});
		inBothOrders(Mid, Schema.toType(Mid), (a, b) => {
			const schema = Fetch.errorCodec({ statusErrors: { 409: [a, b] } });
			expect(roundTrip(schema, new Mid({ a: "a" }))).toBeInstanceOf(Mid);
		});
		const First = class ApiError extends Schema.Class<ApiError>("ApiError")({
			message: Schema.String,
		}) {};
		const Second = class ApiError extends Schema.Class<ApiError>("ApiError")({
			message: Schema.String,
			code: Schema.optional(Schema.String),
		}) {};
		inBothOrders(First, Second, (a, b) => {
			const schema = Fetch.errorCodec({ statusErrors: { 400: a, 409: b } });
			const wire = JSON.parse(
				send(schema as never, new Second({ message: "m" })),
			);
			expect(wire).not.toHaveProperty("identifier");
			expect(wire).toHaveProperty("index");
			expect(roundTrip(schema, new First({ message: "m" }))).toBeInstanceOf(
				First,
			);
			expect(roundTrip(schema, new Second({ message: "m" }))).toBeInstanceOf(
				Second,
			);
			expect(
				roundTrip(schema, new Second({ message: "m", code: "c" })),
			).toBeInstanceOf(Second);
		});
		const Invalid = Schema.Struct({
			_tag: Schema.tagDefaultOmit("Invalid"),
			code: Schema.String,
		});
		const InvalidField = Schema.Struct({
			_tag: Schema.tagDefaultOmit("Invalid"),
			code: Schema.String,
			field: Schema.String,
		});
		inBothOrders(Invalid, InvalidField, (a, b) => {
			const schema = Fetch.errorCodec({ statusErrors: { 400: a, 422: b } });
			const field = { _tag: "Invalid" as const, code: "c", field: "f" };
			expect(roundTrip(schema, field)).toStrictEqual(field);
			const code = { _tag: "Invalid" as const, code: "c" };
			expect(roundTrip(schema, code)).toStrictEqual(code);
		});
	});

	it("builds from an endpoint and a client that list copies of a class", () => {
		class Conflict extends Schema.Class<Conflict>("Conflict")({
			code: Schema.String,
		}) {}
		class Shop extends Fetch.Service<Shop>()("Shop", {
			baseUrl: "https://api.test",
			statusErrors: { 409: Conflict },
		}) {}
		const order = Fetch.endpoint("POST /orders", {
			statusErrors: { 409: Conflict.annotate({ title: "Conflict" }) },
		});
		const schema = Fetch.errorCodec(order, { client: Shop });
		expect(roundTrip(schema, new Conflict({ code: "c" }))).toBeInstanceOf(
			Conflict,
		);
	});

	it("sends an error made by hand with fields to spare", () => {
		const Conflict = Schema.Struct({
			_tag: Schema.tagDefaultOmit("Conflict"),
			code: Schema.String,
		});
		const Named = Schema.Struct({
			_tag: Schema.String,
			message: Schema.String,
		});
		const schema = Fetch.errorCodec({
			statusErrors: { 400: Named, 409: Conflict },
		});
		expect(
			roundTrip(schema, { _tag: "Conflict", code: "c", extra: 1 }),
		).toStrictEqual({ _tag: "Conflict", code: "c" });
		expect(
			roundTrip(schema, { _tag: "Named", message: "m", extra: 1 }),
		).toStrictEqual({ _tag: "Named", message: "m" });
	});

	it("puts a union's tagged members after the tagged schemas listed", () => {
		const Message = Schema.Struct({ message: Schema.String });
		const ShortNotFound = Schema.TaggedStruct("NotFound", {
			id: Schema.Finite,
		});
		const LongNotFound = Schema.TaggedStruct("NotFound", {
			id: Schema.Finite,
			name: Schema.String,
		});
		const schema = Fetch.errorCodec({
			statusErrors: {
				400: Schema.Union([ShortNotFound, Message]),
				409: LongNotFound,
			},
		});
		const long = { _tag: "NotFound" as const, id: 1, name: "n" };
		expect(roundTrip(schema, long)).toStrictEqual(long);
		const short = { _tag: "NotFound" as const, id: 1 };
		expect(roundTrip(schema, short)).toStrictEqual(short);
		class First extends Schema.TaggedError<First>()("NotFound", {
			id: Schema.Finite,
		}) {}
		class Second extends Schema.TaggedError<Second>()("NotFound", {
			id: Schema.Finite,
		}) {}
		const classes = Fetch.errorCodec({
			statusErrors: { 400: Schema.Union([First, Message]), 409: Second },
		});
		expect(roundTrip(classes, new Second({ id: 1 }))).toBeInstanceOf(Second);
	});

	it("decodes an error by its identifier, wherever each side lists it", () => {
		class Invalid extends Schema.Class<Invalid>("Invalid")({
			field: Schema.String,
		}) {}
		class Conflict extends Schema.Class<Conflict>("Conflict")({
			message: Schema.String,
		}) {}
		class Gone extends Schema.Class<Gone>("Gone")({
			message: Schema.String,
		}) {}
		// An older client lists fewer errors, elsewhere, than the server.
		const older = Fetch.errorCodec({
			statusErrors: { 409: [Gone, Conflict] },
		});
		const newer = Fetch.errorCodec(
			{ statusErrors: { 400: Invalid, 409: Conflict, 410: Gone } },
			{ errors: [TimeoutError] },
		);
		expect(
			receive(older, send(newer, new Conflict({ message: "m" }))),
		).toBeInstanceOf(Conflict);
		expect(
			receive(older, send(newer, new Gone({ message: "m" }))),
		).toBeInstanceOf(Gone);
		// An error the older client doesn't know fails to decode, rather than
		// decoding as another.
		expect(() =>
			receive(older, send(newer, new Invalid({ field: "f" }))),
		).toThrow('no error schema has the identifier "Invalid"');
	});

	it("decodes an error with only the schema it names", () => {
		const Plain = Schema.Struct({ message: Schema.String });
		const Throws = Schema.Struct({
			message: Schema.String.pipe(
				Schema.decodeTo(
					Schema.String,
					SchemaTransformation.transform<string, string>({
						decode: () => {
							throw new Error("decoded with the wrong schema");
						},
						encode: (message) => message,
					}),
				),
			),
			only: Schema.optionalKey(Schema.String),
		});
		const schema = Fetch.errorCodec({
			statusErrors: { 400: Plain, 409: Throws },
		});
		expect(roundTrip(schema, { message: "m" })).toStrictEqual({
			message: "m",
		});
	});

	it("says why an error without a _tag doesn't decode", () => {
		class Conflict extends Schema.Class<Conflict>("Conflict")({
			message: Schema.String,
		}) {}
		const schema = Fetch.errorCodec({
			statusErrors: {
				400: Schema.Struct({ message: Schema.String }),
				409: Conflict,
			},
		});
		const decode = (wire: object) => () =>
			Schema.decodeUnknownSync(Schema.toCodecJson(schema))({
				_tag: "effetch/UntaggedError",
				error: { message: "m" },
				...wire,
			});
		expect(decode({ tag: "Conflict" })).toThrow(
			'no error schema has the _tag "Conflict"',
		);
		expect(decode({ index: 1 })).toThrow(
			"no error schema without an identifier is at index 1",
		);
		expect(decode({})).toThrow(
			"an error without a _tag goes with an identifier, a tag or an index",
		);
		expect(decode({ identifier: "Conflict", index: 0 })).toThrow(
			"an error without a _tag goes with an identifier, a tag or an index",
		);
		expect(() => send(schema as never, { code: 1 })).toThrow(
			"Expected an error one of the error schemas takes",
		);
	});

	it("passes the parse options to the error's schema", () => {
		const Problem = Schema.Struct({ message: Schema.String });
		const schema = Fetch.errorCodec({ statusErrors: { 400: Problem } });
		const wire = {
			_tag: "effetch/UntaggedError",
			index: 0,
			error: { message: "m", extra: 1 },
		};
		expect(() =>
			Schema.decodeUnknownSync(Schema.toCodecJson(schema))(wire, {
				onExcessProperty: "error",
			}),
		).toThrow(/extra/);
		expect(() =>
			Schema.decodeUnknownSync(Schema.toCodecJson(schema))({
				...wire,
				error: { message: 1 },
			}),
		).toThrow(/\["error"\]\["message"\]/);
		expect(() =>
			Schema.encodeUnknownSync(Schema.toCodecJson(schema))(
				{ message: "m", extra: 1 },
				{ onExcessProperty: "error" },
			),
		).toThrow(/extra/);
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
