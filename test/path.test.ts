import { describe, expect, it } from "vitest";

import { interpolatePath } from "../src/internal/path.js";

describe("interpolatePath", () => {
	it("replaces whole :param segments", () => {
		expect(
			interpolatePath("/users/:id/posts/:postId", { id: 1, postId: "a b" }),
		).toBe("/users/1/posts/a%20b");
	});

	it("throws on a missing param", () => {
		expect(() => interpolatePath("/users/:id", {})).toThrow(
			'Missing path parameter "id" for path "/users/:id"',
		);
		expect(() => interpolatePath("/users/:id", undefined)).toThrow();
	});

	it("ignores inherited properties", () => {
		expect(() => interpolatePath("/x/:constructor", {})).toThrow(
			'Missing path parameter "constructor"',
		);
		expect(() => interpolatePath("/x/:toString", {})).toThrow();
	});

	it("encodes reserved characters", () => {
		expect(interpolatePath("/files/:name", { name: "a/b" })).toBe(
			"/files/a%2Fb",
		);
		expect(interpolatePath("/q/:term", { term: "a b?c#d&e=f" })).toBe(
			"/q/a%20b%3Fc%23d%26e%3Df",
		);
		expect(interpolatePath("/x/:v", { v: "50%" })).toBe("/x/50%25");
	});

	it("encodes unicode", () => {
		expect(interpolatePath("/cities/:name", { name: "São Paulo" })).toBe(
			"/cities/S%C3%A3o%20Paulo",
		);
		expect(interpolatePath("/emoji/:e", { e: "🙂" })).toBe(
			"/emoji/%F0%9F%99%82",
		);
	});

	it("stringifies numbers, including zero", () => {
		expect(interpolatePath("/todos/:id", { id: 42 })).toBe("/todos/42");
		expect(interpolatePath("/todos/:id", { id: 0 })).toBe("/todos/0");
		expect(interpolatePath("/n/:v", { v: -1.5 })).toBe("/n/-1.5");
	});

	it("leaves paths without params untouched", () => {
		expect(interpolatePath("/todos", undefined)).toBe("/todos");
		expect(interpolatePath("/", {})).toBe("/");
		expect(interpolatePath("", {})).toBe("");
		expect(interpolatePath("/todos/", {})).toBe("/todos/");
	});

	it("only treats whole segments starting with : as params", () => {
		expect(interpolatePath("/a:b/c", {})).toBe("/a:b/c");
		expect(interpolatePath("/a/:/b", {})).toBe("/a/:/b");
		expect(interpolatePath("/t/12:30", {})).toBe("/t/12:30");
	});

	it("treats a dotted segment as one param name", () => {
		expect(interpolatePath("/files/:name.json", { "name.json": "a" })).toBe(
			"/files/a",
		);
		expect(() => interpolatePath("/files/:name.json", { name: "a" })).toThrow(
			'Missing path parameter "name.json"',
		);
	});

	it("handles absolute URLs, ports and a leading param", () => {
		expect(interpolatePath("https://h:3000/u/:id", { id: 1 })).toBe(
			"https://h:3000/u/1",
		);
		expect(interpolatePath(":id", { id: 1 })).toBe("1");
		expect(interpolatePath("/u/:id/", { id: 1 })).toBe("/u/1/");
	});

	it("reuses a param name", () => {
		expect(interpolatePath("/:a/:a", { a: "x" })).toBe("/x/x");
	});

	it("ignores extra params", () => {
		expect(interpolatePath("/todos/:id", { id: 1, other: 2 })).toBe(
			"/todos/1",
		);
	});
});
