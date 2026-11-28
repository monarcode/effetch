import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { retry } from "@monarcode/effetch/plugins";

// Uploading a file with two form fields to httpbin.org, which answers with
// what it received. The upload is a plain `post` call, without an endpoint.

/** A file under 1 MB. A check on `Fetch.UploadFile` runs on a `Blob`. */
export const SmallFile = Fetch.UploadFile.check(
	Schema.makeFilter(
		(file) => !(file instanceof Blob) || file.size < 1_000_000,
		{ expected: "a file under 1 MB" },
	),
);

/** The form: each field becomes a part, and a list one part per item. */
export const Note = Fetch.multipart(
	Schema.Struct({
		title: Schema.String,
		tags: Schema.Array(Schema.String),
		file: SmallFile,
	}),
);

/** What httpbin echoes: the form's text fields, and each file's contents. */
export const Received = Schema.Struct({
	form: Schema.Record(
		Schema.String,
		Schema.Union([Schema.String, Schema.Array(Schema.String)]),
	),
	files: Schema.Record(Schema.String, Schema.String),
	headers: Schema.Record(Schema.String, Schema.String),
});

/** The file is too large to send. */
export class FileTooLarge extends Schema.TaggedError<FileTooLarge>()(
	"FileTooLarge",
	{ name: Schema.String, size: Schema.Finite },
) {}

export class Httpbin extends Fetch.Service<Httpbin>()("Httpbin", {
	baseUrl: "https://httpbin.org",
	// httpbin only echoes, so sending a POST again is safe. Most POSTs aren't
	// retried, which is why `retry` leaves them out by default.
	plugins: [retry({ methods: ["POST"] })],
}) {}

/**
 * Uploads `file` with a title and tags. A file that fails `SmallFile` in
 * the call would be a bug, and make the call die, so it's checked first,
 * and fails with `FileTooLarge`.
 */
export const uploadNote = Effect.fn("uploadNote")(function* (file: File) {
	if (Option.isNone(Schema.decodeUnknownOption(SmallFile)(file))) {
		return yield* new FileTooLarge({ name: file.name, size: file.size });
	}
	const httpbin = yield* Httpbin;
	return yield* httpbin.post("/post", {
		input: Note,
		body: { title: "Meeting notes", tags: ["work", "draft"], file },
		output: Received,
	});
});
