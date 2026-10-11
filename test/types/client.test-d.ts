import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

import { describe, expectTypeOf, it } from "vitest";

import type { DecodeError, HttpError, NetworkError } from "../../src/Errors.js";
import type { BodyMethod, NoBodyMethod } from "../../src/Options.js";
import type { Plugin } from "../../src/Plugin.js";

class TimeoutError extends Data.TaggedError("TimeoutError")<{}> {}

type Ps = [
	Plugin<"bearer">,
	Plugin<"retry", never, never, { times: number }>,
	Plugin<"timeout", TimeoutError, never, { duration: string }>,
];

declare const get: NoBodyMethod<Ps, Schema.Unknown>;
declare const post: BodyMethod<Ps, Schema.Unknown>;

const Todo = Schema.Struct({ id: Schema.Number, title: Schema.String });
const ApiError = Schema.Struct({ code: Schema.String });
const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });

type Todo = typeof Todo.Type;
type Response = HttpClientResponse.HttpClientResponse;

describe("params", () => {
	it("are required when the path has params", () => {
		get("/todos/:id", { params: { id: 1 } });
		// @ts-expect-error missing options argument
		get("/todos/:id");
		// @ts-expect-error missing params
		get("/todos/:id", {});
		// @ts-expect-error missing one of two params
		get("/users/:id/posts/:postId", { params: { id: 1 } });
	});

	it("reject unknown keys", () => {
		// @ts-expect-error "ID" isn't a param of the path
		get("/todos/:id", { params: { id: 1, ID: 2 } });
	});

	it("accept strings and numbers only", () => {
		get("/todos/:id", { params: { id: "abc" } });
		// @ts-expect-error booleans aren't path values
		get("/todos/:id", { params: { id: true } });
	});

	it("are forbidden when the path has none", () => {
		get("/todos");
		get("/todos", {});
		get("/todos", { params: undefined });
		// @ts-expect-error the path has no params
		get("/todos", { params: { id: 1 } });
	});

	it("survive template literal segments", () => {
		const orgId: string = "acme";
		get(`/orgs/${orgId}/users/:id`, { params: { id: 1 } });
		// @ts-expect-error id is still required
		get(`/orgs/${orgId}/users/:id`, {});
	});

	it("are an optional record for a plain string path", () => {
		const path: string = "/todos/:id";
		get(path);
		get(path, { params: { id: 1 } });
		// @ts-expect-error booleans aren't path values
		get(path, { params: { id: true } });
	});
});

describe("query and headers", () => {
	it("accept coercible values, arrays and nullish", () => {
		get("/todos", {
			query: {
				page: 1,
				tags: ["a", "b"],
				done: false,
				q: null,
				x: undefined,
			},
			headers: { accept: "application/json" },
		});
		// @ts-expect-error nested objects aren't query values
		get("/todos", { query: { filter: { done: true } } });
	});
});

describe("body", () => {
	it("is not available on get", () => {
		get("/todos", { body: undefined, input: undefined });
		// @ts-expect-error get has no body
		get("/todos", { body: { title: "x" } });
		// @ts-expect-error get has no input
		get("/todos", { input: NewTodo });
	});

	it("is accepted by post", () => {
		post("/todos", { body: { anything: true } });
		post("/upload", { body: new FormData() });
	});

	it("is typed by input when present", () => {
		post("/todos", { input: NewTodo, body: { title: "x", due: new Date() } });
		// @ts-expect-error due must be a Date
		post("/todos", { input: NewTodo, body: { title: "x", due: "tomorrow" } });
		// @ts-expect-error title is missing
		post("/todos", { input: NewTodo, body: { due: new Date() } });
	});
});

describe("return type", () => {
	it("is the raw response without output", () => {
		expectTypeOf(get("/todos")).toEqualTypeOf<
			Effect.Effect<
				Response,
				NetworkError | HttpError.With<unknown> | TimeoutError,
				never
			>
		>();
	});

	it("is the decoded output, with DecodeError", () => {
		expectTypeOf(
			get("/todos/:id", { params: { id: 1 }, output: Todo }),
		).toEqualTypeOf<
			Effect.Effect<
				Todo,
				NetworkError | HttpError.With<unknown> | DecodeError | TimeoutError,
				never
			>
		>();
	});

	it("covers both outcomes for a conditional output", () => {
		const flag = Math.random() > 0.5;
		const call = get("/todos/1", { output: flag ? Todo : undefined });
		expectTypeOf<Effect.Success<typeof call>>().toEqualTypeOf<
			Todo | Response
		>();
	});

	it("types HttpError.body with the error schema", () => {
		const call = get("/todos", { error: ApiError });
		type E = Effect.Error<typeof call>;
		expectTypeOf<Extract<E, { _tag: "HttpError" }>["body"]>().toEqualTypeOf<
			{ readonly code: string } | undefined
		>();
	});

	it("uses the client's error schema by default", () => {
		const getWithDefault = null as unknown as NoBodyMethod<
			[],
			typeof ApiError
		>;
		type E = Effect.Error<ReturnType<typeof getWithDefault<"/x">>>;
		expectTypeOf<Extract<E, { _tag: "HttpError" }>["body"]>().toEqualTypeOf<
			{ readonly code: string } | undefined
		>();
	});
});

describe("services", () => {
	class Locale extends Context.Service<Locale, { readonly tag: string }>()(
		"Locale",
	) {}
	const Localized = Schema.String.pipe(
		Schema.decode({
			decode: SchemaGetter.transformEffect((s: string) =>
				Effect.map(Effect.service(Locale), (l) => `${l.tag}:${s}`),
			),
			encode: SchemaGetter.passthrough(),
		}),
	);

	it("are never for plain schemas", () => {
		const call = post("/todos", { input: NewTodo, output: Todo });
		expectTypeOf<Effect.Services<typeof call>>().toBeNever();
	});

	it("include the output schema's decoding services", () => {
		const call = get("/x", { output: Localized });
		expectTypeOf<Effect.Services<typeof call>>().toEqualTypeOf<Locale>();
	});

	it("include the error schema's decoding services", () => {
		const call = get("/x", { error: Localized });
		expectTypeOf<Effect.Services<typeof call>>().toEqualTypeOf<Locale>();
	});
});

describe("plugin overrides", () => {
	it("are typed from the client's plugins", () => {
		get("/todos", { plugins: { bearer: false, retry: { times: 0 } } });
		get("/todos", { plugins: { timeout: { duration: "1 second" } } });
		// @ts-expect-error unknown plugin name
		get("/todos", { plugins: { logger: false } });
		// @ts-expect-error bearer only accepts false
		get("/todos", { plugins: { bearer: {} } });
	});
});
