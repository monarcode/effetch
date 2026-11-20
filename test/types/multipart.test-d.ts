// Type tests build Effects only to check their types; none are run.
// @effect-diagnostics floatingEffect:off

import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { describe, expectTypeOf, it } from "vitest";

import { Fetch } from "../../src/index.js";
import type { FetchTest } from "../../src/test/index.js";

const Fields = Schema.Struct({
	file: Fetch.UploadFile,
	kind: Schema.Literals(["PASSPORT", "ID"]),
	pages: Schema.optional(Schema.Finite),
	takenAt: Schema.Date,
	tags: Schema.Array(Schema.String),
	note: Schema.NullOr(Schema.String),
	meta: Schema.fromJsonString(Schema.Struct({ source: Schema.String })),
});

const Upload = Fetch.multipart(Fields);

const upload = Fetch.endpoint("POST /documents", {
	input: Upload,
	output: Schema.Struct({ id: Schema.String }),
});

declare const api: Fetch.Client;

describe("Fetch.multipart", () => {
	it("returns the schema it's given", () => {
		expectTypeOf(Upload).toEqualTypeOf<typeof Fields>();
	});

	it("types the body from the input schema", () => {
		const call = api.bind(upload);
		type Body = Parameters<typeof call>[0]["body"];
		expectTypeOf<Body>().toEqualTypeOf<typeof Fields.Type>();
		expectTypeOf<Body["file"]>().toEqualTypeOf<Blob | Fetch.NativeFile>();
		expectTypeOf(
			call({
				body: {
					file: new Blob(),
					kind: "PASSPORT",
					takenAt: new Date(),
					tags: [],
					note: null,
					meta: { source: "camera" },
				},
			}),
		).toExtend<Effect.Effect<{ readonly id: string }, unknown, unknown>>();
		call({
			body: {
				// @ts-expect-error a file is a Blob or a native file
				file: "a.pdf",
				kind: "PASSPORT",
				takenAt: new Date(),
				tags: [],
				note: null,
				meta: { source: "camera" },
			},
		});
	});

	it("works on a method's input", () => {
		expectTypeOf(
			api.post("/documents", {
				input: Upload,
				body: {
					file: { uri: "file:///a", name: "a" },
					kind: "ID",
					takenAt: new Date(),
					tags: ["a"],
					note: "n",
					meta: { source: "s" },
				},
			}),
		).toExtend<Effect.Effect<unknown, unknown, unknown>>();
	});

	it("rejects a schema that encodes to what a form can't hold", () => {
		Fetch.multipart(
			// @ts-expect-error a nested object
			Schema.Struct({ a: Schema.Struct({ b: Schema.String }) }),
		);
		Fetch.multipart(
			// @ts-expect-error a list of lists
			Schema.Struct({ a: Schema.Array(Schema.Array(Schema.String)) }),
		);
		// @ts-expect-error not an object of fields
		Fetch.multipart(Schema.String);
		Fetch.multipart(
			Schema.Struct({
				a: Schema.fromJsonString(Schema.Struct({ b: Schema.String })),
				n: Schema.BigInt,
				f: Schema.Array(Fetch.UploadFile),
			}),
		);
	});

	it("gives a FetchTest handler the decoded body", () => {
		expectTypeOf<
			FetchTest.RequestBody<"POST /documents", typeof Upload>
		>().toEqualTypeOf<typeof Fields.Type>();
	});

	it("types UploadFile and its schema", () => {
		expectTypeOf(Fetch.UploadFile).toEqualTypeOf<Fetch.UploadFileSchema>();
		expectTypeOf<typeof Fetch.UploadFile.Type>().toEqualTypeOf<
			Blob | Fetch.NativeFile
		>();
		expectTypeOf(
			Fetch.UploadFile.annotate({ title: "Avatar" }),
		).toEqualTypeOf<Fetch.UploadFileSchema>();
	});
});
