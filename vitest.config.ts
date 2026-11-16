import path from "node:path";

import { defineConfig } from "vitest/config";

const source = (file: string) => path.resolve(import.meta.dirname, "src", file);

export default defineConfig({
	resolve: {
		// The package's own entry points, from `src`, as `tsconfig.json`'s
		// `paths` has them, so the tests never run a stale `dist`.
		alias: [
			{ find: /^@monarcode\/effetch$/, replacement: source("index.ts") },
			{
				find: /^@monarcode\/effetch\/plugins$/,
				replacement: source("plugins/index.ts"),
			},
			{
				find: /^@monarcode\/effetch\/test$/,
				replacement: source("test/index.ts"),
			},
		],
	},
	test: {
		include: ["test/**/*.test.ts"],
		typecheck: {
			enabled: true,
			include: ["test/**/*.test-d.ts"],
			tsconfig: "./tsconfig.json",
		},
	},
});
