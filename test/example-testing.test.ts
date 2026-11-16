import { it } from "@effect/vitest";
import type * as Effect from "effect/Effect";

import { describe } from "vitest";

import * as Testing from "../examples/testing.js";

// Runs `examples/testing.ts`, so its tests keep passing, not only compiling.
describe("examples/testing.ts", () => {
	const tests: Record<string, Effect.Effect<void, unknown>> = Testing;
	for (const [name, test] of Object.entries(tests)) {
		it.effect(name, () => test);
	}
});
