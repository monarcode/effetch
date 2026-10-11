import { describe, expectTypeOf, it } from "vitest";

import type { PathParamNames, PathParams } from "../../src/Path.js";

describe("PathParamNames", () => {
	it("collects every :param segment", () => {
		expectTypeOf<PathParamNames<"/users/:id/posts/:postId">>().toEqualTypeOf<
			"id" | "postId"
		>();
	});

	it("is never without params", () => {
		expectTypeOf<PathParamNames<"/users">>().toBeNever();
		expectTypeOf<PathParamNames<"">>().toBeNever();
	});

	it("ignores the port in an absolute URL", () => {
		expectTypeOf<
			PathParamNames<"https://h:3000/u/:id">
		>().toEqualTypeOf<"id">();
	});

	it("handles a trailing slash", () => {
		expectTypeOf<PathParamNames<"/users/:id/">>().toEqualTypeOf<"id">();
	});

	it("is never for the root path", () => {
		expectTypeOf<PathParamNames<"/">>().toBeNever();
	});

	it("accepts a bare :param", () => {
		expectTypeOf<PathParamNames<":id">>().toEqualTypeOf<"id">();
	});

	it("ignores a lone colon", () => {
		expectTypeOf<PathParamNames<"/a/:/b">>().toBeNever();
	});

	it("keeps params next to template literal segments", () => {
		expectTypeOf<
			PathParamNames<`/orgs/${string}/users/:id`>
		>().toEqualTypeOf<"id">();
		expectTypeOf<
			PathParamNames<`/orgs/${number}/users/:id/posts/:postId`>
		>().toEqualTypeOf<"id" | "postId">();
	});

	it("is never for a plain string", () => {
		expectTypeOf<PathParamNames<string>>().toBeNever();
	});

	it("only matches whole segments", () => {
		expectTypeOf<PathParamNames<"/a:b/c">>().toBeNever();
		expectTypeOf<
			PathParamNames<"/files/:name.json">
		>().toEqualTypeOf<"name.json">();
	});
});

describe("PathParams", () => {
	it("requires one key per param", () => {
		expectTypeOf<PathParams<"/users/:id/posts/:postId">>().toEqualTypeOf<{
			readonly id: string | number;
			readonly postId: string | number;
		}>();
	});

	it("is empty without params", () => {
		expectTypeOf<PathParams<"/users">>().toEqualTypeOf<{}>();
	});
});
