import { describe, expect, it } from "vitest";

import { isAbsoluteUrl, joinUrl } from "../src/internal/url.js";

describe("isAbsoluteUrl", () => {
	it("is true for http and https URLs", () => {
		expect(isAbsoluteUrl("http://a.test/x")).toBe(true);
		expect(isAbsoluteUrl("https://a.test/x")).toBe(true);
		expect(isAbsoluteUrl("HTTPS://a.test")).toBe(true);
	});

	it("is false for everything else", () => {
		expect(isAbsoluteUrl("/x")).toBe(false);
		expect(isAbsoluteUrl("x")).toBe(false);
		expect(isAbsoluteUrl("//a.test/x")).toBe(false);
		expect(isAbsoluteUrl("ftp://a.test/x")).toBe(false);
		expect(isAbsoluteUrl("https:/a.test")).toBe(false);
		expect(isAbsoluteUrl("httpx://a.test")).toBe(false);
		expect(isAbsoluteUrl("/redirect?to=https://a.test")).toBe(false);
	});
});

describe("joinUrl", () => {
	it("joins with exactly one slash", () => {
		expect(joinUrl("https://a.test", "/x")).toBe("https://a.test/x");
		expect(joinUrl("https://a.test/", "/x")).toBe("https://a.test/x");
		expect(joinUrl("https://a.test", "x")).toBe("https://a.test/x");
		expect(joinUrl("https://a.test/", "x")).toBe("https://a.test/x");
		expect(joinUrl("https://a.test///", "///x")).toBe("https://a.test/x");
	});

	it("keeps a base path", () => {
		expect(joinUrl("https://a.test/api/v1", "/todos/1")).toBe(
			"https://a.test/api/v1/todos/1",
		);
		expect(joinUrl("https://a.test/api/v1/", "todos")).toBe(
			"https://a.test/api/v1/todos",
		);
	});

	it("keeps a trailing slash on the path", () => {
		expect(joinUrl("https://a.test", "/x/")).toBe("https://a.test/x/");
	});

	it("joins the root path", () => {
		expect(joinUrl("https://a.test", "/")).toBe("https://a.test/");
		expect(joinUrl("https://a.test", "")).toBe("https://a.test/");
	});

	it("returns the path when there is no base", () => {
		expect(joinUrl(undefined, "/x")).toBe("/x");
		expect(joinUrl(undefined, "https://a.test/x")).toBe("https://a.test/x");
		expect(joinUrl(undefined, "//a.test/x")).toBe("//a.test/x");
	});

	it("does not prepend the base to an absolute URL", () => {
		expect(joinUrl("https://a.test", "https://b.test/x")).toBe(
			"https://b.test/x",
		);
		expect(joinUrl("https://a.test", "http://b.test:3000/x")).toBe(
			"http://b.test:3000/x",
		);
	});

	it("keeps a protocol-relative path under the base", () => {
		expect(joinUrl("https://a.test", "//evil.test/x")).toBe(
			"https://a.test/evil.test/x",
		);
	});

	it("does not rewrite the scheme's slashes in the base", () => {
		expect(joinUrl("http://localhost:3000", "/x")).toBe(
			"http://localhost:3000/x",
		);
	});
});
