// Type tests build Effects only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as HttpMethod from "effect/http/HttpMethod";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { describe, expectTypeOf, it } from "vitest";

import { Fetch } from "../../src/index.js";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const Todos = Schema.Array(Todo);

const Filters = Schema.Struct({
	done: Schema.optional(Schema.Boolean),
	since: Schema.optional(Schema.Date),
});
const Page = Schema.Struct({ page: Schema.Finite });

class Locale extends Context.Service<Locale, string>()("Locale") {}
declare const Localized: Schema.Codec<string, string, never, Locale>;
const NeedsLocale = Schema.Struct({ q: Localized });

const make = Fetch.make({ baseUrl: "https://api.test" });
declare const api: Effect.Success<typeof make>;

const listTodos = Fetch.endpoint("GET /todos", {
	query: Filters,
	output: Todos,
});
const pageTodos = api.endpoint("GET /orgs/:org/todos", { query: Page });

describe("query schemas", () => {
	it("type a call's query by the schema", () => {
		const list = api.bind(listTodos);
		list({ query: { done: true, since: new Date() } });
		list();
		// @ts-expect-error a Date, not a string
		list({ query: { since: "2026-01-01" } });
		// @ts-expect-error no such query parameter
		list({ query: { done: true, page: 2 } });
	});

	it("make query required when the schema has required fields", () => {
		pageTodos({ params: { org: "a" }, query: { page: 1 } });
		// @ts-expect-error query is required
		pageTodos({ params: { org: "a" } });
		const search = api.endpoint("GET /search", { query: Page });
		search({ query: { page: 1 } });
		// @ts-expect-error the options are required
		search();
	});

	it("add the schema's encoding services, as CallServices does", () => {
		const search = api.endpoint("GET /search", { query: NeedsLocale });
		const call = search({ query: { q: "x" } });
		expectTypeOf<Effect.Services<typeof call>>().toEqualTypeOf<Locale>();
		// The call signature writes these types out, so check they still agree.
		expectTypeOf<Effect.Services<typeof call>>().toEqualTypeOf<
			Fetch.CallServices<
				undefined,
				Schema.Unknown,
				undefined,
				undefined,
				typeof NeedsLocale
			>
		>();
		expectTypeOf(call).toEqualTypeOf<
			Fetch.CallEffect<
				undefined,
				Schema.Unknown,
				undefined,
				[],
				undefined,
				undefined,
				typeof NeedsLocale
			>
		>();
	});

	it("are kept by Fetch.endpoint, bind, bindAll and Fetch.Endpoints", () => {
		expectTypeOf(listTodos.query).toEqualTypeOf<typeof Filters>();
		expectTypeOf(listTodos).toEqualTypeOf<
			Fetch.UnboundEndpoint<
				"GET /todos",
				typeof Todos,
				undefined,
				undefined,
				undefined,
				undefined,
				typeof Filters
			>
		>();
		const bound = api.bind(listTodos);
		expectTypeOf(bound.query).toEqualTypeOf<typeof Filters>();
		expectTypeOf(bound).toEqualTypeOf<
			Fetch.Endpoint<
				"GET /todos",
				typeof Todos,
				Schema.Unknown,
				undefined,
				[],
				undefined,
				undefined,
				typeof Filters
			>
		>();
		const inline = api.bind(
			Fetch.endpoint("GET /todos", { query: Filters, output: Todos }),
		);
		expectTypeOf(inline).toEqualTypeOf<typeof bound>();
		const all = api.bindAll({ list: listTodos, pair: [listTodos, {}] });
		expectTypeOf(all.list).toEqualTypeOf<typeof bound>();
		expectTypeOf(all.pair).toEqualTypeOf<typeof bound>();
		class Api extends Fetch.Service<Api>()("Api", {}) {}
		class TodoApi extends Fetch.Endpoints<TodoApi>()("TodoApi", Api, {
			list: listTodos,
		}) {}
		expectTypeOf<Effect.Success<typeof TodoApi>["list"]>().toEqualTypeOf<
			typeof bound
		>();
		expectTypeOf(pageTodos.query).toEqualTypeOf<typeof Page>();
		const plain = api.endpoint("GET /x");
		expectTypeOf(plain.query).toEqualTypeOf<undefined>();
	});

	it("take object schemas only", () => {
		Fetch.endpoint("GET /x", { query: Schema.Struct({ a: Schema.String }) });
		class Filters extends Schema.Class<Filters>("Filters")({
			page: Schema.optional(Schema.Finite),
		}) {}
		const byClass = api.endpoint("GET /x", { query: Filters });
		byClass({ query: new Filters({ page: 1 }) });
		byClass.url({ query: new Filters({}) });
		// @ts-expect-error a string isn't a query
		Fetch.endpoint("GET /x", { query: Schema.String });
		// @ts-expect-error an array isn't a query
		Fetch.endpoint("GET /x", { query: Schema.Array(Schema.String) });
	});

	it("leave plain queries as they were", () => {
		const search = api.endpoint("GET /search");
		search({ query: { q: "docs", page: 1, tags: ["a"] } });
		// @ts-expect-error a query value is a string, number, boolean, …
		search({ query: { q: { nested: true } } });
	});
});

describe("endpoint.url", () => {
	it("takes params and query as the call does, and gives a string", () => {
		expectTypeOf(
			pageTodos.url({ params: { org: "a" }, query: { page: 1 } }),
		).toEqualTypeOf<string>();
		// @ts-expect-error the query's page is required
		pageTodos.url({ params: { org: "a" } });
		// @ts-expect-error the params are required
		pageTodos.url({ query: { page: 1 } });
		expectTypeOf(listTodos.url()).toEqualTypeOf<string>();
		listTodos.url({ query: { done: true } });
		// @ts-expect-error a boolean
		listTodos.url({ query: { done: "yes" } });
		const localized = api.endpoint("GET /search", { query: NeedsLocale });
		// @ts-expect-error url can't encode a schema that needs services
		localized.url({ query: { q: "x" } });
		// @ts-expect-error nor on a definition
		Fetch.endpoint("GET /search", { query: NeedsLocale }).url({
			query: { q: "x" },
		});
		const plain = api.endpoint("POST /todos", { input: Todo });
		plain.url();
		// @ts-expect-error url takes no body
		plain.url({ body: { id: 1, title: "x" } });
	});
});

describe("Fetch.catchStatus", () => {
	const call = api.get("/todos/1", { output: Todo });
	type CallE = Effect.Error<typeof call>;

	it("keeps the error type, and adds the handler's", () => {
		const caught = call.pipe(
			Fetch.catchStatus(404, () => Effect.succeed(null)),
		);
		expectTypeOf<Effect.Success<typeof caught>>().toEqualTypeOf<
			typeof Todo.Type | null
		>();
		expectTypeOf<Effect.Error<typeof caught>>().toEqualTypeOf<CallE>();
		class Gone extends Schema.TaggedError<Gone>()("Gone", {}) {}
		const failed = call.pipe(
			Fetch.catchStatus(404, () => Effect.fail(new Gone())),
		);
		expectTypeOf<Effect.Error<typeof failed>>().toEqualTypeOf<CallE | Gone>();
	});

	it("narrows the handler's status to the statuses given", () => {
		call.pipe(
			Fetch.catchStatus(404, (error) => {
				expectTypeOf(error.status).toEqualTypeOf<404>();
				expectTypeOf(error).toExtend<Fetch.HttpError>();
				return Effect.void;
			}),
		);
		call.pipe(
			Fetch.catchStatus([401, 403], (error) => {
				expectTypeOf(error.status).toEqualTypeOf<401 | 403>();
				return Effect.void;
			}),
		);
		Fetch.catchStatus(call, 409, (error) => {
			expectTypeOf(error).toEqualTypeOf<Fetch.CaughtStatus<409>>();
			return Effect.void;
		});
	});

	it("is the same data-first", () => {
		const first = Fetch.catchStatus(call, 404, () => Effect.succeed(0));
		const last = call.pipe(Fetch.catchStatus(404, () => Effect.succeed(0)));
		expectTypeOf(first).toEqualTypeOf(last);
	});
});

describe("Fetch.optional", () => {
	it("wraps the value in an Option and keeps the errors", () => {
		const found = api.get("/todos/1", { output: Todo }).pipe(Fetch.optional);
		expectTypeOf<Effect.Success<typeof found>>().toEqualTypeOf<
			Option.Option<typeof Todo.Type>
		>();
		expectTypeOf<Effect.Error<typeof found>>().toEqualTypeOf<
			Effect.Error<ReturnType<typeof api.get<"/todos/1", typeof Todo>>>
		>();
	});
});

describe("Fetch.AnyUnboundEndpoint", () => {
	it("types the route, method and path, and takes every definition", () => {
		const definitions: ReadonlyArray<Fetch.AnyUnboundEndpoint> = [
			listTodos,
			Fetch.endpoint("POST /todos", { input: Todo }),
			Fetch.endpoint("GET /search", { query: NeedsLocale }),
		];
		const first = definitions[0]!;
		expectTypeOf(first.route).toEqualTypeOf<string>();
		expectTypeOf(first.path).toEqualTypeOf<string>();
		expectTypeOf(first.method).toEqualTypeOf<HttpMethod.HttpMethod>();
		// @ts-expect-error a route is a string
		const n: number = first.route;
		expectTypeOf(n).toBeNumber();
	});
});
