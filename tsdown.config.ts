import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "tsdown";

const formatDeclarations = (outDir: string) => {
	const files = readdirSync(outDir, { recursive: true, encoding: "utf8" });
	for (const file of files.filter((name) => name.endsWith(".d.ts"))) {
		const target = path.join(outDir, file);
		const formatted = execFileSync(
			"oxfmt",
			[`--stdin-filepath=${path.basename(file)}`],
			{ input: readFileSync(target, "utf8"), encoding: "utf8" },
		);
		writeFileSync(target, formatted);
	}
};

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
	hooks: {
		"build:done": (ctx) => formatDeclarations(ctx.options.outDir),
	},
});
