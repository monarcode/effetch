import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/plugins/index.ts"],
	format: ["esm"],
	platform: "neutral",
	// Conservative for Hermes; Metro transpiles further anyway.
	target: "es2020",
	// Mirror src/ → dist/ so .d.ts files stay small and readable.
	unbundle: true,
	// .d.ts only, no declaration maps → Go to Definition lands on .d.ts.
	dts: { sourcemap: false },
	sourcemap: false,
	minify: false,
	clean: true,
	tsconfig: "tsconfig.build.json",
});
