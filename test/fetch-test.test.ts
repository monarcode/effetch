import { runInNewContext } from "node:vm";

import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import * as Fetch from "../src/index.js";
import { retry, timeout } from "../src/plugins/index.js";
import { FetchTest } from "../src/test/index.js";

const base = "https://api.test";

const Todo = Schema.Struct({
	id: Schema.Finite,
	title: Schema.String,
	due: Schema.Date,
});
const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
	message: Schema.String,
}) {}

class SessionExpired extends Schema.TaggedError<SessionExpired>()(
	"SessionExpired",
	{ message: Schema.String },
) {}

const ApiError = Schema.Struct({ code: Schema.String });

const getTodo = Fetch.endpoint("GET /todos/:id", {
	output: Todo,
	statusErrors: { 404: TodoNotFound },
});
const createTodo = Fetch.endpoint("POST /todos", {
	input: NewTodo,
	output: Todo,
});
const listTodos = Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) });
const deleteTodo = Fetch.endpoint("DELETE /todos/:id");

const due = new Date(Date.UTC(2026, 0, 1));

/** Runs `self` with a client on `backend`, and the backend's recorder. */
const run = <A, E>(
	self: (api: Fetch.Client) => Effect.Effect<A, E>,
	backend: Layer.Layer<
		import("effect/http/HttpClient").HttpClient | FetchTest.Recorder
	>,
	baseUrl = base,
) =>
	Effect.gen(function* () {
		const api = yield* Fetch.make({ baseUrl });
		return yield* self(api);
	}).pipe(Effect.provide(backend));

const defectOf = <A, E, R>(self: Effect.Effect<A, E, R>) =>
	Effect.map(Effect.exit(self), (exit) => {
		expect(Exit.hasDies(exit)).toBe(true);
		return Exit.isFailure(exit)
			? (Cause.squash(exit.cause) as Error).message
			: "";
	});

describe("FetchTest", () => {
	describe("respond", () => {
		it.effect("answers a route with params, and encodes the output", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(getTodo, ({ params }) =>
						Effect.succeed({ id: 1, title: params.id, due }),
					),
				]);
				const todo = yield* run(
					(api) => api.bind(getTodo)({ params: { id: "a b/c" } }),
					backend,
				);
				// The param arrives decoded; the Date went over the wire as a string.
				expect(todo).toEqual({ id: 1, title: "a b/c", due });
				expect(todo.due).toBeInstanceOf(Date);
			}),
		);

		it.effect("sends the output's encoded form on the wire", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(getTodo, () =>
						Effect.succeed({ id: 1, title: "x", due }),
					),
				]);
				const text = yield* run(
					(api) =>
						Effect.flatMap(
							api.get("/todos/:id", { params: { id: 1 } }),
							(response) => response.text,
						),
					backend,
				);
				expect(JSON.parse(text)).toEqual({
					id: 1,
					title: "x",
					due: "2026-01-01T00:00:00.000Z",
				});
			}),
		);

		it.effect("decodes the body with input", () =>
			Effect.gen(function* () {
				const seen: Array<unknown> = [];
				const backend = FetchTest.layer([
					FetchTest.respond(
						createTodo,
						({ body }) => {
							seen.push(body);
							return Effect.succeed({ id: 2, ...body });
						},
						{ status: 201, headers: { location: "/todos/2" } },
					),
				]);
				const [todo, response] = yield* run(
					(api) =>
						api.bind(createTodo)({
							body: { title: "New", due },
							responseMode: "decoded-and-response",
						}),
					backend,
				);
				expect(seen).toEqual([{ title: "New", due }]);
				expect(todo).toEqual({ id: 2, title: "New", due });
				expect(response.status).toBe(201);
				expect(response.headers.location).toBe("/todos/2");
			}),
		);

		it.effect("dies when the body doesn't match input", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(createTodo, ({ body }) =>
						Effect.succeed({ id: 2, ...body }),
					),
				]);
				const message = yield* defectOf(
					run(
						(api) => api.post("/todos", { body: { title: 1 } }),
						backend,
					),
				);
				expect(message).toContain(
					"FetchTest: the body sent to POST /todos doesn't match its input schema",
				);
			}),
		);

		it.effect("dies when the result doesn't match output", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(getTodo, () =>
						Effect.succeed({ id: 1, title: "x" } as never),
					),
				]);
				const message = yield* defectOf(
					run((api) => api.bind(getTodo)({ params: { id: 1 } }), backend),
				);
				expect(message).toContain(
					"FetchTest: the handler for GET /todos/:id returned a value that doesn't match its output schema",
				);
			}),
		);

		it.effect("sends 204 without a body", () =>
			Effect.gen(function* () {
				const removeTodo = Fetch.endpoint("DELETE /todos/:id", {
					output: Schema.Void,
				});
				const backend = FetchTest.layer([
					FetchTest.respond(removeTodo, () => Effect.void),
					FetchTest.respond(deleteTodo, () => Effect.succeed(undefined)),
				]);
				const [value, response] = yield* run(
					(api) =>
						api.bind(removeTodo)({
							params: { id: 1 },
							responseMode: "decoded-and-response",
						}),
					backend,
				);
				expect(value).toBeUndefined();
				expect(response.status).toBe(204);
				const plain = yield* run(
					(api) => api.bind(deleteTodo)({ params: { id: 1 } }),
					backend,
				);
				expect(plain.status).toBe(204);
			}),
		);

		it.effect("sends a result without output by its runtime type", () =>
			Effect.gen(function* () {
				const json = Fetch.endpoint("GET /json");
				const text = Fetch.endpoint("GET /text");
				const backend = FetchTest.layer([
					FetchTest.respond(json, () => Effect.succeed({ ok: true })),
					FetchTest.respond(text, () => Effect.succeed("plain")),
				]);
				const [jsonResponse, textResponse] = yield* run(
					(api) => Effect.all([api.bind(json)(), api.bind(text)()]),
					backend,
				);
				expect(jsonResponse.headers["content-type"]).toBe(
					"application/json",
				);
				expect(yield* jsonResponse.json).toEqual({ ok: true });
				expect(textResponse.headers["content-type"]).toBe("text/plain");
				expect(yield* textResponse.text).toBe("plain");
			}),
		);

		it.effect("answers Fetch.text and Fetch.bytes outputs", () =>
			Effect.gen(function* () {
				const csv = Fetch.endpoint("GET /export.csv", {
					output: Fetch.text(),
				});
				const count = Fetch.endpoint("GET /todos/count", {
					output: Fetch.text(Schema.NumberFromString),
				});
				const avatar = Fetch.endpoint("GET /avatar", {
					output: Fetch.bytes(),
				});
				const backend = FetchTest.layer([
					FetchTest.respond(csv, () => Effect.succeed("a,b\n1,2")),
					FetchTest.respond(count, () => Effect.succeed(42)),
					FetchTest.respond(avatar, () =>
						Effect.succeed(new Uint8Array([1, 2, 3])),
					),
				]);
				const result = yield* run(
					(api) =>
						Effect.all([
							api.bind(csv)(),
							api.bind(count)(),
							api.bind(avatar)(),
						]),
					backend,
				);
				expect(result).toEqual(["a,b\n1,2", 42, new Uint8Array([1, 2, 3])]);
			}),
		);

		it.effect("answers with a reply", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(getTodo, ({ params }) =>
						Effect.succeed(
							params.id === "1"
								? { id: 1, title: "x", due }
								: FetchTest.reply(404, {
										message: `No todo ${params.id}`,
									}),
						),
					),
				]);
				const error = yield* run(
					(api) => Effect.flip(api.bind(getTodo)({ params: { id: 9 } })),
					backend,
				);
				expect(error).toBeInstanceOf(TodoNotFound);
				expect(error).toMatchObject({ message: "No todo 9" });
			}),
		);

		it.effect("sends a reply's body by its runtime type", () =>
			Effect.gen(function* () {
				const raw = Fetch.endpoint("GET /raw/:kind");
				const backend = FetchTest.layer([
					FetchTest.respond(raw, ({ params }) =>
						Effect.succeed(
							params.kind === "text"
								? FetchTest.reply(500, "Oops")
								: params.kind === "bytes"
									? FetchTest.reply(500, new Uint8Array([7]))
									: params.kind === "json-text"
										? FetchTest.reply(200, JSON.stringify("x"), {
												headers: {
													"content-type": "application/json",
												},
											})
										: FetchTest.reply(204),
						),
					),
				]);
				const errors = yield* run(
					(api) =>
						Effect.all([
							Effect.flip(api.bind(raw)({ params: { kind: "text" } })),
							Effect.flip(api.bind(raw)({ params: { kind: "bytes" } })),
						]),
					backend,
				);
				expect(errors.map((error) => error._tag)).toEqual([
					"HttpError",
					"HttpError",
				]);
				expect(errors[0]).toMatchObject({ status: 500, text: "Oops" });
				const jsonText = yield* run(
					(api) =>
						api.get("/raw/:kind", {
							params: { kind: "json-text" },
							output: Schema.String,
						}),
					backend,
				);
				expect(jsonText).toBe("x");
				const empty = yield* run(
					(api) => api.bind(raw)({ params: { kind: "empty" } }),
					backend,
				);
				expect(empty.status).toBe(204);
			}),
		);

		it("checks the status and body of a reply", () => {
			expect(() => FetchTest.reply(199)).toThrow(
				"FetchTest.reply: the status must be an integer from 200 to 599, got 199",
			);
			expect(() => FetchTest.reply(600)).toThrow(RangeError);
			expect(() => FetchTest.reply(200.5)).toThrow(RangeError);
			expect(() => FetchTest.reply(204, { a: 1 })).toThrow(
				"FetchTest.reply: a 204 response can't have a body",
			);
			expect(() => FetchTest.reply(304, "")).toThrow(TypeError);
			expect(Object.isFrozen(FetchTest.reply(200, { a: 1 }))).toBe(true);
		});

		it("checks its arguments", () => {
			expect(() =>
				FetchTest.respond({} as never, () =>
					Effect.succeed(FetchTest.reply(200)),
				),
			).toThrow("FetchTest.respond takes an endpoint");
			expect(() => FetchTest.respond(getTodo, "x" as never)).toThrow(
				"FetchTest.respond takes a handler function",
			);
			expect(() =>
				FetchTest.respond(
					getTodo,
					() => Effect.succeed(FetchTest.reply(200)),
					{
						status: 100,
					},
				),
			).toThrow("FetchTest.respond: the status must be an integer");
		});

		it.effect("dies when a 204 response has a body", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(deleteTodo, () => Effect.succeed({ a: 1 }), {
						status: 204,
					}),
				]);
				const message = yield* defectOf(
					run(
						(api) => api.bind(deleteTodo)({ params: { id: 1 } }),
						backend,
					),
				);
				expect(message).toBe(
					"FetchTest: the handler for DELETE /todos/:id sent a body with a 204 response, which can't have one",
				);
			}),
		);

		it.effect("dies when a result has no JSON form", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(deleteTodo, () => Effect.succeed(10n)),
				]);
				const message = yield* defectOf(
					run(
						(api) => api.bind(deleteTodo)({ params: { id: 1 } }),
						backend,
					),
				);
				expect(message).toContain(
					"FetchTest: the value the handler for DELETE /todos/:id returned can't be sent as JSON",
				);
			}),
		);
	});

	describe("query", () => {
		const Search = Schema.Struct({
			since: Schema.Date,
			tags: Schema.Array(Schema.String),
			ids: Schema.Array(Schema.FiniteFromString),
			labels: Schema.optional(Schema.Array(Schema.String)),
			owner: Schema.NullOr(Schema.String),
			page: Schema.optional(Schema.FiniteFromString),
		});
		const search = Fetch.endpoint("GET /search", { query: Search });

		it.effect("decodes the query with the query schema", () =>
			Effect.gen(function* () {
				const seen: Array<unknown> = [];
				const backend = FetchTest.layer([
					FetchTest.respond(search, ({ query }) => {
						seen.push(query);
						return Effect.succeed(FetchTest.reply(204));
					}),
				]);
				const since = new Date(0);
				yield* run(
					(api) =>
						Effect.all([
							api.bind(search)({
								query: {
									since,
									tags: ["a"],
									ids: [],
									owner: null,
									page: 2,
								},
							}),
							api.bind(search)({
								query: {
									since,
									tags: ["a", "b"],
									ids: [1, 2],
									labels: ["x"],
									owner: "me",
								},
							}),
						]),
					backend,
				);
				expect(seen).toEqual([
					{ since, tags: ["a"], ids: [], owner: null, page: 2 },
					{
						since,
						tags: ["a", "b"],
						ids: [1, 2],
						labels: ["x"],
						owner: "me",
					},
				]);
			}),
		);

		it.effect("decodes a Schema.Class query", () =>
			Effect.gen(function* () {
				class Page extends Schema.Class<Page>("Page")({
					page: Schema.FiniteFromString,
				}) {}
				const paged = Fetch.endpoint("GET /paged", { query: Page });
				const seen: Array<unknown> = [];
				const backend = FetchTest.layer([
					FetchTest.respond(paged, ({ query }) => {
						seen.push(query);
						return Effect.succeed(FetchTest.reply(204));
					}),
				]);
				yield* run(
					(api) => api.bind(paged)({ query: new Page({ page: 3 }) }),
					backend,
				);
				expect(seen[0]).toBeInstanceOf(Page);
				expect(seen[0]).toMatchObject({ page: 3 });
			}),
		);

		it.effect("gives the raw query without a query schema", () =>
			Effect.gen(function* () {
				const seen: Array<unknown> = [];
				const backend = FetchTest.layer([
					FetchTest.respond(listTodos, ({ query }) => {
						seen.push(query);
						return Effect.succeed([]);
					}),
				]);
				yield* run(
					(api) =>
						api.bind(listTodos)({
							query: { q: "a b+c&d", tag: ["x", "y"], empty: "" },
						}),
					backend,
				);
				expect(seen).toEqual([
					{ q: "a b+c&d", tag: ["x", "y"], empty: "" },
				]);
			}),
		);

		it.effect("dies when the query doesn't match the query schema", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(search, () =>
						Effect.succeed(FetchTest.reply(204)),
					),
				]);
				const message = yield* defectOf(
					run(
						(api) => api.get("/search", { query: { since: "never" } }),
						backend,
					),
				);
				expect(message).toContain(
					"FetchTest: the query sent to GET /search doesn't match its query schema",
				);
			}),
		);
	});

	describe("fail", () => {
		it.effect("encodes the body with the status's statusErrors schema", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.fail(
						getTodo,
						404,
						new TodoNotFound({ message: "No todo 9" }),
					),
				]);
				const error = yield* run(
					(api) => Effect.flip(api.bind(getTodo)({ params: { id: 9 } })),
					backend,
				);
				expect(error).toBeInstanceOf(TodoNotFound);
				expect(error).toMatchObject({ message: "No todo 9" });
			}),
		);

		it.effect("uses a bound endpoint's client statusErrors and error", () =>
			Effect.gen(function* () {
				const plain = Fetch.endpoint("GET /me");
				const config = {
					baseUrl: base,
					defaultError: ApiError,
					statusErrors: { 401: SessionExpired },
				};
				// A bound endpoint's schemas don't depend on the HttpClient.
				const me = yield* Effect.map(Fetch.make(config), (api) =>
					api.bind(plain),
				).pipe(Effect.provide(FetchTest.layer([])));
				const call = Effect.flatMap(Fetch.make(config), (api) =>
					Effect.flip(api.bind(plain)()),
				);
				const expired = yield* call.pipe(
					Effect.provide(
						FetchTest.layer([
							FetchTest.fail(
								me,
								401,
								new SessionExpired({ message: "Expired" }),
							),
						]),
					),
				);
				const failed = yield* call.pipe(
					Effect.provide(
						FetchTest.layer([FetchTest.fail(me, 500, { code: "boom" })]),
					),
				);
				expect(expired).toBeInstanceOf(SessionExpired);
				expect(failed).toMatchObject({
					_tag: "HttpError",
					status: 500,
					body: { code: "boom" },
				});
			}),
		);

		it.effect("sends an empty body without one", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([FetchTest.fail(listTodos, 503)]);
				const error = yield* run(
					(api) => Effect.flip(api.bind(listTodos)()),
					backend,
				);
				expect(error).toMatchObject({
					_tag: "HttpError",
					status: 503,
					text: "",
				});
			}),
		);

		it.effect("sends the body as it is without schemas", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.fail(
						listTodos,
						500,
						{ code: "boom" },
						{
							headers: { "retry-after": "1" },
						},
					),
				]);
				const error = yield* run(
					(api) => Effect.flip(api.bind(listTodos)()),
					backend,
				);
				expect(error).toMatchObject({
					status: 500,
					body: { code: "boom" },
				});
				expect(
					error._tag === "HttpError" && error.headers["retry-after"],
				).toBe("1");
			}),
		);

		it.effect("dies when no schema encodes the body", () =>
			Effect.gen(function* () {
				const strict = Fetch.endpoint("GET /strict", { error: ApiError });
				const backend = FetchTest.layer([
					FetchTest.fail(strict, 500, { code: 1 } as never),
				]);
				const message = yield* defectOf(
					run((api) => api.bind(strict)(), backend),
				);
				expect(message).toContain(
					"FetchTest: the 500 body for GET /strict doesn't match its statusErrors or error schema",
				);
			}),
		);

		it("checks its arguments", () => {
			expect(() => FetchTest.fail(listTodos, 200)).toThrow(
				"FetchTest.fail: the status must be an error status, from 300 to 599, got 200",
			);
			expect(() => FetchTest.fail(listTodos, 700)).toThrow(RangeError);
			expect(() => FetchTest.fail(listTodos, 304, "x")).toThrow(
				"FetchTest.fail: a 304 response can't have a body",
			);
			expect(() => FetchTest.fail(null as never, 500)).toThrow(
				"FetchTest.fail takes an endpoint",
			);
		});
	});

	describe("matching", () => {
		it.effect("dies on an unmatched request, listing the routes", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(getTodo, () =>
						Effect.succeed({ id: 1, title: "", due }),
					),
					FetchTest.fail(listTodos, 503),
				]);
				const message = yield* defectOf(
					run(
						(api) =>
							api.get("/users/:id", {
								params: { id: 1 },
								query: { secret: "s" },
							}),
						backend,
					),
				);
				expect(message).toBe(
					[
						"FetchTest: no handler for GET https://api.test/users/1.",
						"The handlers are:",
						"  - GET /todos/:id",
						"  - GET /todos",
						"Without a baseUrl option, a route matches the end of the request's path.",
					].join("\n"),
				);
			}),
		);

		it.effect("dies on a wrong method, naming the route", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(getTodo, () =>
						Effect.succeed({ id: 1, title: "", due }),
					),
				]);
				const message = yield* defectOf(
					run(
						(api) => api.post("/todos/:id", { params: { id: 1 } }),
						backend,
					),
				);
				expect(message).toBe(
					[
						"FetchTest: no handler for POST https://api.test/todos/1.",
						"GET /todos/:id matches its path, but not its method.",
						"The handlers are:",
						"  - GET /todos/:id",
					].join("\n"),
				);
			}),
		);

		it.effect("says when there are no handlers", () =>
			Effect.gen(function* () {
				const message = yield* defectOf(
					run((api) => api.get("/x"), FetchTest.layer([])),
				);
				expect(message).toContain("The fake backend has no handlers.");
			}),
		);

		it.effect("matches the end of the path under any baseUrl", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(deleteTodo, ({ params }) =>
						Effect.succeed(params),
					),
				]);
				const response = yield* run(
					(api) => api.bind(deleteTodo)({ params: { id: 1 } }),
					backend,
					"https://api.test/v1",
				);
				expect(yield* response.json).toEqual({ id: "1" });
			}),
		);

		it.effect("prefers the longest route, then the most literal one", () =>
			Effect.gen(function* () {
				const byId = Fetch.endpoint("GET /todos/:id");
				const count = Fetch.endpoint("GET /todos/count");
				const nested = Fetch.endpoint("GET /users/:user/todos/:id");
				const backend = FetchTest.layer([
					FetchTest.respond(byId, () => Effect.succeed("byId")),
					FetchTest.respond(count, () => Effect.succeed("count")),
					FetchTest.respond(nested, () => Effect.succeed("nested")),
					FetchTest.respond(byId, () => Effect.succeed("second byId")),
				]);
				const bodies = yield* run(
					(api) =>
						Effect.all(
							["/todos/count", "/todos/1", "/users/u/todos/1"].map(
								(path) =>
									Effect.flatMap(
										api.get(path),
										(response) => response.text,
									),
							),
						),
					backend,
				);
				expect(bodies).toEqual(["count", "byId", "nested"]);
			}),
		);

		it.effect("matches exactly under a baseUrl option", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer(
					[FetchTest.respond(deleteTodo, () => Effect.void)],
					{ baseUrl: "https://api.test/v1/" },
				);
				const ok = yield* run(
					(api) => api.bind(deleteTodo)({ params: { id: 1 } }),
					backend,
					"https://api.test/v1",
				);
				expect(ok.status).toBe(204);
				const wrongPrefix = yield* defectOf(
					run(
						(api) => api.bind(deleteTodo)({ params: { id: 1 } }),
						backend,
						"https://api.test/v2",
					),
				);
				expect(wrongPrefix).toContain(
					"no handler for DELETE https://api.test/v2/todos/1",
				);
				expect(wrongPrefix).not.toContain("Without a baseUrl option");
				const wrongHost = yield* defectOf(
					run(
						(api) => api.bind(deleteTodo)({ params: { id: 1 } }),
						backend,
						"https://other.test/v1",
					),
				);
				expect(wrongHost).toContain(
					"no handler for DELETE https://other.test/v1/todos/1",
				);
			}),
		);

		it.effect("matches an absolute route's whole URL", () =>
			Effect.gen(function* () {
				const upload = Fetch.endpoint(
					"POST https://Uploads.test/files/:name",
				);
				const backend = FetchTest.layer([
					FetchTest.respond(upload, ({ params, body }) =>
						Effect.succeed({ name: params.name, body }),
					),
				]);
				const response = yield* run(
					(api) =>
						api.bind(upload)({ params: { name: "a.txt" }, body: "hi" }),
					backend,
				);
				expect(yield* response.json).toEqual({ name: "a.txt", body: "hi" });
				const message = yield* defectOf(
					run(
						(api) => api.post("https://other.test/files/a.txt"),
						backend,
					),
				);
				expect(message).toContain(
					"no handler for POST https://other.test/files/a.txt",
				);
			}),
		);

		it.effect("ignores a route's own query string", () =>
			Effect.gen(function* () {
				const v2 = Fetch.endpoint("GET /search?v=2");
				const backend = FetchTest.layer([
					FetchTest.respond(v2, ({ query }) => Effect.succeed(query)),
				]);
				const response = yield* run((api) => api.bind(v2)(), backend);
				expect(yield* response.json).toEqual({ v: "2" });
			}),
		);
	});

	describe("Recorder", () => {
		it.effect("records every request, with a new record per build", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(createTodo, ({ body }) =>
						Effect.succeed({ id: 2, ...body }),
					),
				]);
				const program = Effect.gen(function* () {
					const api = yield* Fetch.make({ baseUrl: base });
					yield* api.bind(createTodo)({
						body: { title: "New", due },
						headers: { "x-trace": "1" },
						query: { draft: true },
					});
					yield* Effect.exit(api.get("/nowhere"));
					return yield* FetchTest.requests;
				});
				const first = yield* Effect.provide(program, backend);
				expect(first).toHaveLength(2);
				expect(first[0]).toMatchObject({
					method: "POST",
					url: "https://api.test/todos?draft=true",
					route: "POST /todos",
					params: {},
					query: { draft: "true" },
					body: { title: "New", due: "2026-01-01T00:00:00.000Z" },
				});
				expect(first[0]?.headers["x-trace"]).toBe("1");
				expect(first[1]).toMatchObject({
					route: undefined,
					url: "https://api.test/nowhere",
				});
				expect(Object.isFrozen(first)).toBe(true);
				const second = yield* Effect.provide(program, backend);
				expect(second).toHaveLength(2);
			}),
		);

		it.effect(
			"is reachable under a service's layer with a second provide",
			() =>
				Effect.gen(function* () {
					class Api extends Fetch.Service<Api>()("test/fetch-test/Api", {
						baseUrl: base,
					}) {}
					const backend = FetchTest.layer([
						FetchTest.respond(deleteTodo, () => Effect.void),
					]);
					const sent = yield* Effect.gen(function* () {
						const api = yield* Api;
						yield* api.bind(deleteTodo)({ params: { id: 7 } });
						return yield* FetchTest.requests;
					}).pipe(
						Effect.provide(Api.layer.pipe(Layer.provideMerge(backend))),
					);
					expect(sent.map((request) => request.url)).toEqual([
						"https://api.test/todos/7",
					]);
				}),
		);

		it.effect("reads bodies by their content type", () =>
			Effect.gen(function* () {
				const upload = Fetch.endpoint("POST /upload");
				const backend = FetchTest.layer([
					FetchTest.respond(upload, () => Effect.void),
				]);
				const form = new FormData();
				form.set("a", "1");
				const sent = yield* Effect.gen(function* () {
					const api = yield* Fetch.make({ baseUrl: base });
					const send = api.bind(upload);
					yield* send({ body: "text" });
					yield* send({ body: new Uint8Array([1]) });
					yield* send({ body: new URLSearchParams({ a: "1" }) });
					yield* send({ body: form });
					yield* send();
					return yield* FetchTest.requests;
				}).pipe(Effect.provide(backend));
				expect(sent.map((request) => request.body)).toEqual([
					"text",
					new Uint8Array([1]),
					"a=1",
					form,
					undefined,
				]);
			}),
		);
	});

	describe("services", () => {
		class Clock extends Context.Service<Clock, { readonly now: Date }>()(
			"test/fetch-test/Clock",
		) {}

		it.effect(
			"runs handlers with the services the layer was built with",
			() =>
				Effect.gen(function* () {
					const backend = FetchTest.layer([
						FetchTest.respond(getTodo, () =>
							Effect.map(Effect.service(Clock), ({ now }) => ({
								id: 1,
								title: "x",
								due: now,
							})),
						),
					]);
					const todo = yield* run(
						(api) => api.bind(getTodo)({ params: { id: 1 } }),
						backend.pipe(
							Layer.provide(Layer.succeed(Clock)({ now: due })),
						),
					);
					expect(todo.due).toEqual(due);
				}),
		);
	});

	describe("with Fetch.Service and Fetch.Endpoints", () => {
		class Api extends Fetch.Service<Api>()("test/fetch-test/Endpoints/Api", {
			baseUrl: "https://api.test/v1",
			statusErrors: { 401: SessionExpired },
			plugins: [retry({ times: 2 }), timeout({ duration: "5 seconds" })],
		}) {}

		class TodoApi extends Fetch.Endpoints<TodoApi>()(
			"test/fetch-test/TodoApi",
			Api,
			{ get: getTodo, create: createTodo, list: listTodos },
		) {}

		const provide = (
			backend: Layer.Layer<
				import("effect/http/HttpClient").HttpClient | FetchTest.Recorder
			>,
		) =>
			Effect.provide(
				TodoApi.layer.pipe(
					Layer.provide(Api.layer),
					Layer.provide(backend),
				),
			);

		it.effect("answers a module's endpoints", () =>
			Effect.gen(function* () {
				const backend = FetchTest.layer([
					FetchTest.respond(TodoApi.definitions.get, ({ params }) =>
						Effect.succeed({
							id: Number(params.id),
							title: "Write docs",
							due,
						}),
					),
					FetchTest.respond(TodoApi.definitions.create, ({ body }) =>
						Effect.succeed({ id: 2, ...body }),
					),
					FetchTest.fail(TodoApi.definitions.list, 401, {
						message: "Expired",
					}),
				]);
				const [todo, created, expired] = yield* Effect.gen(function* () {
					const todos = yield* TodoApi;
					return yield* Effect.all([
						todos.get({ params: { id: 1 } }),
						todos.create({ body: { title: "New", due } }),
						Effect.flip(todos.list()),
					]);
				}).pipe(provide(backend));
				expect(todo).toEqual({ id: 1, title: "Write docs", due });
				expect(created).toEqual({ id: 2, title: "New", due });
				expect(expired).toBeInstanceOf(SessionExpired);
			}),
		);

		it.effect(
			"lets an unmatched request's defect through retry and timeout",
			() =>
				Effect.gen(function* () {
					const message = yield* defectOf(
						Effect.gen(function* () {
							const todos = yield* TodoApi;
							return yield* todos.list();
						}).pipe(provide(FetchTest.layer([]))),
					);
					expect(message).toContain(
						"FetchTest: no handler for GET https://api.test/v1/todos.",
					);
				}),
		);
	});

	describe("edge cases", () => {
		it.effect("sends every binary and form body a call can send", () =>
			Effect.gen(function* () {
				const raw = Fetch.endpoint("GET /raw/:kind");
				const foreign = runInNewContext(
					"new Uint8Array([4, 5])",
				) as Uint8Array;
				const bodies: Record<string, unknown> = {
					buffer: new Uint8Array([1, 2]).buffer,
					view: new DataView(new Uint8Array([3]).buffer),
					foreign,
					blob: new Blob(["hi"], { type: "text/csv" }),
					form: new URLSearchParams({ a: "1", b: "x y" }),
				};
				const backend = FetchTest.layer([
					FetchTest.respond(raw, ({ params }) =>
						Effect.succeed(FetchTest.reply(200, bodies[params.kind])),
					),
				]);
				const read = (kind: string) =>
					run(
						(api) =>
							Effect.flatMap(
								api.bind(raw)({ params: { kind } }),
								(response) =>
									Effect.map(response.arrayBuffer, (buffer) => ({
										type: response.headers["content-type"],
										bytes: [...new Uint8Array(buffer)],
									})),
							),
						backend,
					);
				expect(yield* read("buffer")).toEqual({
					type: "application/octet-stream",
					bytes: [1, 2],
				});
				expect(yield* read("view")).toEqual({
					type: "application/octet-stream",
					bytes: [3],
				});
				expect(yield* read("foreign")).toEqual({
					type: "application/octet-stream",
					bytes: [4, 5],
				});
				expect(yield* read("blob")).toEqual({
					type: "text/csv",
					bytes: [104, 105],
				});
				const form = yield* read("form");
				expect(form.type).toBe("application/x-www-form-urlencoded");
				expect(new TextDecoder().decode(new Uint8Array(form.bytes))).toBe(
					"a=1&b=x+y",
				);
			}),
		);

		it.effect("repairs lists in union and record query schemas", () =>
			Effect.gen(function* () {
				const ByKind = Schema.Union([
					Schema.Struct({
						kind: Schema.Literal("tagged"),
						tags: Schema.Array(Schema.String),
					}),
					Schema.Struct({ kind: Schema.Literal("plain") }),
				]);
				const Tags = Schema.Record(
					Schema.String,
					Schema.Array(Schema.String),
				);
				const byKind = Fetch.endpoint("GET /by-kind", { query: ByKind });
				const tags = Fetch.endpoint("GET /tags", { query: Tags });
				const seen: Array<unknown> = [];
				const backend = FetchTest.layer([
					FetchTest.respond(byKind, ({ query }) => {
						seen.push(query);
						return Effect.succeed(FetchTest.reply(204));
					}),
					FetchTest.respond(tags, ({ query }) => {
						seen.push(query);
						return Effect.succeed(FetchTest.reply(204));
					}),
				]);
				yield* run(
					(api) =>
						Effect.all([
							api.bind(byKind)({
								query: { kind: "tagged", tags: ["a"] },
							}),
							api.bind(byKind)({ query: { kind: "plain" } }),
							api.bind(tags)({ query: { a: ["x"], b: ["y", "z"] } }),
						]),
					backend,
				);
				expect(seen).toEqual([
					{ kind: "tagged", tags: ["a"] },
					{ kind: "plain" },
					{ a: ["x"], b: ["y", "z"] },
				]);
			}),
		);

		it.effect(
			"tries a single value as a list when a union member takes one",
			() =>
				Effect.gen(function* () {
					const ByKind = Schema.Union([
						Schema.Struct({
							kind: Schema.Literal("many"),
							ids: Schema.Array(Schema.Finite),
						}),
						Schema.Struct({
							kind: Schema.Literal("one"),
							ids: Schema.Finite,
						}),
					]);
					const byKind = Fetch.endpoint("GET /by-kind", { query: ByKind });
					const seen: Array<unknown> = [];
					const backend = FetchTest.layer([
						FetchTest.respond(byKind, ({ query }) => {
							seen.push(query);
							return Effect.succeed(FetchTest.reply(204));
						}),
					]);
					yield* run(
						(api) =>
							Effect.all([
								api.bind(byKind)({ query: { kind: "many", ids: [1] } }),
								api.bind(byKind)({ query: { kind: "one", ids: 2 } }),
								api.bind(byKind)({
									query: { kind: "many", ids: [3, 4] },
								}),
							]),
						backend,
					);
					expect(seen).toEqual([
						{ kind: "many", ids: [1] },
						{ kind: "one", ids: 2 },
						{ kind: "many", ids: [3, 4] },
					]);
				}),
		);

		it.effect("matches the root route on the root path alone", () =>
			Effect.gen(function* () {
				const root = Fetch.endpoint("GET /", { output: Fetch.text() });
				const backend = FetchTest.layer([
					FetchTest.respond(root, () => Effect.succeed("root")),
				]);
				expect(yield* run((api) => api.bind(root)(), backend)).toBe("root");
				const message = yield* defectOf(
					run((api) => api.get("/anything/else/"), backend),
				);
				expect(message).toContain(
					"FetchTest: no handler for GET https://api.test/anything/else/",
				);
			}),
		);

		it.effect("normalizes the baseUrl option and absolute routes", () =>
			Effect.gen(function* () {
				const upload = Fetch.endpoint(
					"POST https://Uploads.test:443/files",
				);
				const backend = FetchTest.layer(
					[
						FetchTest.respond(deleteTodo, () => Effect.void),
						FetchTest.respond(upload, () => Effect.void),
					],
					{ baseUrl: "https://API.test:443/a/../v1" },
				);
				const removed = yield* run(
					(api) => api.bind(deleteTodo)({ params: { id: 1 } }),
					backend,
					"https://api.test/v1",
				);
				expect(removed.status).toBe(204);
				const uploaded = yield* run((api) => api.bind(upload)(), backend);
				expect(uploaded.status).toBe(204);
			}),
		);

		it.effect(
			"takes a relative baseUrl option, with or without a slash",
			() =>
				Effect.gen(function* () {
					for (const baseUrl of ["api/v1", "/api/v1/", "api/v1/"]) {
						const backend = FetchTest.layer(
							[FetchTest.respond(deleteTodo, () => Effect.void)],
							{ baseUrl },
						);
						const response = yield* run(
							(api) => api.bind(deleteTodo)({ params: { id: 1 } }),
							backend,
							"https://api.test/api/v1",
						);
						expect(response.status).toBe(204);
					}
				}),
		);

		it.effect("reads a body by the request's content-type header", () =>
			Effect.gen(function* () {
				const upload = Fetch.endpoint("POST /upload");
				const backend = FetchTest.layer([
					FetchTest.respond(upload, ({ body }) =>
						Effect.succeed({ body }),
					),
				]);
				const sent = yield* Effect.gen(function* () {
					const api = yield* Fetch.make({ baseUrl: base });
					const send = api.bind(upload);
					yield* send({
						body: JSON.stringify({ a: 1 }),
						headers: { "content-type": "application/json" },
					});
					yield* send({
						body: new TextEncoder().encode("plain"),
						headers: { "content-type": "text/plain" },
					});
					return yield* FetchTest.requests;
				}).pipe(Effect.provide(backend));
				expect(sent.map((request) => request.body)).toEqual([
					{ a: 1 },
					"plain",
				]);
			}),
		);

		it.effect("lets the call's services win over the layer's", () =>
			Effect.gen(function* () {
				class Clock extends Context.Service<
					Clock,
					{ readonly now: Date }
				>()("test/fetch-test/edge/Clock") {}
				const later = new Date(Date.UTC(2027, 0, 1));
				const backend = FetchTest.layer([
					FetchTest.respond(getTodo, () =>
						Effect.map(Effect.service(Clock), ({ now }) => ({
							id: 1,
							title: "x",
							due: now,
						})),
					),
				]).pipe(Layer.provide(Layer.succeed(Clock)({ now: due })));
				const [fromLayer, fromCall] = yield* run(
					(api) =>
						Effect.all([
							api.bind(getTodo)({ params: { id: 1 } }),
							api
								.bind(getTodo)({ params: { id: 1 } })
								.pipe(Effect.provideService(Clock, { now: later })),
						]),
					backend,
				);
				expect(fromLayer.due).toEqual(due);
				expect(fromCall.due).toEqual(later);
			}),
		);

		it.effect("keeps __proto__ keys in query and params", () =>
			Effect.gen(function* () {
				const proto = Fetch.endpoint("GET /p/:__proto__");
				const backend = FetchTest.layer([
					FetchTest.respond(proto, ({ params, query }) =>
						Effect.succeed({
							param: Object.hasOwn(params, "__proto__"),
							query: Object.hasOwn(query, "__proto__"),
						}),
					),
				]);
				const response = yield* run(
					(api) =>
						api.bind(proto)({
							params: { ["__proto__"]: "v" },
							query: { ["__proto__"]: "x", a: "1" },
						}),
					backend,
				);
				expect(yield* response.json).toEqual({ param: true, query: true });
			}),
		);

		it.effect(
			"dies with a FetchTest message on a body with no JSON form",
			() =>
				Effect.gen(function* () {
					const loose = Fetch.endpoint("GET /loose", {
						error: Schema.Any,
					});
					const backend = FetchTest.layer([
						FetchTest.fail(loose, 500, 10n),
					]);
					const message = yield* defectOf(
						run((api) => api.bind(loose)(), backend),
					);
					expect(message).toContain(
						"FetchTest: the 500 body for GET /loose can't be sent as JSON",
					);
				}),
		);
	});

	describe("layer", () => {
		it("checks its handlers", () => {
			expect(() => FetchTest.layer({} as never)).toThrow(
				"FetchTest.layer takes a list of handlers",
			);
			expect(() => FetchTest.layer([getTodo as never])).toThrow(
				"FetchTest.layer: handler 0 isn't one: pass what FetchTest.respond or FetchTest.fail returns",
			);
		});
	});
});
