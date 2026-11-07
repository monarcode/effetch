import { it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

import { describe, expect } from "vitest";

import * as Fetch from "../src/index.js";
import { retry } from "../src/plugins/index.js";
import { setup } from "./utils/client.js";
import { after } from "./utils/clock.js";
import { reply } from "./utils/reply.js";

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
	message: Schema.String,
}) {}

class InvalidRole extends Schema.TaggedError<InvalidRole>()("InvalidRole", {
	code: Schema.Literal("INVALID_ROLE"),
	message: Schema.String,
}) {}

class RoleTaken extends Schema.TaggedError<RoleTaken>()("RoleTaken", {
	code: Schema.Literal("ROLE_TAKEN"),
	message: Schema.String,
	takenBy: Schema.Finite,
}) {}

class SessionExpired extends Schema.TaggedError<SessionExpired>()(
	"SessionExpired",
	{ message: Schema.String },
) {}

/** Three errors that all match `{ message }`, to see which one wins. */
class CallConflict extends Schema.TaggedError<CallConflict>()("CallConflict", {
	message: Schema.String,
}) {}
class EndpointConflict extends Schema.TaggedError<EndpointConflict>()(
	"EndpointConflict",
	{ message: Schema.String },
) {}
class ClientConflict extends Schema.TaggedError<ClientConflict>()(
	"ClientConflict",
	{ message: Schema.String },
) {}

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const ApiError = Schema.Struct({ code: Schema.String });

const roleErrors = { 400: [InvalidRole, RoleTaken] } as const;

describe("a status with one schema", () => {
	it.effect("fails the call with the decoded error", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.json({ message: "No todo 1" }, { status: 404 }),
			]);
			const error = yield* Effect.flip(
				api.get("/todos/:id", {
					params: { id: 1 },
					output: Todo,
					statusErrors: { 404: TodoNotFound },
				}),
			);
			expect(error).toBeInstanceOf(TodoNotFound);
			expect(error).toMatchObject({
				_tag: "TodoNotFound",
				message: "No todo 1",
			});
		}),
	);

	it.effect("can be caught by its tag", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.json({ message: "No todo 1" }, { status: 404 }),
			]);
			const todo = yield* api
				.get("/todos/:id", {
					params: { id: 1 },
					output: Todo,
					statusErrors: { 404: TodoNotFound },
				})
				.pipe(
					Effect.catchTag("TodoNotFound", (error) =>
						Effect.succeed(error.message),
					),
				);
			expect(todo).toBe("No todo 1");
		}),
	);
});

describe("a status with several schemas", () => {
	it.effect.each([
		[
			{ code: "INVALID_ROLE", message: "No such role" },
			InvalidRole,
			{ _tag: "InvalidRole", code: "INVALID_ROLE", message: "No such role" },
		],
		[
			{ code: "ROLE_TAKEN", message: "Taken", takenBy: 7 },
			RoleTaken,
			{
				_tag: "RoleTaken",
				code: "ROLE_TAKEN",
				message: "Taken",
				takenBy: 7,
			},
		],
	] as const)(
		"picks the one whose literal matches: %j",
		([body, Class, expected]) =>
			Effect.gen(function* () {
				const { api } = yield* setup([reply.json(body, { status: 400 })]);
				const error = yield* Effect.flip(
					api.post("/users/1/roles", {
						body: { role: "owner" },
						statusErrors: roleErrors,
					}),
				);
				expect(error).toBeInstanceOf(Class);
				expect(error).toMatchObject(expected);
			}),
	);
});

describe("a response no schema decodes", () => {
	it.effect("fails with an HttpError, its body decoded with error", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.json({ code: "MISSING_FIELD" }, { status: 400 }),
			]);
			const error = yield* Effect.flip(
				api.post("/users/1/roles", {
					body: {},
					error: ApiError,
					statusErrors: roleErrors,
				}),
			);
			expect(error).toBeInstanceOf(Fetch.HttpError);
			expect(error).toMatchObject({
				status: 400,
				body: { code: "MISSING_FIELD" },
			});
		}),
	);

	it.effect.each([
		["an empty body", reply.empty(400), ""],
		[
			"a body that isn't JSON",
			reply.text("Bad Request", { status: 400 }),
			"Bad Request",
		],
		[
			"a JSON array",
			reply.json([{ code: "INVALID_ROLE" }], { status: 400 }),
			'[{"code":"INVALID_ROLE"}]',
		],
	] as const)("fails with an HttpError for %s", ([, next, text]) =>
		Effect.gen(function* () {
			const { api } = yield* setup([next]);
			const error = yield* Effect.flip(
				api.post("/users/1/roles", { body: {}, statusErrors: roleErrors }),
			);
			expect(error).toBeInstanceOf(Fetch.HttpError);
			expect(error).toMatchObject({ status: 400, text });
		}),
	);

	it.effect("fails with an HttpError for a status that isn't listed", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.json({ code: "INVALID_ROLE", message: "x" }, { status: 500 }),
			]);
			const error = yield* Effect.flip(
				api.post("/users/1/roles", { body: {}, statusErrors: roleErrors }),
			);
			expect(error).toBeInstanceOf(Fetch.HttpError);
		}),
	);

	it.effect("never applies to a 2xx", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.json({ id: 1, title: "Write docs" }),
			]);
			const todo = yield* api.get("/todos/1", {
				output: Todo,
				statusErrors: { 200: TodoNotFound },
			});
			expect(todo).toEqual({ id: 1, title: "Write docs" });
		}),
	);
});

describe("the _tag", () => {
	it.effect("is added when the schema has a literal one", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.json({ message: "gone" }, { status: 404 }),
			]);
			const error = yield* Effect.flip(
				api.get("/x", { statusErrors: { 404: TodoNotFound } }),
			);
			expect(error).toMatchObject({ _tag: "TodoNotFound" });
		}),
	);

	it.effect("is left alone when the body has its own", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.json({ _tag: "Other", message: "gone" }, { status: 404 }),
			]);
			const error = yield* Effect.flip(
				api.get("/x", { statusErrors: { 404: TodoNotFound } }),
			);
			expect(error).toBeInstanceOf(Fetch.HttpError);
		}),
	);

	it.effect("isn't added to a body that isn't an object", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([reply.json("gone", { status: 404 })]);
			const error = yield* Effect.flip(
				api.get("/x", { statusErrors: { 404: TodoNotFound } }),
			);
			expect(error).toBeInstanceOf(Fetch.HttpError);
			expect(error).toMatchObject({ body: "gone" });
		}),
	);

	it.effect(
		"isn't added for a Schema.Union: its members are listed instead",
		() =>
			Effect.gen(function* () {
				const { api } = yield* setup([
					reply.json(
						{ code: "ROLE_TAKEN", message: "x", takenBy: 1 },
						{ status: 400 },
					),
				]);
				const asUnion = yield* Effect.flip(
					api.get("/x", {
						statusErrors: { 400: Schema.Union([InvalidRole, RoleTaken]) },
					}),
				);
				expect(asUnion).toBeInstanceOf(Fetch.HttpError);
				const asList = yield* Effect.flip(
					api.get("/x", {
						statusErrors: { 400: [InvalidRole, RoleTaken] },
					}),
				);
				expect(asList).toBeInstanceOf(RoleTaken);
			}),
	);

	it.effect("isn't needed by a schema without one", () =>
		Effect.gen(function* () {
			const Problem = Schema.Struct({ title: Schema.String });
			const { api } = yield* setup([
				reply.json({ title: "Conflict" }, { status: 409 }),
			]);
			const error = yield* Effect.flip(
				api.get("/x", { statusErrors: { 409: Problem } }),
			);
			expect(error).toEqual({ title: "Conflict" });
		}),
	);

	it.effect("is added through Schema.encodeKeys", () =>
		Effect.gen(function* () {
			const Renamed = InvalidRole.pipe(
				Schema.encodeKeys({ code: "error_code" }),
			);
			const { api } = yield* setup([
				reply.json(
					{ error_code: "INVALID_ROLE", message: "No such role" },
					{ status: 400 },
				),
			]);
			const error = yield* Effect.flip(
				api.get("/x", { statusErrors: { 400: Renamed } }),
			);
			expect(error).toBeInstanceOf(InvalidRole);
			expect(error).toMatchObject({ code: "INVALID_ROLE" });
		}),
	);
});

describe("the order of the maps", () => {
	const conflict = () => [reply.json({ message: "x" }, { status: 409 })];

	it.effect("tries the call's before the client's", () =>
		Effect.gen(function* () {
			const { api } = yield* setup(conflict(), {
				statusErrors: { 409: ClientConflict },
			});
			const error = yield* Effect.flip(
				api.get("/x", { statusErrors: { 409: CallConflict } }),
			);
			expect(error).toBeInstanceOf(CallConflict);
		}),
	);

	it.effect("tries the endpoint's before the client's", () =>
		Effect.gen(function* () {
			const { api } = yield* setup(conflict(), {
				statusErrors: { 409: ClientConflict },
			});
			const endpoint = api.endpoint("GET /x", {
				statusErrors: { 409: EndpointConflict },
			});
			const error = yield* Effect.flip(endpoint());
			expect(error).toBeInstanceOf(EndpointConflict);
		}),
	);

	it.effect("tries the client's when the endpoint's don't match", () =>
		Effect.gen(function* () {
			const { api } = yield* setup(conflict(), {
				statusErrors: { 409: ClientConflict },
			});
			const endpoint = api.endpoint("GET /x", {
				statusErrors: { 409: RoleTaken },
			});
			const error = yield* Effect.flip(endpoint());
			expect(error).toBeInstanceOf(ClientConflict);
		}),
	);

	it.effect("uses the client's for a status the endpoint doesn't list", () =>
		Effect.gen(function* () {
			const { api } = yield* setup(
				[reply.json({ message: "expired" }, { status: 401 })],
				{ statusErrors: { 401: SessionExpired } },
			);
			const getTodo = api.endpoint("GET /todos/:id", {
				output: Todo,
				statusErrors: { 404: TodoNotFound },
			});
			const error = yield* Effect.flip(getTodo({ params: { id: 1 } }));
			expect(error).toBeInstanceOf(SessionExpired);
		}),
	);

	it.effect("binds a definition's before the client's", () =>
		Effect.gen(function* () {
			const { api } = yield* setup(
				[
					reply.json({ message: "x" }, { status: 409 }),
					reply.json({ message: "expired" }, { status: 401 }),
				],
				{ statusErrors: { 401: SessionExpired, 409: ClientConflict } },
			);
			const getX = api.bind(
				Fetch.endpoint("GET /x", {
					statusErrors: { 409: EndpointConflict },
				}),
			);
			expect(yield* Effect.flip(getX())).toBeInstanceOf(EndpointConflict);
			expect(yield* Effect.flip(getX())).toBeInstanceOf(SessionExpired);
		}),
	);
});

describe("endpoints", () => {
	it.effect("expose their map joined with the client's", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([], {
				statusErrors: { 401: SessionExpired, 409: ClientConflict },
			});
			const endpoint = api.endpoint("GET /x", {
				statusErrors: {
					409: [EndpointConflict, ClientConflict],
					404: TodoNotFound,
				},
			});
			expect(endpoint.statusErrors).toEqual({
				401: [SessionExpired],
				404: [TodoNotFound],
				409: [EndpointConflict, ClientConflict],
			});
			expect(Object.isFrozen(endpoint.statusErrors)).toBe(true);
			expect(api.endpoint("GET /y").statusErrors).toEqual({
				401: [SessionExpired],
				409: [ClientConflict],
			});
		}),
	);

	it.effect("are made by a client that exposes its map", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([], {
				statusErrors: { 401: SessionExpired },
			});
			expect(api.statusErrors).toEqual({ 401: SessionExpired });
			expect(Object.isFrozen(api.statusErrors)).toBe(true);
			const { api: plain } = yield* setup([]);
			expect(plain.statusErrors).toBeUndefined();
		}),
	);

	it.effect("have an empty map when neither has one", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([]);
			expect(api.endpoint("GET /x").statusErrors).toEqual({});
		}),
	);

	it("defined without a client expose a frozen copy of their map", () => {
		const statusErrors = { 404: TodoNotFound, 400: [InvalidRole, RoleTaken] };
		const definition = Fetch.endpoint("GET /x", { statusErrors });
		expect(definition.statusErrors).toEqual(statusErrors);
		expect(definition.statusErrors).not.toBe(statusErrors);
		expect(Object.isFrozen(definition.statusErrors)).toBe(true);
		expect(Object.isFrozen(definition.statusErrors?.[400])).toBe(true);
		expect(Fetch.endpoint("GET /x").statusErrors).toBeUndefined();
	});

	it.effect("leave out keys that aren't statuses", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([]);
			const endpoint = api.endpoint("GET /x", {
				statusErrors: { 404: TodoNotFound, notFound: TodoNotFound },
			});
			expect(endpoint.statusErrors).toEqual({ 404: [TodoNotFound] });
		}),
	);

	it.effect(
		"keep the maps they were given, whatever happens to them later",
		() =>
			Effect.gen(function* () {
				const clientMap: Record<number, typeof ClientConflict> = {};
				const endpointMap: Record<number, typeof EndpointConflict> = {};
				const { api } = yield* setup(
					[reply.json({ message: "x" }, { status: 409 })],
					{ statusErrors: clientMap },
				);
				const endpoint = api.endpoint("GET /x", {
					statusErrors: endpointMap,
				});
				const definition = Fetch.endpoint("GET /x", {
					statusErrors: endpointMap,
				});
				clientMap[409] = ClientConflict;
				endpointMap[409] = EndpointConflict;
				expect(api.statusErrors).toEqual({});
				expect(endpoint.statusErrors).toEqual({});
				expect(definition.statusErrors).toEqual({});
				expect(yield* Effect.flip(endpoint())).toBeInstanceOf(
					Fetch.HttpError,
				);
			}),
	);
});

describe("decoding", () => {
	class Locale extends Context.Service<Locale, { readonly tag: string }>()(
		"Locale",
	) {}
	class Localized extends Schema.TaggedError<Localized>()("Localized", {
		message: Schema.String.pipe(
			Schema.decode({
				decode: SchemaGetter.transformEffect((s: string) =>
					Effect.map(Effect.service(Locale), (l) => `${l.tag}:${s}`),
				),
				encode: SchemaGetter.passthrough(),
			}),
		),
	}) {}

	it.effect("runs with the services the schema needs", () =>
		Effect.gen(function* () {
			const { api } = yield* setup([
				reply.json({ message: "gone" }, { status: 404 }),
			]);
			const error = yield* Effect.flip(
				api.get("/x", { statusErrors: { 404: Localized } }),
			).pipe(Effect.provideService(Locale, { tag: "fr" }));
			expect(error).toMatchObject({ _tag: "Localized", message: "fr:gone" });
		}),
	);

	it.effect("dies when the schema dies", () =>
		Effect.gen(function* () {
			const Broken = Schema.String.pipe(
				Schema.decode({
					decode: SchemaGetter.transform(() => {
						throw new Error("broken");
					}),
					encode: SchemaGetter.passthrough(),
				}),
			);
			const { api } = yield* setup([reply.json("x", { status: 404 })]);
			const exit = yield* Effect.exit(
				api.get("/x", { statusErrors: { 404: Broken } }),
			);
			expect(Exit.hasDies(exit)).toBe(true);
		}),
	);
});

describe("plugins", () => {
	it.effect(
		"see the raw response in onResponse, then the error in onError",
		() =>
			Effect.gen(function* () {
				const seen: Array<unknown> = [];
				const observer = Fetch.plugin({
					name: "observer",
					onResponse: (response) =>
						Effect.sync(() => {
							seen.push(response.status);
							return response;
						}),
					onError: (error) => Effect.sync(() => seen.push(error)),
				});
				const { api } = yield* setup(
					[reply.json({ message: "gone" }, { status: 404 })],
					{ plugins: [observer] },
				);
				const error = yield* Effect.flip(
					api.get("/x", { statusErrors: { 404: TodoNotFound } }),
				);
				expect(error).toBeInstanceOf(TodoNotFound);
				expect(seen).toEqual([404, error]);
			}),
	);

	it.effect("retry still retries by status", () =>
		Effect.gen(function* () {
			const Unavailable = Schema.Struct({ message: Schema.String });
			const { mock, api } = yield* setup(
				[reply.json({ message: "busy" }, { status: 503 })],
				{
					plugins: [retry({ schedule: Schedule.spaced("1 second") })],
					statusErrors: { 503: Unavailable },
				},
			);
			const error = yield* after(Effect.flip(api.get("/x")), "1 minute");
			expect(error).toEqual({ message: "busy" });
			expect(mock.requests).toHaveLength(3);
		}),
	);

	it.effect("leave httpClient raw", () =>
		Effect.gen(function* () {
			const { api } = yield* setup(
				[reply.json({ message: "gone" }, { status: 404 })],
				{ statusErrors: { 404: TodoNotFound } },
			);
			const response = yield* api.httpClient.get("/x");
			expect(response.status).toBe(404);
		}),
	);
});
