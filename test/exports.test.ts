import { describe, expect, it } from "vitest";

import * as Fetch from "../src/index.js";
import * as Plugins from "../src/plugins/index.js";

describe("public entry points", () => {
	it("@monarcode/effetch exports exactly these values", () => {
		expect(Object.keys(Fetch).sort()).toEqual([
			"DecodeError",
			"Endpoints",
			"HttpError",
			"NetworkError",
			"Service",
			"endpoint",
			"isFetchError",
			"isService",
			"make",
			"plugin",
		]);
	});

	it("@monarcode/effetch/plugins exports exactly these values", () => {
		expect(Object.keys(Plugins).sort()).toEqual([
			"TimeoutError",
			"bearer",
			"consoleLogger",
			"logger",
			"retry",
			"timeout",
		]);
	});
});
