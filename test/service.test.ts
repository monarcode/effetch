import { it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import * as Fetch from "../src/index.js";
import { base, wire } from "./utils/client.js";
import { makeMockClient } from "./utils/mockClient.js";
import { reply } from "./utils/reply.js";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const ApiError = Schema.Struct({ code: Schema.String });

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
	message: Schema.String,
}) {}

class Api extends Fetch.Service<Api>()("test/Api", {
	baseUrl: base,
	headers: { "x-app": "effetch" },
	defaultError: ApiError,
	statusErrors: { 404: TodoNotFound },
}) {}

describe("Fetch.Service", () => {
	it.effect("yields a working client through its layer", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([reply.json({ id: 1, title: "Write" })]);
			const todo = yield* Effect.gen(function* () {
				const api = yield* Api;
				return yield* api.get("/todos/1", { output: Todo });
			}).pipe(Effect.provide(Api.layer.pipe(Layer.provide(mock.layer))));
			expect(todo).toEqual({ id: 1, title: "Write" });
			expect(wire(mock).url).toBe(`${base}/todos/1`);
			expect(wire(mock).headers["x-app"]).toBe("effetch");
		}),
	);

	it.effect("builds the client from its config", () =>
		Effect.gen(function* () {
			const mock = makeMockClient([
				reply.json({ message: "No todo 1" }, { status: 404 }),
				reply.json({ code: "E_DOWN" }, { status: 500 }),
			]);
			const [notFound, failed] = yield* Effect.gen(function* () {
				const api = yield* Api;
				const notFound = yield* Effect.flip(api.get("/todos/1"));
				const failed = yield* Effect.flip(api.get("/todos"));
				return [notFound, failed] as const;
			}).pipe(Effect.provide(Api.layer.pipe(Layer.provide(mock.layer))));
			expect(notFound).toBeInstanceOf(TodoNotFound);
			expect(failed).toMatchObject({
				_tag: "HttpError",
				status: 500,
				body: { code: "E_DOWN" },
			});
		}),
	);

	it("is a Context.Service key with the given id", () => {
		expect(Api.key).toBe("test/Api");
		const client = { statusErrors: undefined } as unknown as Effect.Success<
			typeof Api
		>;
		const context = Context.make(Api, client);
		expect(Context.get(context, Api)).toBe(client);
	});

	describe("config", () => {
		it("holds what was given", () => {
			expect(Api.config.baseUrl).toBe(base);
			expect(Api.config.defaultError).toBe(ApiError);
			expect(Api.config.statusErrors).toEqual({ 404: TodoNotFound });
			expect(Headers.isHeaders(Api.config.headers)).toBe(true);
			expect({ ...Api.config.headers }).toEqual({ "x-app": "effetch" });
		});

		it("reads headers the way make does, and keeps them redacted", () => {
			class Read extends Fetch.Service<Read>()("test/Read", {
				headers: { Accept: ["a", "b"], Authorization: "Bearer secret" },
			}) {}
			expect({ ...Read.config.headers }).toEqual({
				accept: "a, b",
				authorization: "Bearer secret",
			});
			expect(JSON.stringify(Read.config)).not.toContain("secret");

			class Entries extends Fetch.Service<Entries>()("test/Entries", {
				headers: new Map([["X-App", "effetch"]]),
			}) {}
			expect({ ...Entries.config.headers }).toEqual({ "x-app": "effetch" });
		});

		it("is frozen, down to its statusErrors, plugins and headers", () => {
			const plugin = Fetch.plugin({
				name: "p",
				onRequest: (request) => Effect.succeed(request),
			});
			class Frozen extends Fetch.Service<Frozen>()("test/Frozen", {
				headers: { accept: ["a", "b"] },
				statusErrors: { 404: [TodoNotFound] },
				plugins: [plugin],
			}) {}
			expect(Object.isFrozen(Frozen.config)).toBe(true);
			expect(Object.isFrozen(Frozen.config.statusErrors)).toBe(true);
			expect(Object.isFrozen(Frozen.config.statusErrors?.[404])).toBe(true);
			expect(Object.isFrozen(Frozen.config.plugins)).toBe(true);
			expect(Object.isFrozen(Frozen.config.headers)).toBe(true);
		});

		it("leaves out options that weren't given", () => {
			class Bare extends Fetch.Service<Bare>()("test/Bare") {}
			expect(Bare.config).toEqual({});
			expect(Object.isFrozen(Bare.config)).toBe(true);
		});

		it.effect("is a copy: changing what was passed changes nothing", () =>
			Effect.gen(function* () {
				const statusErrors: { [status: number]: typeof TodoNotFound } = {
					404: TodoNotFound,
				};
				const headers: Record<string, string> = { "x-app": "effetch" };
				const tag = Fetch.plugin({
					name: "tag",
					onRequest: (request) =>
						Effect.succeed(
							HttpClientRequest.setHeader(request, "x-tag", "1"),
						),
				});
				const tagged: Array<typeof tag> = [];
				const config = {
					baseUrl: base,
					headers,
					statusErrors,
					plugins: tagged,
				};
				class Copied extends Fetch.Service<Copied>()(
					"test/Copied",
					config,
				) {}

				statusErrors[500] = TodoNotFound;
				headers["x-app"] = "changed";
				headers["x-extra"] = "1";
				tagged.push(tag);
				config.baseUrl = "https://changed.test";

				expect(Copied.config.statusErrors).toEqual({ 404: TodoNotFound });
				expect({ ...Copied.config.headers }).toEqual({
					"x-app": "effetch",
				});
				expect(Copied.config.plugins).toEqual([]);
				expect(Copied.config.baseUrl).toBe(base);

				const mock = makeMockClient([reply.json({}, { status: 500 })]);
				const error = yield* Effect.gen(function* () {
					const api = yield* Copied;
					return yield* Effect.flip(api.get("/x"));
				}).pipe(
					Effect.provide(Copied.layer.pipe(Layer.provide(mock.layer))),
				);
				expect(error).toMatchObject({ _tag: "HttpError", status: 500 });
				expect(wire(mock).url).toBe(`${base}/x`);
				expect(wire(mock).headers["x-app"]).toBe("effetch");
				expect(wire(mock).headers["x-extra"]).toBeUndefined();
				expect(wire(mock).headers["x-tag"]).toBeUndefined();
			}),
		);
	});

	describe("layer", () => {
		it.effect("builds one client for every layer that depends on it", () =>
			Effect.gen(function* () {
				let built = 0;
				class Counted extends Fetch.Service<Counted>()("test/Counted", {
					baseUrl: Effect.sync(() => {
						built += 1;
						return base;
					}),
				}) {}
				class A extends Context.Service<A, unknown>()("test/A") {}
				class B extends Context.Service<B, unknown>()("test/B") {}
				const layerA = Layer.effect(A)(Counted);
				const layerB = Layer.effect(B)(Counted);
				const mock = makeMockClient([]);

				// One `provide` for both.
				const [a, b] = yield* Effect.all([A, B]).pipe(
					Effect.provide(
						Layer.mergeAll(layerA, layerB).pipe(
							Layer.provide(Counted.layer),
							Layer.provide(mock.layer),
						),
					),
				);
				expect(a).toBe(b);
				expect(built).toBe(1);

				// One `provide` each, in the same graph.
				built = 0;
				const [c, d] = yield* Effect.all([A, B]).pipe(
					Effect.provide(
						Layer.mergeAll(
							layerA.pipe(Layer.provide(Counted.layer)),
							layerB.pipe(Layer.provide(Counted.layer)),
						).pipe(Layer.provide(mock.layer)),
					),
				);
				expect(c).toBe(d);
				expect(built).toBe(1);
			}),
		);

		it.effect("fails with the baseUrl Effect's error", () =>
			Effect.gen(function* () {
				class Missing extends Data.TaggedError("Missing")<{}> {}
				class Failing extends Fetch.Service<Failing>()("test/Failing", {
					baseUrl: Effect.fail(new Missing()),
				}) {}
				const mock = makeMockClient([]);
				const exit = yield* Effect.exit(
					Failing.pipe(
						Effect.provide(Failing.layer.pipe(Layer.provide(mock.layer))),
					),
				);
				expect(exit).toStrictEqual(Exit.fail(new Missing()));
			}),
		);

		it.effect("gives plugins the services the layer was given", () =>
			Effect.gen(function* () {
				class Token extends Context.Service<Token, string>()(
					"test/Token",
				) {}
				const auth = Fetch.plugin({
					name: "auth",
					onRequest: (request) =>
						Effect.map(Token, (token) =>
							HttpClientRequest.bearerToken(request, token),
						),
				});
				class Authed extends Fetch.Service<Authed>()("test/Authed", {
					baseUrl: base,
					plugins: [auth],
				}) {}
				const mock = makeMockClient([reply.json({})]);
				yield* Effect.gen(function* () {
					const api = yield* Authed;
					return yield* api.get("/me");
				}).pipe(
					Effect.provide(
						Authed.layer.pipe(
							Layer.provide(mock.layer),
							Layer.provide(Layer.succeed(Token)("secret")),
						),
					),
				);
				expect(wire(mock).headers["authorization"]).toBe("Bearer secret");
			}),
		);

		it.effect("turns tracing headers off when given the reference", () =>
			Effect.gen(function* () {
				const mock = makeMockClient([reply.json({}), reply.json({})]);
				const call = Effect.gen(function* () {
					const api = yield* Api;
					return yield* api.get("/x");
				});
				yield* call.pipe(
					Effect.provide(Api.layer.pipe(Layer.provide(mock.layer))),
				);
				yield* call.pipe(
					Effect.provide(
						Api.layer.pipe(
							Layer.provide(
								Layer.succeed(HttpClient.TracerPropagationEnabled)(
									false,
								),
							),
							Layer.provide(mock.layer),
						),
					),
				);
				expect(Object.keys(wire(mock, 0).headers)).toEqual(
					expect.arrayContaining(["traceparent", "b3"]),
				);
				expect(wire(mock, 1).headers["traceparent"]).toBeUndefined();
				expect(wire(mock, 1).headers["b3"]).toBeUndefined();
			}),
		);

		it.effect("can be overridden to provide its HttpClient", () =>
			Effect.gen(function* () {
				const mock = makeMockClient([reply.json({})]);
				class Provided extends Fetch.Service<Provided>()("test/Provided", {
					baseUrl: base,
				}) {
					static override readonly layer = super.layer.pipe(
						Layer.provide(mock.layer),
					);
				}
				yield* Effect.gen(function* () {
					const api = yield* Provided;
					return yield* api.get("/x");
				}).pipe(Effect.provide(Provided.layer));
				expect(wire(mock).url).toBe(`${base}/x`);
			}),
		);
	});

	describe("subclasses", () => {
		it.effect("inherit config and layer, and share the service", () =>
			Effect.gen(function* () {
				class Sub extends Api {}
				expect(Sub.config).toBe(Api.config);
				expect(Sub.layer).toBe(Api.layer);
				const mock = makeMockClient([]);
				const [fromApi, fromSub] = yield* Effect.all([Api, Sub]).pipe(
					Effect.provide(Api.layer.pipe(Layer.provide(mock.layer))),
				);
				expect(fromSub).toBe(fromApi);
			}),
		);
	});

	describe("isService", () => {
		class Plain extends Context.Service<Plain, string>()("test/Plain") {}
		class Sub extends Api {}

		it.each([
			["a service class", Api, true],
			["a subclass of one", Sub, true],
			["a Context.Service key", Plain, false],
			["a function key", Context.Service<string>("test/Fn"), false],
			["a plain object", { config: {}, layer: {} }, false],
			["a function", () => undefined, false],
			["undefined", undefined, false],
		] as const)("%s: %s", (_, value, expected) => {
			expect(Fetch.isService(value)).toBe(expected);
		});

		it.effect("is false for a client", () =>
			Effect.gen(function* () {
				const mock = makeMockClient([]);
				const client = yield* Api.pipe(
					Effect.provide(Api.layer.pipe(Layer.provide(mock.layer))),
				);
				expect(Fetch.isService(client)).toBe(false);
			}),
		);
	});
});
