import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import { Fetch } from "../src/index.js";
import { base, setup, wire } from "./utils/client.js";
import { redacted, supportsRedactedQuery } from "./utils/redacted.js";
import { reply } from "./utils/reply.js";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

const TodoFilters = Schema.Struct({
	done: Schema.optional(Schema.Boolean),
	since: Schema.optional(Schema.Date),
	pageSize: Schema.optional(Schema.Finite),
	tags: Schema.optional(Schema.Array(Schema.String)),
}).pipe(Schema.encodeKeys({ pageSize: "page_size" }));

const listTodos = Fetch.endpoint("GET /todos", {
	query: TodoFilters,
	output: Schema.Array(Todo),
});

const defectOf = <A, E>(self: Effect.Effect<A, E>) =>
	Effect.map(Effect.exit(self), (exit) => {
		expect(Exit.hasDies(exit)).toBe(true);
		return Exit.isFailure(exit)
			? (Cause.squash(exit.cause) as Error).message
			: undefined;
	});

describe("query schemas", () => {
	it.effect("encode the query, with renamed keys and dropped fields", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json([])]);
			const list = api.bind(listTodos);
			yield* list({
				query: {
					done: true,
					since: new Date(0),
					pageSize: 20,
					tags: ["a", "b"],
				},
			});
			expect(wire(mock).url).toBe(
				`${base}/todos?done=true&since=1970-01-01T00%3A00%3A00.000Z&page_size=20&tags=a&tags=b`,
			);
		}),
	);

	it.effect("send nothing for fields left out, or no query at all", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json([])]);
			const list = api.bind(listTodos);
			yield* list({ query: { done: false } });
			yield* list();
			expect(wire(mock, 0).url).toBe(`${base}/todos?done=false`);
			expect(wire(mock, 1).url).toBe(`${base}/todos`);
		}),
	);

	it.effect("are exposed, and kept by bind, bindAll and client.endpoint", () =>
		Effect.gen(function* () {
			expect(listTodos.query).toBe(TodoFilters);
			const { mock, api } = yield* setup([reply.json([])]);
			const bound = api.bind(listTodos);
			expect(bound.query).toBe(TodoFilters);
			const { list } = api.bindAll({ list: [listTodos, {}] });
			yield* list({ query: { pageSize: 5 } });
			const direct = api.endpoint("GET /todos", { query: TodoFilters });
			expect(direct.query).toBe(TodoFilters);
			yield* direct({ query: { pageSize: 6 } });
			expect(wire(mock, 0).url).toBe(`${base}/todos?page_size=5`);
			expect(wire(mock, 1).url).toBe(`${base}/todos?page_size=6`);
		}),
	);

	it.effect("make the call die when the query doesn't match", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json([])]);
			const list = api.bind(listTodos);
			const message = yield* defectOf(
				list({ query: { pageSize: "many" } as never }),
			);
			expect(message).toMatch(
				/^Invalid query: it doesn't match the query schema/,
			);
			expect(mock.requests).toHaveLength(0);
		}),
	);

	it.effect("make the call die when a field encodes to an object", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json([])]);
			const nested = api.endpoint("GET /x", {
				query: Schema.Struct({
					range: Schema.Struct({ from: Schema.String }),
				}),
			});
			const message = yield* defectOf(
				nested({ query: { range: { from: "a" } } }),
			);
			expect(message).toBe(
				'Invalid query: "range" encodes to an object, which can\'t be a query parameter',
			);
			expect(mock.requests).toHaveLength(0);
		}),
	);

	it.effect('send null as "null", as the codec encodes it', () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json([])]);
			const search = api.endpoint("GET /x", {
				query: Schema.Struct({ q: Schema.NullOr(Schema.String) }),
			});
			yield* search({ query: { q: null } });
			expect(wire(mock).url).toBe(`${base}/x?q=null`);
		}),
	);
});

describe("query schemas, edge cases", () => {
	it.effect("take a Schema.Class, called with an instance", () =>
		Effect.gen(function* () {
			class Filters extends Schema.Class<Filters>("Filters")({
				page: Schema.optional(Schema.Finite),
			}) {}
			const { mock, api } = yield* setup([reply.json([])]);
			const list = api.endpoint("GET /todos", { query: Filters });
			yield* list({ query: new Filters({ page: 2 }) });
			expect(wire(mock).url).toBe(`${base}/todos?page=2`);
			expect(list.url({ query: new Filters({ page: 3 }) })).toBe(
				`${base}/todos?page=3`,
			);
		}),
	);

	it("throw when defined, for a field with no string encoding", () => {
		expect(() =>
			Fetch.endpoint("GET /x", {
				query: Schema.Struct({ f: Schema.instanceOf(Uint8Array) }),
			}),
		).toThrow(
			/^Invalid query schema: it can't be encoded to strings: Missing structural codec/,
		);
	});

	it.effect("send numbers a field's schema leaves as they are", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json([])]);
			const search = api.endpoint("GET /x", {
				query: Schema.Struct({ page: Schema.Any }),
			});
			yield* search({ query: { page: 2 } });
			expect(wire(mock).url).toBe(`${base}/x?page=2`);
		}),
	);

	it.effect("make the call die for an array inside an array", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.json([])]);
			const nested = api.endpoint("GET /x", {
				query: Schema.Struct({
					m: Schema.Array(Schema.Array(Schema.String)),
				}),
			});
			const message = yield* defectOf(nested({ query: { m: [["a"]] } }));
			expect(message).toBe(
				'Invalid query: "m" encodes to an array inside an array, which can\'t be a query parameter',
			);
			expect(mock.requests).toHaveLength(0);
		}),
	);

	it.effect.skipIf(!supportsRedactedQuery)(
		"keep a Schema.Redacted field redacted in the request, and send its value",
		() =>
			Effect.gen(function* () {
				const seen: Array<HttpClientRequest.HttpClientRequest> = [];
				const capture = Fetch.plugin({
					name: "capture",
					onRequest: (request) =>
						Effect.sync(() => {
							seen.push(request);
							return request;
						}),
				});
				const { mock, api } = yield* setup([reply.json([])], {
					plugins: [capture],
				});
				const get = api.endpoint("GET /x", {
					query: Schema.Struct({
						key: Schema.Redacted(Schema.String),
						tags: Schema.Array(Schema.Redacted(Schema.String)),
						q: Schema.String,
					}),
				});
				const query = {
					key: Redacted.make("secret"),
					tags: [Redacted.make("t1")],
					q: "plain",
				};
				yield* get({ query });
				expect(wire(mock).url).toBe(`${base}/x?key=secret&tags=t1&q=plain`);
				expect(get.url({ query })).toBe(wire(mock).url);
				const params = seen[0]?.urlParams.params ?? [];
				expect(params.map(([key]) => key)).toEqual(["key", "tags", "q"]);
				expect(Redacted.isRedacted(params[0]?.[1])).toBe(true);
				expect(Redacted.isRedacted(params[1]?.[1])).toBe(true);
				expect(params[2]?.[1]).toBe("plain");
			}),
	);
});

describe("Schema.Redacted query fields", () => {
	it.effect.skipIf(!supportsRedactedQuery)(
		"stay redacted by key, whatever their encoding",
		() =>
			Effect.gen(function* () {
				const seen: Array<HttpClientRequest.HttpClientRequest> = [];
				const capture = Fetch.plugin({
					name: "capture",
					onRequest: (request) =>
						Effect.sync(() => {
							seen.push(request);
							return request;
						}),
				});
				const { mock, api } = yield* setup(
					[reply.json([]), reply.json([])],
					{
						plugins: [capture],
					},
				);
				const get = api.endpoint("GET /x", {
					query: Schema.Struct({
						when: Schema.Redacted(Schema.Date),
						page: Schema.String,
					}),
				});
				// `page` equals the secret's encoding, and isn't secret.
				yield* get({
					query: {
						when: Redacted.make(new Date(0)),
						page: "1970-01-01T00:00:00.000Z",
					},
				});
				const params = seen[0]?.urlParams.params ?? [];
				expect(Redacted.isRedacted(params[0]?.[1])).toBe(true);
				expect(params[1]?.[1]).toBe("1970-01-01T00:00:00.000Z");
				// A renamed secret field: the renamed fields are hidden.
				const renamed = api.endpoint("GET /y", {
					query: Schema.Struct({
						apiKey: Schema.Redacted(Schema.Trim),
						q: Schema.String,
					}).pipe(Schema.encodeKeys({ apiKey: "api_key" })),
				});
				yield* renamed({ query: { apiKey: Redacted.make("k1"), q: "k1" } });
				const second = seen[1]?.urlParams.params ?? [];
				expect(second.map(([key]) => key)).toEqual(["api_key", "q"]);
				expect(Redacted.isRedacted(second[0]?.[1])).toBe(true);
				expect(second[1]?.[1]).toBe("k1");
				expect(mock.requests[1]?.url).toBe(`${base}/y?api_key=k1&q=k1`);
			}),
	);
});

describe("endpoint.url", () => {
	const getFile = Fetch.endpoint("GET /files/:name", {
		query: Schema.Struct({
			download: Schema.optional(Schema.Boolean),
			q: Schema.optional(Schema.String),
		}),
	});

	it.effect("is the URL the call sends to", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.empty(200)]);
			const file = api.bind(getFile);
			const options = {
				params: { name: "a b/c" },
				query: { download: true, q: "x y&z" },
			};
			const url = file.url(options);
			yield* file(options);
			expect(url).toBe(wire(mock).url);
			expect(url).toBe(`${base}/files/a%20b%2Fc?download=true&q=x+y%26z`);
		}),
	);

	it.effect("matches the call for plain queries, arrays and no query", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.empty(200)]);
			const search = api.endpoint("GET /search");
			const cases = [
				{ query: { tag: ["a", "b c"], page: 2, skip: null } },
				{ query: {} },
				{},
			] as const;
			for (const [index, options] of cases.entries()) {
				const url = search.url(options);
				yield* search(options);
				expect(url).toBe(wire(mock, index).url);
			}
			expect(search.url()).toBe(`${base}/search`);
		}),
	);

	it.effect.each([
		[
			"a trailing slash and a path prefix",
			"https://api.test/v1/",
			"https://api.test/v1/todos/1",
		],
		[
			"no trailing slash",
			"https://api.test/v1",
			"https://api.test/v1/todos/1",
		],
	] as const)("joins the baseUrl with %s", ([, baseUrl, expected]) =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.empty(200)], { baseUrl });
			const get = api.endpoint("GET /todos/:id");
			const url = get.url({ params: { id: 1 } });
			yield* get({ params: { id: 1 } });
			expect(url).toBe(expected);
			expect(url).toBe(wire(mock).url);
		}),
	);

	it.effect("keeps an absolute route, and a route's own query string", () =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.empty(200)]);
			const upload = api.endpoint("POST https://uploads.test/files?v=2");
			const url = upload.url({ query: { name: "a" } });
			yield* upload({ query: { name: "a" } });
			expect(url).toBe("https://uploads.test/files?v=2&name=a");
			expect(url).toBe(wire(mock).url);
		}),
	);

	it.effect.each([
		["a `..` segment", "GET /files/:name", { params: { name: ".." } }],
		["a host without a path", "GET https://cdn.test", { query: { a: 1 } }],
		[
			"a route's own query string",
			"GET /x?next=/home&q=a%20b",
			{ query: { a: 1 } },
		],
		[
			"an uppercase host, a default port and a space",
			"GET https://CDN.test:443/a b",
			{ query: { a: 1 } },
		],
	] as const)("is the URL the call sends to, with %s", ([, route, options]) =>
		Effect.gen(function* () {
			const { mock, api } = yield* setup([reply.empty(200)]);
			const get = api.endpoint(route as "GET /x", {});
			const url = get.url(options as never);
			yield* get(options as never);
			expect(url).toBe(wire(mock).url);
		}),
	);

	it("is relative on a definition, and resolves `..` as the call would", () => {
		expect(Fetch.endpoint("GET /a/:b").url({ params: { b: ".." } })).toBe(
			"/",
		);
		expect(
			Fetch.endpoint("GET /x").url({ query: { q: "a b", s: "/" } }),
		).toBe("/x?q=a+b&s=%2F");
	});

	it("is relative on a definition, and absolute for an absolute route", () => {
		expect(
			getFile.url({ params: { name: "x" }, query: { download: false } }),
		).toBe("/files/x?download=false");
		expect(Fetch.endpoint("GET https://cdn.test/a").url()).toBe(
			"https://cdn.test/a",
		);
	});

	it.effect("has no baseUrl without one on the client", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([], { baseUrl: undefined });
			expect(api.bind(getFile).url({ params: { name: "x" } })).toBe(
				"/files/x",
			);
		}),
	);

	it("throws for a missing param or a query that doesn't match", () => {
		expect(() => getFile.url({} as never)).toThrow(
			'Missing path parameter "name" for path "/files/:name"',
		);
		expect(() =>
			getFile.url({
				params: { name: "x" },
				query: { download: "yes" } as never,
			}),
		).toThrow(/^Invalid query: it doesn't match the query schema/);
	});

	it.effect.skipIf(!supportsRedactedQuery)(
		"reveals a Redacted query value, as the call sends it",
		() =>
			Effect.gen(function* () {
				const { mock, api } = yield* setup([reply.empty(200)]);
				const get = api.endpoint("GET /x");
				const options = { query: { key: redacted("secret") } };
				const url = get.url(options);
				yield* get(options);
				expect(url).toBe(`${base}/x?key=secret`);
				expect(url).toBe(wire(mock).url);
			}),
	);
});

describe("Fetch.catchStatus", () => {
	it.effect("handles the given status, and lets the others through", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.empty(404),
				reply.empty(500),
				reply.json({ id: 1, title: "x" }),
			]);
			const get = () =>
				api
					.get("/todos/1", { output: Todo })
					.pipe(
						Fetch.catchStatus(404, (error) =>
							Effect.succeed(error.status),
						),
					);
			expect(yield* get()).toBe(404);
			const failed = yield* Effect.flip(get());
			expect(failed).toMatchObject({ _tag: "HttpError", status: 500 });
			expect(yield* get()).toEqual({ id: 1, title: "x" });
		}),
	);

	it.effect("takes a list of statuses, and the data-first form", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.empty(401), reply.empty(403)]);
			const signedOut = () =>
				Fetch.catchStatus(api.get("/me"), [401, 403], () =>
					Effect.succeed("signed out"),
				);
			expect(yield* signedOut()).toBe("signed out");
			expect(yield* signedOut()).toBe("signed out");
		}),
	);

	it.effect("adds the handler's errors, and passes other errors through", () =>
		Effect.gen(function* () {
			class Gone extends Schema.TaggedError<Gone>()("Gone", {}) {}
			const { api } = yield* setup([
				reply.empty(404),
				reply.json({ id: "x" }),
			]);
			const get = () =>
				api
					.get("/todos/1", { output: Todo })
					.pipe(Fetch.catchStatus(404, () => Effect.fail(new Gone())));
			expect(yield* Effect.flip(get())).toBeInstanceOf(Gone);
			expect(yield* Effect.flip(get())).toBeInstanceOf(Fetch.DecodeError);
		}),
	);

	it.effect("never sees a status that statusErrors maps", () =>
		Effect.gen(function* () {
			class NotFound extends Schema.TaggedError<NotFound>()(
				"NotFound",
				{},
			) {}
			const { api } = yield* setup([reply.json({}, { status: 404 })]);
			const error = yield* Effect.flip(
				api
					.get("/todos/1", { statusErrors: { 404: NotFound } })
					.pipe(Fetch.optional),
			);
			expect(error).toBeInstanceOf(NotFound);
		}),
	);
});

describe("Fetch.optional", () => {
	it.effect(
		"gives none for a 404, some for a success, and fails otherwise",
		() =>
			Effect.gen(function* () {
				const { api } = yield* setup([
					reply.empty(404),
					reply.json({ id: 1, title: "x" }),
					reply.empty(503),
				]);
				const find = () =>
					api.get("/todos/1", { output: Todo }).pipe(Fetch.optional);
				expect(yield* find()).toEqual(Option.none());
				expect(yield* find()).toEqual(Option.some({ id: 1, title: "x" }));
				expect(yield* Effect.flip(find())).toMatchObject({ status: 503 });
			}),
	);

	it.effect("works on endpoints", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.empty(404)]);
			const getTodo = api.endpoint("GET /todos/:id", { output: Todo });
			const found = yield* getTodo({ params: { id: 1 } }).pipe(
				Fetch.optional,
			);
			expect(Option.isNone(found)).toBe(true);
		}),
	);
});
