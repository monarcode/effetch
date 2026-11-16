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

/**
 * The bundler turns `export * as FetchTest from "./FetchTest.js"` into a
 * `declare namespace FetchTest_d_exports` and drops the JSDoc on the
 * export, so hovers on `FetchTest` would show no docs. This puts the doc
 * from the source on the namespace, and fails the build if the output has
 * changed shape.
 */
const documentNamespaces = (outDir: string) => {
	const namespaces = [
		{
			name: "FetchTest",
			source: "src/test/index.ts",
			out: "test/FetchTest.d.ts",
		},
	];
	for (const { name, source, out } of namespaces) {
		const doc = new RegExp(
			`/\\*\\*(?:(?!\\*/)[\\s\\S])*\\*/(?=\\s*export \\* as ${name} )`,
		).exec(readFileSync(source, "utf8"))?.[0];
		const target = path.join(outDir, out);
		const text = readFileSync(target, "utf8");
		const declaration = `declare namespace ${name}_d_exports {`;
		if (doc === undefined || !text.includes(declaration)) {
			throw new Error(
				`Can't document the ${name} namespace: no JSDoc on its export in ${source}, or no "${declaration}" in dist/${out}`,
			);
		}
		writeFileSync(
			target,
			text.replace(declaration, `${doc}\n${declaration}`),
		);
	}
};

export default defineConfig({
	entry: ["src/index.ts", "src/plugins/index.ts", "src/test/index.ts"],
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
		"build:done": (ctx) => {
			documentNamespaces(ctx.options.outDir);
			formatDeclarations(ctx.options.outDir);
		},
	},
});
