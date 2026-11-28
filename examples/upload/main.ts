import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";

import { Httpbin, uploadNote } from "./httpbin.ts";

// Uploads a small file, then a large one, to httpbin.org:
//
//   pnpm example upload

// In a browser, a `File` comes from an <input type="file">. In React Native,
// pass a `Fetch.NativeFile`: `{ uri, name, type }`.
const notes = new File(["# Notes\n\n- Ship 0.1.0\n"], "notes.md", {
	type: "text/markdown",
});
const video = new File([new Uint8Array(2_500_000)], "demo.mp4", {
	type: "video/mp4",
});

const upload = (file: File) =>
	uploadNote(file).pipe(
		Effect.flatMap((received) =>
			Console.log(
				[
					`Sent ${file.name}. httpbin received:`,
					`  content-type: ${received.headers["Content-Type"]}`,
					`  fields: ${JSON.stringify(received.form)}`,
					`  file: ${JSON.stringify(received.files.file)}`,
				].join("\n"),
			),
		),
		Effect.catchTag("FileTooLarge", (error) =>
			Console.log(
				`${error.name} is ${(error.size / 1_000_000).toFixed(1)} MB. The limit is 1 MB.`,
			),
		),
	);

const program = Effect.gen(function* () {
	yield* upload(notes);
	yield* upload(video);
});

const Live = Httpbin.layer.pipe(Layer.provide(FetchHttpClient.layer));

Effect.runPromise(program.pipe(Effect.provide(Live)));
