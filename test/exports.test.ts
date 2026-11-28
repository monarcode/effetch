import { describe, expect, it } from "vitest";

import * as Root from "../src/index.js";
import * as Plugins from "../src/plugins/index.js";
import * as Test from "../src/test/index.js";

describe("public entry points", () => {
	it("@monarcode/effetch exports exactly these values", () => {
		expect(Object.keys(Root)).toEqual(["Fetch"]);
		expect(Object.keys(Root.Fetch).sort()).toEqual([
			"DecodeError",
			"Endpoints",
			"HttpError",
			"NetworkError",
			"Service",
			"UploadFile",
			"bytes",
			"catchStatus",
			"endpoint",
			"errorCodec",
			"isFetchError",
			"isService",
			"make",
			"multipart",
			"optional",
			"paginate",
			"plugin",
			"text",
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

	it("@monarcode/effetch/test exports exactly these values", () => {
		expect(Object.keys(Test)).toEqual(["FetchTest"]);
		expect(Object.keys(Test.FetchTest).sort()).toEqual([
			"Recorder",
			"fail",
			"layer",
			"reply",
			"requests",
			"respond",
		]);
	});
});
