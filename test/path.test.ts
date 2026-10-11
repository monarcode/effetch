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
});
