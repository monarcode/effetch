import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Fetch } from "@monarcode/effetch";
import { FetchTest } from "@monarcode/effetch/test";

import {
	FileTooLarge,
	Httpbin,
	Note,
	Received,
	uploadNote,
} from "./httpbin.ts";

// The upload is a plain `post` call, so the test defines the endpoint it
// serves, from the same schemas.
const echo = Fetch.endpoint("POST /post", { input: Note, output: Received });

const Backend = FetchTest.layer([
	// `body` is the form, read back with `Note`: the file is a `File` again.
	FetchTest.respond(echo, ({ body }) =>
		Effect.gen(function* () {
			const text = yield* Effect.promise(() =>
				body.file instanceof Blob ? body.file.text() : Promise.resolve(""),
			);
			return {
				form: { title: body.title, tags: [...body.tags] },
				files: { file: text },
				headers: { "Content-Type": "multipart/form-data" },
			};
		}),
	),
]);

const TestLayer = Httpbin.layer.pipe(Layer.provideMerge(Backend));

describe("uploadNote", () => {
	it.effect("sends the file and the fields as a form", () =>
		Effect.gen(function* () {
			const file = new File(["hello"], "notes.md", {
				type: "text/markdown",
			});
			const received = yield* uploadNote(file);
			expect(received.form).toStrictEqual({
				title: "Meeting notes",
				tags: ["work", "draft"],
			});
			expect(received.files.file).toBe("hello");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("fails with FileTooLarge, and sends nothing", () =>
		Effect.gen(function* () {
			const file = new File([new Uint8Array(1_000_000)], "big.bin");
			const error = yield* Effect.flip(uploadNote(file));
			expect(error).toStrictEqual(
				new FileTooLarge({ name: "big.bin", size: 1_000_000 }),
			);
			expect(yield* FetchTest.requests).toStrictEqual([]);
		}).pipe(Effect.provide(TestLayer)),
	);
});
