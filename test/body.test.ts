import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpBody from "effect/http/HttpBody";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

import { describe, expect } from "vitest";

import { encodeBody } from "../src/internal/body.js";
import type { AnySchema } from "../src/Options.js";

const decoder = new TextDecoder();

const describeBody = (body: HttpBody.HttpBody | undefined) => {
	if (body === undefined) {
		return undefined;
	}
	if (body._tag === "Uint8Array") {
		return {
			tag: body._tag,
			contentType: body.contentType,
			text: decoder.decode(body.body),
		};
	}
	return { tag: body._tag };
};

const encoded = <I extends AnySchema = Schema.Unknown>(
	body: unknown,
	input?: I,
) => Effect.map(encodeBody(body, input), describeBody);

const bytesBody = (body: HttpBody.HttpBody | undefined) => {
	if (body?._tag !== "Uint8Array") {
		throw new Error(`Expected a Uint8Array body, got ${body?._tag}`);
	}
	return body;
};

const jsonBody = (text: string) => ({
	tag: "Uint8Array",
	contentType: "application/json",
	text,
});

const textBody = (text: string, contentType = "text/plain") => ({
	tag: "Uint8Array",
	contentType,
	text,
});

const rawBody = (body: HttpBody.HttpBody | undefined) => {
	if (body?._tag !== "Raw") {
		throw new Error(`Expected a Raw body, got ${body?._tag}`);
	}
	return body;
};

const defectOf = <A>(self: Effect.Effect<A>) =>
	Effect.map(Effect.exit(self), (exit) => {
		expect(Exit.hasDies(exit)).toBe(true);
		const defect = Exit.isFailure(exit)
			? Cause.squash(exit.cause)
			: undefined;
		if (!(defect instanceof Error)) {
			throw new Error(`Expected an Error defect, got ${String(defect)}`);
		}
		return defect;
	});

describe("encodeBody without an input schema", () => {
	it.effect("sends no body for undefined", () =>
		Effect.gen(function* () {
			expect(yield* encodeBody(undefined)).toBeUndefined();
		}),
	);

	it.effect("passes an HttpBody through unchanged", () =>
		Effect.gen(function* () {
			const body = HttpBody.text("a,b", "text/csv");
			expect(yield* encodeBody(body)).toBe(body);
			expect(yield* encodeBody(HttpBody.empty)).toBe(HttpBody.empty);
		}),
	);

	it.effect("wraps FormData without touching it", () =>
		Effect.gen(function* () {
			const formData = new FormData();
			formData.append("file", "contents");
			const body = yield* encodeBody(formData);
			if (body?._tag !== "FormData") {
				throw new Error(`Expected a FormData body, got ${body?._tag}`);
			}
			expect(body.formData).toBe(formData);
			expect(body.contentType).toBeUndefined();
		}),
	);

	it.effect("sends URLSearchParams as a form", () =>
		Effect.gen(function* () {
			expect(
				yield* encoded(new URLSearchParams({ a: "1", b: "x y" })),
			).toEqual(textBody("a=1&b=x+y", "application/x-www-form-urlencoded"));
		}),
	);

	it.effect("sends a Uint8Array as bytes", () =>
		Effect.gen(function* () {
			const bytes = new Uint8Array([1, 2, 3]);
			const body = bytesBody(yield* encodeBody(bytes));
			expect(body.contentType).toBe("application/octet-stream");
			expect(body.body).toEqual(bytes);
			expect(body.contentLength).toBe(3);
		}),
	);

	it.effect("sends ArrayBuffers and other views as their bytes", () =>
		Effect.gen(function* () {
			const bytesOf = function* (value: unknown) {
				const body = bytesBody(yield* encodeBody(value));
				expect(body.contentType).toBe("application/octet-stream");
				return [...body.body];
			};
			expect(yield* bytesOf(new Uint8Array([1, 2, 3]).buffer)).toEqual([
				1, 2, 3,
			]);
			expect(yield* bytesOf(new Uint16Array([1]))).toEqual([1, 0]);
			expect(yield* bytesOf(new DataView(new ArrayBuffer(2)))).toEqual([
				0, 0,
			]);
			expect(
				yield* bytesOf(new Uint8Array([1, 2, 3, 4]).subarray(1, 3)),
			).toEqual([2, 3]);
		}),
	);

	it.effect("sends a Blob as-is with its type and size", () =>
		Effect.gen(function* () {
			const blob = new Blob(["abc"], { type: "image/png" });
			const body = rawBody(yield* encodeBody(blob));
			expect(body.body).toBe(blob);
			expect(body.contentType).toBe("image/png");
			expect(body.contentLength).toBe(3);
			const untyped = rawBody(yield* encodeBody(new Blob(["x"])));
			expect(untyped.contentType).toBeUndefined();
		}),
	);

	it.effect("recognises values from another realm by their tag", () =>
		Effect.gen(function* () {
			const foreignBlob = {
				[Symbol.toStringTag]: "Blob",
				type: "text/csv",
				size: 1,
			};
			const body = rawBody(yield* encodeBody(foreignBlob));
			expect(body.contentType).toBe("text/csv");
		}),
	);

	it.effect("sends a string as text, not JSON", () =>
		Effect.gen(function* () {
			expect(yield* encoded("hello")).toEqual(textBody("hello"));
			expect((yield* encoded(""))?.tag).toBe("Uint8Array");
		}),
	);

	it.effect("sends everything else as JSON", () =>
		Effect.gen(function* () {
			expect(yield* encoded({ done: true, n: [1, 2] })).toEqual(
				jsonBody('{"done":true,"n":[1,2]}'),
			);
			expect(yield* encoded([1, "a"])).toEqual(jsonBody('[1,"a"]'));
			expect(yield* encoded(42)).toEqual(jsonBody("42"));
			expect(yield* encoded(0)).toEqual(jsonBody("0"));
			expect(yield* encoded(false)).toEqual(jsonBody("false"));
			expect(yield* encoded(null)).toEqual(jsonBody("null"));
			expect(yield* encoded(new Date(0))).toEqual(
				jsonBody('"1970-01-01T00:00:00.000Z"'),
			);
		}),
	);

	it.effect("sets the content length in bytes", () =>
		Effect.gen(function* () {
			const body = bytesBody(yield* encodeBody({ name: "São" }));
			expect(body.contentLength).toBe(
				new TextEncoder().encode('{"name":"São"}').length,
			);
		}),
	);

	it.effect("dies when the body has no JSON representation", () =>
		Effect.gen(function* () {
			for (const value of [
				() => 1,
				Symbol("x"),
				{ toJSON: () => undefined },
			]) {
				const defect = yield* defectOf(encodeBody(value));
				expect(defect.message).toMatch(
					/^Invalid request body: it can't be serialised as JSON: /,
				);
			}
		}),
	);

	it.effect("dies when the body can't be serialised", () =>
		Effect.gen(function* () {
			const circular: Record<string, unknown> = {};
			circular.self = circular;
			for (const value of [circular, 10n]) {
				const defect = yield* defectOf(encodeBody(value));
				expect(defect.message).toMatch(
					/^Invalid request body: it can't be serialised as JSON: /,
				);
				expect(defect.cause).toBeInstanceOf(Error);
			}
		}),
	);
});

describe("encodeBody with an input schema", () => {
	const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });

	it.effect("encodes the body, turning a Date into an ISO string", () =>
		Effect.gen(function* () {
			expect(
				yield* encoded(
					{
						title: "Write docs",
						due: new Date("2026-10-11T00:00:00.000Z"),
					},
					NewTodo,
				),
			).toEqual(
				jsonBody('{"title":"Write docs","due":"2026-10-11T00:00:00.000Z"}'),
			);
		}),
	);

	it.effect("applies the schema's transformations", () =>
		Effect.gen(function* () {
			const Id = Schema.Struct({ id: Schema.NumberFromString });
			expect(yield* encoded({ id: 7 }, Id)).toEqual(jsonBody('{"id":"7"}'));
		}),
	);

	it.effect("takes precedence over the plain body rules", () =>
		Effect.gen(function* () {
			expect(yield* encoded("hi", Schema.String)).toEqual(jsonBody('"hi"'));
		}),
	);

	it.effect("still sends no body for undefined", () =>
		Effect.gen(function* () {
			expect(yield* encodeBody(undefined, NewTodo)).toBeUndefined();
		}),
	);

	it.effect("dies when the body doesn't match the schema", () =>
		Effect.gen(function* () {
			const defect = yield* defectOf(
				encodeBody({ title: "x", due: "tomorrow" }, NewTodo),
			);
			expect(defect.message).toMatch(
				/^Invalid request body: it doesn't match the input schema: /,
			);
			expect(defect.message).toContain("due");
			expect(HttpBody.isHttpBodyError(defect.cause)).toBe(true);
		}),
	);

	it.effect("requires the schema's encoding services", () =>
		Effect.gen(function* () {
			class Prefix extends Context.Service<
				Prefix,
				{ readonly value: string }
			>()("Prefix") {}
			const Prefixed = Schema.String.pipe(
				Schema.decode({
					decode: SchemaGetter.passthrough(),
					encode: SchemaGetter.transformEffect((s: string) =>
						Effect.map(Effect.service(Prefix), (p) => `${p.value}${s}`),
					),
				}),
			);
			const program = Effect.map(encodeBody("x", Prefixed), describeBody);
			expect(
				yield* Effect.provideService(program, Prefix, { value: "pre-" }),
			).toMatchObject({ text: '"pre-x"' });
		}),
	);
});
