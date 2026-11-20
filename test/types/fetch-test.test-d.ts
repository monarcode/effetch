// Type tests build Effects only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Headers from "effect/http/Headers";
import type * as HttpClient from "effect/http/HttpClient";
import type * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { describe, expectTypeOf, it } from "vitest";

import { Fetch } from "../../src/index.js";
import { FetchTest } from "../../src/test/index.js";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });
const ApiError = Schema.Struct({ code: Schema.String });
const Page = Schema.Struct({ page: Schema.FiniteFromString });

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
	message: Schema.String,
}) {}
class Clock extends Context.Service<Clock, { readonly now: Date }>()("Clock") {}
class Locale extends Context.Service<Locale, string>()("Locale") {}

const getTodo = Fetch.endpoint("GET /orgs/:org/todos/:id", {
	output: Todo,
	statusErrors: { 404: NotFound },
});
const createTodo = Fetch.endpoint("POST /todos", {
	input: NewTodo,
	output: Todo,
});
const upload = Fetch.endpoint("PUT /files/:name");
const listTodos = Fetch.endpoint("GET /todos", {
	query: Page,
	error: ApiError,
});

/** A schema whose decoding and encoding need `Locale`. */
declare const Localized: Schema.Codec<string, string, Locale, Locale>;

describe("FetchTest.respond", () => {
	it("types the handler's request by the endpoint", () => {
		FetchTest.respond(getTodo, (request) => {
			expectTypeOf(request.params).toEqualTypeOf<{
				readonly org: string;
				readonly id: string;
			}>();
			expectTypeOf(request.body).toEqualTypeOf<undefined>();
			expectTypeOf(request.query).toEqualTypeOf<FetchTest.QueryParams>();
			expectTypeOf(request.headers).toEqualTypeOf<Headers.Headers>();
			return Effect.succeed({ id: 1, title: "x" });
		});
		FetchTest.respond(createTodo, ({ params, body }) => {
			expectTypeOf(params).toEqualTypeOf<{}>();
			expectTypeOf(body).toEqualTypeOf<{
				readonly title: string;
				readonly due: Date;
			}>();
			return Effect.succeed({ id: 2, title: body.title });
		});
		FetchTest.respond(upload, ({ params, body }) => {
			expectTypeOf(params).toEqualTypeOf<{ readonly name: string }>();
			expectTypeOf(body).toEqualTypeOf<unknown>();
			return Effect.void;
		});
		FetchTest.respond(listTodos, ({ query }) => {
			expectTypeOf(query).toEqualTypeOf<{ readonly page: number }>();
			return Effect.succeed(FetchTest.reply(204));
		});
	});

	it("types the result by output", () => {
		expectTypeOf<FetchTest.RespondResult<typeof Todo>>().toEqualTypeOf<
			{ readonly id: number; readonly title: string } | FetchTest.Reply
		>();
		expectTypeOf<
			FetchTest.RespondResult<undefined>
		>().toEqualTypeOf<unknown>();
		// @ts-expect-error the title is missing
		FetchTest.respond(getTodo, () => Effect.succeed({ id: 1 }));
		FetchTest.respond(
			getTodo,
			// @ts-expect-error a handler can't fail
			// @effect-diagnostics-next-line missingEffectError:off
			() => Effect.fail("boom"),
		);
		FetchTest.respond(getTodo, () => Effect.succeed(FetchTest.reply(404)));
	});

	it("works with bound endpoints and module endpoints", () => {
		const program = Effect.gen(function* () {
			const api = yield* Fetch.make({ baseUrl: "https://api.test" });
			const bound = api.bind(createTodo);
			const inline = api.endpoint("GET /users/:id", { output: Todo });
			return [
				FetchTest.respond(bound, ({ body }) => {
					expectTypeOf(body.due).toEqualTypeOf<Date>();
					return Effect.succeed({ id: 1, title: body.title });
				}),
				FetchTest.respond(inline, ({ params }) => {
					expectTypeOf(params).toEqualTypeOf<{ readonly id: string }>();
					return Effect.succeed({ id: 1, title: "x" });
				}),
			] as const;
		});
		expectTypeOf(program).toEqualTypeOf<
			Effect.Effect<
				readonly [FetchTest.Handler<never>, FetchTest.Handler<never>],
				never,
				HttpClient.HttpClient
			>
		>();

		class Api extends Fetch.Service<Api>()("Api") {}
		class TodoApi extends Fetch.Endpoints<TodoApi>()("TodoApi", Api, {
			get: getTodo,
		}) {}
		FetchTest.respond(TodoApi.definitions.get, ({ params }) =>
			Effect.succeed({ id: Number(params.id), title: params.org }),
		);
	});

	it("collects the services of the handler and the schemas", () => {
		const own = FetchTest.respond(getTodo, () =>
			Effect.map(Effect.service(Clock), () => ({ id: 1, title: "x" })),
		);
		expectTypeOf(own).toEqualTypeOf<FetchTest.Handler<Clock>>();
		const localized = Fetch.endpoint("POST /notes", {
			input: Schema.Struct({ text: Localized }),
			output: Schema.Struct({ text: Localized }),
		});
		const schemas = FetchTest.respond(localized, ({ body }) =>
			Effect.succeed({ text: body.text }),
		);
		expectTypeOf(schemas).toEqualTypeOf<FetchTest.Handler<Locale>>();
		expectTypeOf<
			FetchTest.RespondServices<typeof getTodo>
		>().toEqualTypeOf<never>();
	});
});

describe("FetchTest.fail", () => {
	it("types the body by the status's statusErrors and the error schema", () => {
		FetchTest.fail(getTodo, 404, new NotFound({ message: "x" }));
		// @ts-expect-error not a NotFound
		FetchTest.fail(getTodo, 404, { reason: 1 });
		// No error schema and no statusErrors for 500: anything goes.
		FetchTest.fail(getTodo, 500, { reason: 1 });
		FetchTest.fail(listTodos, 500, { code: "boom" });
		// @ts-expect-error not an ApiError
		FetchTest.fail(listTodos, 500, { code: 1 });
		FetchTest.fail(listTodos, 503);
		expectTypeOf<
			FetchTest.FailBody<typeof getTodo, 404>
		>().toEqualTypeOf<NotFound>();
		expectTypeOf<
			FetchTest.FailBody<typeof getTodo, 500>
		>().toEqualTypeOf<unknown>();
		expectTypeOf<FetchTest.FailBody<typeof listTodos, 500>>().toEqualTypeOf<{
			readonly code: string;
		}>();
	});

	it("collects the services of the error schemas", () => {
		const localized = Fetch.endpoint("GET /notes", {
			statusErrors: { 400: Schema.Struct({ text: Localized }) },
		});
		expectTypeOf(FetchTest.fail(localized, 400)).toEqualTypeOf<
			FetchTest.Handler<Locale>
		>();
		expectTypeOf(FetchTest.fail(getTodo, 404)).toEqualTypeOf<
			FetchTest.Handler<never>
		>();
	});
});

describe("FetchTest.layer", () => {
	it("is an HttpClient layer that needs its handlers' services", () => {
		const plain = FetchTest.layer([FetchTest.fail(getTodo, 404)]);
		expectTypeOf(plain).toEqualTypeOf<
			Layer.Layer<HttpClient.HttpClient | FetchTest.Recorder, never, never>
		>();
		const withServices = FetchTest.layer([
			FetchTest.respond(getTodo, () =>
				Effect.map(Effect.service(Clock), () => ({ id: 1, title: "x" })),
			),
			FetchTest.respond(createTodo, () =>
				Effect.map(Effect.service(Locale), (title) => ({ id: 1, title })),
			),
			FetchTest.fail(listTodos, 503),
		]);
		expectTypeOf(withServices).toEqualTypeOf<
			Layer.Layer<
				HttpClient.HttpClient | FetchTest.Recorder,
				never,
				Clock | Locale
			>
		>();
		// @ts-expect-error an endpoint isn't a handler
		FetchTest.layer([getTodo]);
	});

	it("reads the recorded requests", () => {
		expectTypeOf(FetchTest.requests).toEqualTypeOf<
			Effect.Effect<
				ReadonlyArray<FetchTest.SentRequest>,
				never,
				FetchTest.Recorder
			>
		>();
		expectTypeOf(FetchTest.Recorder).toEqualTypeOf<
			Context.Service<FetchTest.Recorder, FetchTest.Recorder>
		>();
	});
});
