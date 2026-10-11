import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/plugins/index.ts"],
	format: ["esm"],
	platform: "neutral",
	target: "es2020",
	unbundle: true,
	dts: { sourcemap: false },
	sourcemap: false,
	minify: false,
	clean: true,
	tsconfig: "tsconfig.build.json",
});
