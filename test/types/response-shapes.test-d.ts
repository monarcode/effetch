// Type tests build Effects only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import type * as Effect from "effect/Effect";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import { describe, expectTypeOf, it } from "vitest";

import * as Fetch from "../../src/index.js";

type Response = HttpClientResponse.HttpClientResponse;

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
type Todo = typeof Todo.Type;
const Todos = Schema.Array(Todo);

const make = Fetch.make({ baseUrl: "https://api.test" });
declare const api: Effect.Success<typeof make>;
declare const mode: Fetch.ResponseMode;
declare const maybe: "decoded-and-response" | undefined;
declare const anyString: string;

describe("responseMode on methods", () => {
	it("gives a pair with decoded-and-response", () => {
		const call = api.get("/todos", {
			output: Todos,
			responseMode: "decoded-and-response",
		});
		expectTypeOf<Effect.Success<typeof call>>().toEqualTypeOf<
			readonly [value: ReadonlyArray<Todo>, response: Response]
		>();
		expectTypeOf(call).toEqualTypeOf<
			Fetch.CallEffect<
				typeof Todos,
				Schema.Unknown,
				Schema.Unknown,
				[],
				undefined,
				"decoded-and-response"
			>
		>();
	});

	it("gives the value alone with decoded, or without a mode", () => {
		const decoded = api.get("/todos", {
			output: Todos,
			responseMode: "decoded",
		});
		const plain = api.get("/todos", { output: Todos });
		expectTypeOf<Effect.Success<typeof decoded>>().toEqualTypeOf<
			ReadonlyArray<Todo>
		>();
		expectTypeOf(plain).toEqualTypeOf<
			Fetch.CallEffect<typeof Todos, Schema.Unknown, Schema.Unknown, []>
		>();
	});

	it("gives the response twice without output", () => {
		const call = api.post("/x", { responseMode: "decoded-and-response" });
		expectTypeOf<Effect.Success<typeof call>>().toEqualTypeOf<
			readonly [value: Response, response: Response]
		>();
	});

	it("works on put, patch, del and request", () => {
		const options = {
			output: Todo,
			responseMode: "decoded-and-response",
		} as const;
		type Pair = readonly [value: Todo, response: Response];
		expectTypeOf<
			Effect.Success<ReturnType<typeof api.put<"/x", typeof Todo>>>
		>().toEqualTypeOf<Todo>();
		expectTypeOf<Effect.Success<typeof patched>>().toEqualTypeOf<Pair>();
		const patched = api.patch("/x", options);
		const deleted = api.del("/x", options);
		const requested = api.request("GET", "/x", options);
		const headed = api.head("/x", options);
		expectTypeOf<Effect.Success<typeof deleted>>().toEqualTypeOf<Pair>();
		expectTypeOf<Effect.Success<typeof requested>>().toEqualTypeOf<Pair>();
		expectTypeOf<Effect.Success<typeof headed>>().toEqualTypeOf<Pair>();
	});

	it("gives the union for a mode that isn't known", () => {
		const call = api.get("/todos", { output: Todos, responseMode: mode });
		expectTypeOf<Effect.Success<typeof call>>().toEqualTypeOf<
			| ReadonlyArray<Todo>
			| readonly [value: ReadonlyArray<Todo>, response: Response]
		>();
	});

	it("rejects other modes", () => {
		// @ts-expect-error not a response mode
		api.get("/todos", { output: Todos, responseMode: "response" });
		// @ts-expect-error a string may not be a response mode
		api.get("/todos", { output: Todos, responseMode: anyString });
	});
});

describe("responseMode on endpoints", () => {
	const list = api.endpoint("GET /todos", {
		output: Todos,
		responseMode: "decoded-and-response",
	});
	const plain = api.endpoint("GET /todos", { output: Todos });
	type Pair = readonly [value: ReadonlyArray<Todo>, response: Response];

	it("takes the definition's mode", () => {
		const called = list();
		expectTypeOf<Effect.Success<typeof called>>().toEqualTypeOf<Pair>();
		expectTypeOf(list.responseMode).toEqualTypeOf<"decoded-and-response">();
		expectTypeOf(plain.responseMode).toEqualTypeOf<undefined>();
		expectTypeOf(list).toEqualTypeOf<
			Fetch.Endpoint<
				"GET /todos",
				typeof Todos,
				Schema.Unknown,
				undefined,
				[],
				undefined,
				"decoded-and-response"
			>
		>();
		expectTypeOf(plain).toEqualTypeOf<
			Fetch.Endpoint<
				"GET /todos",
				typeof Todos,
				Schema.Unknown,
				undefined,
				[]
			>
		>();
	});

	it("lets a call's own mode win", () => {
		const decoded = list({ responseMode: "decoded" });
		const paired = plain({ responseMode: "decoded-and-response" });
		const either = plain({ responseMode: maybe });
		const fallback = list({ responseMode: undefined });
		expectTypeOf<Effect.Success<typeof decoded>>().toEqualTypeOf<
			ReadonlyArray<Todo>
		>();
		expectTypeOf<Effect.Success<typeof paired>>().toEqualTypeOf<Pair>();
		// undefined falls back to the endpoint's: none here.
		expectTypeOf<Effect.Success<typeof either>>().toEqualTypeOf<
			Pair | ReadonlyArray<Todo>
		>();
		expectTypeOf<Effect.Success<typeof fallback>>().toEqualTypeOf<Pair>();
		const listMaybe = list({ responseMode: maybe });
		expectTypeOf<Effect.Success<typeof listMaybe>>().toEqualTypeOf<Pair>();
	});

	it("is kept by Fetch.endpoint, bind, bindAll and Fetch.Endpoints", () => {
		const definition = Fetch.endpoint("GET /todos", {
			output: Todos,
			responseMode: "decoded-and-response",
		});
		expectTypeOf(
			definition.responseMode,
		).toEqualTypeOf<"decoded-and-response">();
		expectTypeOf(definition).toEqualTypeOf<
			Fetch.UnboundEndpoint<
				"GET /todos",
				typeof Todos,
				undefined,
				undefined,
				undefined,
				"decoded-and-response"
			>
		>();
		const bound = api.bind(definition);
		expectTypeOf(bound).toEqualTypeOf<typeof list>();
		const inline = api.bind(
			Fetch.endpoint("GET /todos", {
				output: Todos,
				responseMode: "decoded-and-response",
			}),
		);
		expectTypeOf(inline).toEqualTypeOf<typeof list>();
		const all = api.bindAll({ list: definition, pair: [definition, {}] });
		expectTypeOf(all.list).toEqualTypeOf<typeof list>();
		expectTypeOf(all.pair).toEqualTypeOf<typeof list>();
		class Api extends Fetch.Service<Api>()("Api", {}) {}
		class TodoApi extends Fetch.Endpoints<TodoApi>()("TodoApi", Api, {
			list: definition,
		}) {}
		expectTypeOf<Effect.Success<typeof TodoApi>["list"]>().toEqualTypeOf<
			typeof list
		>();
	});

	it("rejects other modes", () => {
		// @ts-expect-error not a response mode
		api.endpoint("GET /todos", { responseMode: "raw" });
		// @ts-expect-error not a response mode
		Fetch.endpoint("GET /todos", { responseMode: "raw" });
		// @ts-expect-error not a response mode
		list({ responseMode: "raw" });
	});
});

describe("Fetch.text and Fetch.bytes", () => {
	it("are schemas, typed as their value", () => {
		expectTypeOf(Fetch.text()).toEqualTypeOf<Schema.String>();
		expectTypeOf(Fetch.text(Schema.NumberFromString)).toEqualTypeOf<
			typeof Schema.NumberFromString
		>();
		expectTypeOf(Fetch.bytes()).toEqualTypeOf<Fetch.BytesSchema>();
		const text = api.get("/x", { output: Fetch.text() });
		const count = api.get("/x", {
			output: Fetch.text(Schema.NumberFromString),
		});
		const bytes = api.get("/x", { output: Fetch.bytes() });
		expectTypeOf<Effect.Success<typeof text>>().toEqualTypeOf<string>();
		expectTypeOf<Effect.Success<typeof count>>().toEqualTypeOf<number>();
		expectTypeOf<Effect.Success<typeof bytes>>().toEqualTypeOf<
			Uint8Array<ArrayBuffer>
		>();
		expectTypeOf<Uint8Array<ArrayBuffer>>().toExtend<BlobPart>();
		expectTypeOf<Fetch.DecodeError>().toExtend<Effect.Error<typeof bytes>>();
	});

	it("take a schema whose encoded side is a string", () => {
		Fetch.text(Schema.Literals(["a", "b"]));
		// @ts-expect-error a number isn't read from text
		Fetch.text(Schema.Number);
		// @ts-expect-error a struct isn't read from text
		Fetch.text(Todo);
	});

	it("work with a mode and on endpoints", () => {
		const token = Fetch.endpoint("POST /token", {
			output: Fetch.text(),
			responseMode: "decoded-and-response",
		});
		const call = api.bind(token)();
		expectTypeOf<Effect.Success<typeof call>>().toEqualTypeOf<
			readonly [value: string, response: Response]
		>();
	});
});
