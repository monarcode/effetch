import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const source = (file: string) =>
	path.resolve(import.meta.dirname, "../../src", file);

export default defineConfig({
	plugins: [react()],
	resolve: {
		// Effetch from the repository's `src`, as the tests use it, so the app
		// never runs a stale build.
		alias: [
			{ find: /^@monarcode\/effetch$/, replacement: source("index.ts") },
			{
				find: /^@monarcode\/effetch\/plugins$/,
				replacement: source("plugins/index.ts"),
			},
		],
	},
});
