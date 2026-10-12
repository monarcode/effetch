import { describe, expect, it } from "vitest";

import * as Fetch from "../src/index.js";
import * as Plugins from "../src/plugins/index.js";

describe("public entry points", () => {
	it("@monarcode/effetch exports exactly these values", () => {
		expect(Object.keys(Fetch).sort()).toEqual([
			"DecodeError",
			"HttpError",
			"NetworkError",
			"isFetchError",
			"make",
			"plugin",
		]);
	});

	it("@monarcode/effetch/plugins exports exactly these values", () => {
		expect(Object.keys(Plugins).sort()).toEqual([
			"TimeoutError",
			"bearer",
			"logger",
			"retry",
			"timeout",
		]);
	});
});
