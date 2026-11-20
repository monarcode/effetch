import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { describe, expect } from "vitest";

import * as Fetch from "../src/index.js";
import { encodeBody } from "../src/internal/body.js";
import { buildForm, fileFieldsOf } from "../src/internal/multipart.js";
import { FetchTest } from "../src/test/index.js";

const base = "https://api.test";

const Receipt = Schema.Struct({ id: Schema.String });

const Upload = Fetch.multipart(
	Schema.Struct({
		file: Fetch.UploadFile,
		kind: Schema.String,
		pages: Schema.Finite,
		signed: Schema.Boolean,
		takenAt: Schema.Date,
		tags: Schema.Array(Schema.String),
		note: Schema.NullOr(Schema.String),
		caption: Schema.optional(Schema.String),
		meta: Schema.fromJsonString(Schema.Struct({ source: Schema.String })),
	}),
);

const upload = Fetch.endpoint("POST /documents", {
	input: Upload,
	output: Receipt,
	headers: { "content-type": "application/json" },
});

const takenAt = new Date(Date.UTC(2026, 0, 2));

const file = () =>
	new File(["%PDF-1.7"], "passport.pdf", { type: "application/pdf" });

const body = () => ({
	file: file(),
	kind: "PASSPORT",
	pages: 2,
	signed: true,
	takenAt,
	tags: ["a", "b"],
	note: null,
	meta: { source: "camera" },
});

/** The parts of `form`, with files as `name`, `type` and `text`. */
const partsOf = async (form: FormData) =>
	Promise.all(
		[...form.entries()].map(async ([name, value]) =>
			typeof value === "string"
				? [name, value]
				: [
						name,
						{
							file: value.name,
							type: value.type,
							text: await value.text(),
						},
					],
		),
	);

const run = <A, E>(
	self: (api: Fetch.Client) => Effect.Effect<A, E, FetchTest.Recorder>,
	backend: Layer.Layer<HttpClient.HttpClient | FetchTest.Recorder>,
	headers?: Record<string, string>,
) =>
	Effect.gen(function* () {
		const api = yield* Fetch.make({ baseUrl: base, headers });
		return yield* self(api);
	}).pipe(Effect.provide(backend));

const defectOf = <A, E, R>(self: Effect.Effect<A, E, R>) =>
	Effect.map(Effect.exit(self), (exit) => {
		expect(Exit.hasDies(exit)).toBe(true);
		return Exit.isFailure(exit)
			? (Cause.squash(exit.cause) as Error).message
			: "";
	});

/** Every field is a file field, for `buildForm`. */
const allFiles = () => true;

/** No field is a file field, for `buildForm`. */
const noFiles = () => false;

/** Runs `self` with `navigator.product` set to `"ReactNative"`. */
const inReactNative = <A>(self: () => A): A => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
	Object.defineProperty(globalThis, "navigator", {
		value: { product: "ReactNative" },
		configurable: true,
	});
	try {
		return self();
	} finally {
		if (descriptor === undefined) {
			Reflect.deleteProperty(globalThis, "navigator");
		} else {
			Object.defineProperty(globalThis, "navigator", descriptor);
		}
	}
};

describe("Fetch.multipart", () => {
	it.effect("sends the body as a form, checked by the input schema", () =>
		Effect.gen(function* () {
			const backend = FetchTest.layer([
				FetchTest.respond(upload, () => Effect.succeed({ id: "d_1" })),
			]);
			const [receipt, sent] = yield* run(
				(api) =>
					Effect.gen(function* () {
						const receipt = yield* api.bind(upload)({
							body: body(),
							headers: { "Content-Type": "text/plain" },
						});
						const [sent] = yield* FetchTest.requests;
						return [receipt, sent] as const;
					}),
				backend,
				{ "content-type": "application/json" },
			);
			expect(receipt).toEqual({ id: "d_1" });
			expect(sent?.body).toBeInstanceOf(FormData);
			// No content-type from the call, the endpoint or the client: the
			// platform sets the multipart boundary.
			expect(sent?.headers["content-type"]).toBeUndefined();
			const parts = yield* Effect.promise(() =>
				partsOf(sent?.body as FormData),
			);
			expect(parts).toEqual([
				[
					"file",
					{
						file: "passport.pdf",
						type: "application/pdf",
						text: "%PDF-1.7",
					},
				],
				["kind", "PASSPORT"],
				["pages", "2"],
				["signed", "true"],
				["takenAt", "2026-01-02T00:00:00.000Z"],
				["tags", "a"],
				["tags", "b"],
				["meta", '{"source":"camera"}'],
			]);
		}),
	);

	it.effect("gives a handler the body decoded with the input schema", () =>
		Effect.gen(function* () {
			let received: unknown;
			const backend = FetchTest.layer([
				FetchTest.respond(upload, ({ body }) =>
					Effect.sync(() => {
						received = body;
						return { id: "d_1" };
					}),
				),
			]);
			yield* run(
				(api) => api.bind(upload)({ body: { ...body(), tags: ["only"] } }),
				backend,
			);
			const decoded = received as typeof Upload.Type;
			expect(decoded.file).toBeInstanceOf(File);
			expect((decoded.file as File).name).toBe("passport.pdf");
			expect({ ...decoded, file: undefined }).toEqual({
				file: undefined,
				kind: "PASSPORT",
				pages: 2,
				signed: true,
				takenAt,
				// A single part is a list again, and a missing `null` field is
				// `null` again.
				tags: ["only"],
				note: null,
				meta: { source: "camera" },
			});
		}),
	);

	it.effect("works on methods, and with a plain Blob", () =>
		Effect.gen(function* () {
			const Avatar = Fetch.multipart(
				Schema.Struct({ avatar: Fetch.UploadFile }),
			);
			const avatarRoute = Fetch.endpoint("PUT /me/avatar", {
				input: Avatar,
			});
			const backend = FetchTest.layer([
				FetchTest.respond(avatarRoute, () => Effect.void),
			]);
			const parts = yield* run(
				(api) =>
					Effect.gen(function* () {
						yield* api.put("/me/avatar", {
							input: Avatar,
							body: { avatar: new Blob(["png"], { type: "image/png" }) },
						});
						const [sent] = yield* FetchTest.requests;
						return yield* Effect.promise(() =>
							partsOf(sent?.body as FormData),
						);
					}),
				backend,
			);
			expect(parts).toEqual([
				["avatar", { file: "blob", type: "image/png", text: "png" }],
			]);
		}),
	);

	it.effect("dies when the body doesn't match the input schema", () =>
		Effect.gen(function* () {
			const message = yield* defectOf(
				encodeBody({ ...body(), pages: "two" }, Upload),
			);
			expect(message).toMatch(
				/^Invalid request body: it doesn't match the input schema:/,
			);
			expect(
				yield* defectOf(encodeBody({ ...body(), file: "a.pdf" }, Upload)),
			).toContain("Expected a file");
		}),
	);

	it.effect("dies on a value a form can't hold", () =>
		Effect.gen(function* () {
			expect(yield* defectOf(buildForm({ a: { b: 1 } }, allFiles))).toBe(
				'Invalid request body: the field "a" is an object, which a form can\'t hold. Send it as a string, such as with `Schema.fromJsonString`, or as a file, with `Fetch.UploadFile`',
			);
			expect(yield* defectOf(buildForm({ a: [["b"]] }, allFiles))).toContain(
				'the field "a" is a list inside a list',
			);
			expect(
				yield* defectOf(buildForm({ a: new Date(Number.NaN) }, allFiles)),
			).toBe('Invalid request body: the field "a" is an invalid Date');
			expect(yield* defectOf(buildForm(["a"], allFiles))).toBe(
				"Invalid request body: a multipart input schema must encode the body to an object of fields",
			);
		}),
	);

	it.effect("leaves out null and undefined, in lists too", () =>
		Effect.gen(function* () {
			const form = yield* buildForm(
				{ a: null, b: undefined, c: ["x", null, undefined, 1n] },
				allFiles,
			);
			expect([...form.entries()]).toEqual([
				["c", "x"],
				["c", "1"],
			]);
		}),
	);

	it.effect("dies on a React Native file outside React Native", () =>
		Effect.gen(function* () {
			const native = {
				uri: "file:///a.jpg",
				name: "a.jpg",
				type: "image/jpeg",
			};
			expect(yield* defectOf(buildForm({ photo: native }, allFiles))).toBe(
				'Invalid request body: the field "photo" is a React Native file (`{ uri, name, type }`), which only React Native can send. Elsewhere, send a `Blob` or a `File`',
			);
		}),
	);

	it("appends a React Native file as it is in React Native", () => {
		const appended: Array<[string, unknown]> = [];
		const OriginalFormData = globalThis.FormData;
		class NativeFormData {
			append(name: string, value: unknown) {
				appended.push([name, value]);
			}
		}
		globalThis.FormData = NativeFormData as unknown as typeof FormData;
		try {
			inReactNative(() =>
				Effect.runSync(
					buildForm(
						{
							photo: {
								uri: "file:///a.jpg",
								name: "a.jpg",
								type: "image/jpeg",
							},
							scan: { uri: "content://b", name: "b.pdf" },
						},
						allFiles,
					),
				),
			);
		} finally {
			globalThis.FormData = OriginalFormData;
		}
		expect(appended).toEqual([
			["photo", { uri: "file:///a.jpg", name: "a.jpg", type: "image/jpeg" }],
			// Android rejects a file part without a type.
			[
				"scan",
				{
					uri: "content://b",
					name: "b.pdf",
					type: "application/octet-stream",
				},
			],
		]);
	});

	it("sends a React Native file only from an UploadFile field", () => {
		const NativeFormData = class {
			append() {}
		};
		const OriginalFormData = globalThis.FormData;
		globalThis.FormData = NativeFormData as unknown as typeof FormData;
		try {
			const exit = inReactNative(() =>
				Effect.runSyncExit(
					buildForm({ doc: { uri: "file:///a", name: "a" } }, noFiles),
				),
			);
			expect(Exit.hasDies(exit)).toBe(true);
			expect(
				Exit.isFailure(exit) && (Cause.squash(exit.cause) as Error).message,
			).toContain('the field "doc" is an object');
		} finally {
			globalThis.FormData = OriginalFormData;
		}
	});

	it("finds the file fields of an input schema", () => {
		const isFileField = fileFieldsOf(
			Fetch.multipart(
				Schema.Union([
					Schema.Struct({
						file: Fetch.UploadFile.annotate({ title: "Scan" }),
						files: Schema.Array(Fetch.UploadFile),
						maybe: Schema.NullOr(Fetch.UploadFile),
						kind: Schema.String,
					}),
					Schema.Struct({
						checked: Fetch.UploadFile.check(
							Schema.makeFilter(() => true),
						),
						blob: Schema.instanceOf(Blob),
					}),
				]),
			),
		);
		expect(
			["file", "files", "maybe", "checked", "kind", "blob", "other"].map(
				isFileField,
			),
		).toEqual([true, true, true, true, false, false, false]);
		const isRecordFile = fileFieldsOf(
			Fetch.multipart(
				Schema.StructWithRest(Schema.Struct({ kind: Schema.String }), [
					Schema.Record(Schema.String, Fetch.UploadFile),
				]),
			),
		);
		expect(["kind", "other"].map(isRecordFile)).toEqual([false, true]);
	});

	it.effect("dies when a JSON body has an UploadFile", () =>
		Effect.gen(function* () {
			const Json = Schema.Struct({ file: Fetch.UploadFile });
			for (const value of [
				file(),
				{ uri: "file:///a.jpg", name: "a.jpg", type: "image/jpeg" },
			]) {
				const message = yield* defectOf(encodeBody({ file: value }, Json));
				expect(message).toContain(
					"a file can't be sent as JSON. To upload it, wrap the input schema in `Fetch.multipart`",
				);
			}
		}),
	);

	it("accepts the files each platform sends", () => {
		const is = Schema.is(Fetch.UploadFile);
		expect(is(file())).toBe(true);
		expect(is(new Blob(["a"]))).toBe(true);
		expect(is({ uri: "file:///a", name: "a" })).toBe(true);
		expect(is({ uri: "file:///a", name: "a", type: "image/png" })).toBe(true);
		expect(is({ uri: "file:///a" })).toBe(false);
		expect(is({ uri: "file:///a", name: "a", type: 1 })).toBe(false);
		expect(is("file:///a")).toBe(false);
	});

	it.effect("drops a content-type set for a plain FormData body", () =>
		Effect.gen(function* () {
			const form = new FormData();
			form.append("a", "1");
			const sendForm = Fetch.endpoint("POST /forms");
			const backend = FetchTest.layer([
				FetchTest.respond(sendForm, () => Effect.void),
			]);
			const sent = yield* run(
				(api) =>
					Effect.gen(function* () {
						yield* api.post("/forms", {
							body: form,
							headers: { "content-type": "multipart/form-data" },
						});
						return (yield* FetchTest.requests)[0];
					}),
				backend,
			);
			expect(sent?.headers["content-type"]).toBeUndefined();
			expect(sent?.body).toBe(form);
		}),
	);

	it.effect("keeps sending JSON for an input schema without the mark", () =>
		Effect.gen(function* () {
			const Json = Schema.Struct({ kind: Schema.String });
			const route = Fetch.endpoint("POST /json", { input: Json });
			const backend = FetchTest.layer([
				FetchTest.respond(route, () => Effect.void),
			]);
			const sent = yield* run(
				(api) =>
					Effect.gen(function* () {
						yield* api.bind(route)({ body: { kind: "a" } });
						return (yield* FetchTest.requests)[0];
					}),
				backend,
			);
			expect(sent?.headers["content-type"]).toBe("application/json");
			expect(sent?.body).toEqual({ kind: "a" });
		}),
	);

	it("stays marked with more checks or annotations", () => {
		const checked = Upload.annotate({ title: "Upload" });
		expect(encodeBody(body(), checked).pipe(Effect.runSync)?._tag).toBe(
			"FormData",
		);
	});

	it.effect("FetchTest reads back nulls, undefineds and lists", () =>
		Effect.gen(function* () {
			const Fields = Fetch.multipart(
				Schema.Struct({
					tags: Schema.NullOr(Schema.Array(Schema.String)),
					labels: Schema.NullOr(Schema.Array(Schema.String)),
					cleared: Schema.NullOr(Schema.Array(Schema.String)),
					note: Schema.UndefinedOr(Schema.String),
					count: Schema.optional(Schema.NullOr(Schema.Finite)),
				}),
			);
			const route = Fetch.endpoint("POST /fields", { input: Fields });
			const received: Array<unknown> = [];
			const backend = FetchTest.layer([
				FetchTest.respond(route, ({ body }) =>
					Effect.sync(() => {
						received.push(body);
					}),
				),
			]);
			yield* run(
				(api) =>
					api.bind(route)({
						body: {
							tags: ["a"],
							labels: ["a", "b"],
							cleared: null,
							note: undefined,
							count: 2,
						},
					}),
				backend,
			);
			expect(received).toEqual([
				{
					tags: ["a"],
					labels: ["a", "b"],
					cleared: null,
					note: undefined,
					count: 2,
				},
			]);
		}),
	);

	it.effect("FetchTest reads back a union of field sets", () =>
		Effect.gen(function* () {
			const Fields = Fetch.multipart(
				Schema.Union([
					Schema.Struct({
						kind: Schema.Literal("photo"),
						photo: Fetch.UploadFile,
						caption: Schema.NullOr(Schema.String),
					}),
					Schema.Struct({
						kind: Schema.Literal("link"),
						urls: Schema.Array(Schema.String),
					}),
				]),
			);
			const route = Fetch.endpoint("POST /posts", { input: Fields });
			const received: Array<unknown> = [];
			const backend = FetchTest.layer([
				FetchTest.respond(route, ({ body }) =>
					Effect.sync(() => {
						received.push(body);
					}),
				),
			]);
			yield* run(
				(api) =>
					Effect.gen(function* () {
						const post = api.bind(route);
						yield* post({
							body: { kind: "photo", photo: file(), caption: null },
						});
						yield* post({ body: { kind: "link", urls: ["https://a"] } });
					}),
				backend,
			);
			const [photo, link] = received as [
				{ readonly photo: unknown; readonly caption: unknown },
				unknown,
			];
			expect(photo.photo).toBeInstanceOf(File);
			expect(photo.caption).toBeNull();
			expect(link).toEqual({ kind: "link", urls: ["https://a"] });
		}),
	);

	it.effect("FetchTest reads each member of a union on its own", () =>
		Effect.gen(function* () {
			const Fields = Fetch.multipart(
				Schema.Union([
					Schema.Struct({
						kind: Schema.Literal("a"),
						note: Schema.NullOr(Schema.String),
						extra: Schema.UndefinedOr(Schema.String),
					}),
					Schema.Struct({
						kind: Schema.Literal("b"),
						note: Schema.optional(Schema.String),
						extra: Schema.optionalKey(Schema.String),
						urls: Schema.Array(Schema.String),
					}),
				]),
			);
			const route = Fetch.endpoint("POST /union", { input: Fields });
			const received: Array<unknown> = [];
			const backend = FetchTest.layer([
				FetchTest.respond(route, ({ body }) =>
					Effect.sync(() => {
						received.push(body);
					}),
				),
			]);
			yield* run(
				(api) =>
					Effect.gen(function* () {
						const send = api.bind(route);
						yield* send({ body: { kind: "b", urls: [] } });
						yield* send({ body: { kind: "b", urls: ["x"] } });
						yield* send({
							body: { kind: "a", note: null, extra: undefined },
						});
					}),
				backend,
			);
			expect(received).toEqual([
				{ kind: "b", urls: [] },
				{ kind: "b", urls: ["x"] },
				{ kind: "a", note: null, extra: undefined },
			]);
		}),
	);

	it.effect("FetchTest reads nested and record lists that take null", () =>
		Effect.gen(function* () {
			const Nested = Fetch.multipart(
				Schema.Struct({
					tags: Schema.optional(
						Schema.NullOr(Schema.Array(Schema.String)),
					),
					files: Schema.optional(
						Schema.NullOr(Schema.Array(Fetch.UploadFile)),
					),
				}),
			);
			const Rest = Fetch.multipart(
				Schema.Record(
					Schema.String,
					Schema.NullOr(Schema.Array(Schema.String)),
				),
			);
			const nested = Fetch.endpoint("POST /nested", { input: Nested });
			const rest = Fetch.endpoint("POST /rest", { input: Rest });
			const received: Array<Record<string, unknown>> = [];
			const keep = ({ body }: { readonly body: unknown }) =>
				Effect.sync(() => {
					received.push(body as Record<string, unknown>);
				});
			const backend = FetchTest.layer([
				FetchTest.respond(nested, keep),
				FetchTest.respond(rest, keep),
			]);
			yield* run(
				(api) =>
					Effect.gen(function* () {
						yield* api.bind(nested)({
							body: { tags: ["a"], files: [file()] },
						});
						yield* api.bind(rest)({ body: { other: ["x"] } });
					}),
				backend,
			);
			const [first, second] = received;
			expect(first?.["tags"]).toEqual(["a"]);
			expect(first?.["files"]).toEqual([expect.any(File)]);
			expect(second).toEqual({ other: ["x"] });
		}),
	);

	it.effect("FetchTest reads a required query list that takes null", () =>
		Effect.gen(function* () {
			const route = Fetch.endpoint("GET /search", {
				query: Schema.Struct({
					tags: Schema.NullOr(Schema.Array(Schema.String)),
				}),
			});
			const received: Array<unknown> = [];
			const backend = FetchTest.layer([
				FetchTest.respond(route, ({ query }) =>
					Effect.sync(() => {
						received.push(query);
					}),
				),
			]);
			yield* run(
				(api) =>
					Effect.gen(function* () {
						const search = api.bind(route);
						yield* search({ query: { tags: [] } });
						yield* search({ query: { tags: ["a"] } });
						yield* search({ query: { tags: null } });
					}),
				backend,
			);
			expect(received).toEqual([
				{ tags: [] },
				{ tags: ["a"] },
				{ tags: null },
			]);
		}),
	);

	it.effect("FetchTest says to use UploadFile for a Schema.File field", () =>
		Effect.gen(function* () {
			const route = Fetch.endpoint("POST /files", {
				input: Fetch.multipart(Schema.Struct({ scan: Schema.File })),
			});
			const backend = FetchTest.layer([
				FetchTest.respond(route, () => Effect.void),
			]);
			const message = yield* defectOf(
				run((api) => api.bind(route)({ body: { scan: file() } }), backend),
			);
			expect(message).toBe(
				'FetchTest: the field "scan" of the input schema of POST /files is a `Schema.File`, which FetchTest can\'t read back from a form. Use `Fetch.UploadFile` for files.',
			);
		}),
	);

	it("FetchTest reads React Native's form, which only has getParts", async () => {
		class NativeFormData {
			readonly parts: Array<Record<string, unknown>> = [];
			append(name: string, value: unknown) {
				this.parts.push(
					typeof value === "string"
						? { fieldName: name, string: value }
						: { ...(value as object), fieldName: name },
				);
			}
			getParts() {
				return this.parts;
			}
		}
		const Fields = Fetch.multipart(
			Schema.Struct({
				photo: Fetch.UploadFile,
				tags: Schema.Array(Schema.String),
			}),
		);
		const route = Fetch.endpoint("POST /photos", { input: Fields });
		let received: unknown;
		const backend = FetchTest.layer([
			FetchTest.respond(route, ({ body }) =>
				Effect.sync(() => {
					received = body;
				}),
			),
		]);
		const OriginalFormData = globalThis.FormData;
		const navigator = Object.getOwnPropertyDescriptor(
			globalThis,
			"navigator",
		);
		globalThis.FormData = NativeFormData as unknown as typeof FormData;
		Object.defineProperty(globalThis, "navigator", {
			value: { product: "ReactNative" },
			configurable: true,
		});
		try {
			await Effect.runPromise(
				run(
					(api) =>
						api.bind(route)({
							body: {
								photo: { uri: "file:///a.jpg", name: "a.jpg" },
								tags: ["a"],
							},
						}),
					backend,
				),
			);
		} finally {
			globalThis.FormData = OriginalFormData;
			if (navigator === undefined) {
				Reflect.deleteProperty(globalThis, "navigator");
			} else {
				Object.defineProperty(globalThis, "navigator", navigator);
			}
		}
		expect(received).toEqual({
			photo: {
				uri: "file:///a.jpg",
				name: "a.jpg",
				type: "application/octet-stream",
			},
			tags: ["a"],
		});
	});

	it.effect("FetchTest dies when a multipart endpoint gets JSON", () =>
		Effect.gen(function* () {
			const route = Fetch.endpoint("POST /documents", {
				input: Fetch.multipart(Schema.Struct({ kind: Schema.String })),
			});
			const backend = FetchTest.layer([
				FetchTest.respond(route, () => Effect.void),
			]);
			const message = yield* defectOf(
				run(
					(api) => api.post("/documents", { body: { kind: "a" } }),
					backend,
				),
			);
			expect(message).toContain(
				"the body sent to POST /documents isn't a form, though its input schema is multipart",
			);
		}),
	);
});
