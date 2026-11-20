import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** The `export { … }` names inside a `declare namespace X { … }` block. */
const namesIn = (block: string): Array<string> => {
	const list = /export \{([^}]*)\}/.exec(block)?.[1];
	if (list === undefined) {
		throw new Error(`No export list in the namespace:\n${block}`);
	}
	return list
		.split(",")
		.map((name) => name.trim())
		.filter((name) => name !== "");
};

const nameOf = (entry: string) => entry.replace(/^type\s+/, "");

/**
 * Turns each `export * as Name from "./Module.js"` entry back into a real
 * namespace re-export, which the bundler rewrites:
 *
 * - In JS, it builds `Name` as one object holding every export
 *   (`__exportAll`), so bundlers keep all of them. This puts back
 *   `export * as Name from "./Module.js"`, which they tree-shake.
 * - In the declarations, it writes a `declare namespace Name_d_exports` in
 *   the module and drops the JSDoc on the export. A plain
 *   `export * as Name` in a `.d.ts` shows no docs on hover, so this moves
 *   the namespace into the entry, as `declare namespace Name`, with the
 *   JSDoc from the source, and has the module export its members flat.
 *   The flat module is what the `./Fetch` and `./test/FetchTest` subpaths
 *   point at, so TypeScript can name these types in a consumer's emitted
 *   declarations.
 *
 * It fails the build if the output has changed shape.
 */
const restoreNamespaces = (outDir: string) => {
	const namespaces = [
		{
			name: "Fetch",
			source: "src/index.ts",
			entry: "index",
			module: "Fetch",
		},
		{
			name: "FetchTest",
			source: "src/test/index.ts",
			entry: "test/index",
			module: "test/FetchTest",
		},
	];
	for (const { name, source, entry, module } of namespaces) {
		const fail = (problem: string): never => {
			throw new Error(`Can't restore the ${name} namespace: ${problem}`);
		};
		const doc =
			new RegExp(
				`/\\*\\*(?:(?!\\*/)[\\s\\S])*\\*/(?=\\s*export \\* as ${name} )`,
			).exec(readFileSync(source, "utf8"))?.[0] ??
			fail(`no JSDoc on its export in ${source}`);
		const specifier = `./${path.basename(module)}.js`;
		const read = (file: string) =>
			readFileSync(path.join(outDir, file), "utf8");
		const write = (file: string, text: string) =>
			writeFileSync(path.join(outDir, file), text);

		// JS: the entry re-exports the module as a namespace.
		const js = read(`${module}.js`);
		const exportAll = new RegExp(
			`var ${name}_exports = /\\* @__PURE__ \\*/ __exportAll\\(\\{[^}]*\\}\\);\\n`,
		);
		const runtimeImport = /import \{ __exportAll \} from "[^"]+";\n/;
		if (!exportAll.test(js) || !runtimeImport.test(js)) {
			fail(`no __exportAll object in dist/${module}.js`);
		}
		const flatJs = js
			.replace(exportAll, "")
			.replace(runtimeImport, "")
			.replace(new RegExp(`\\b${name}_exports, `), "");
		if (
			flatJs.includes("__exportAll") ||
			flatJs.includes(`${name}_exports`)
		) {
			fail(`dist/${module}.js still refers to the namespace object`);
		}
		write(`${module}.js`, flatJs);
		write(`${entry}.js`, `export * as ${name} from "${specifier}";\n`);

		// Declarations: the documented namespace moves to the entry.
		const dts = read(`${module}.d.ts`);
		const block =
			new RegExp(
				`declare namespace ${name}_d_exports \\{\\n[\\s\\S]*?\\n\\}\\n`,
			).exec(dts)?.[0] ??
			fail(
				`no "declare namespace ${name}_d_exports" in dist/${module}.d.ts`,
			);
		const members = namesIn(block);
		const finalExport =
			/export \{([^}]*)\};\s*$/.exec(dts) ??
			fail(`no final export list in dist/${module}.d.ts`);
		const exported = (finalExport[1] ?? "")
			.split(",")
			.map((entry) => entry.trim())
			.filter((entry) => entry !== "" && entry !== `${name}_d_exports`);
		// Members the module already exports, in its list or inline as
		// `export declare const layer`, aren't listed again.
		const names = new Set(exported.map(nameOf));
		const exportedInline = (member: string) =>
			new RegExp(
				`^export (?:declare )?(?:abstract )?(?:const|function|interface|type|class|namespace|enum) ${nameOf(member)}\\b`,
				"m",
			).test(dts);
		const flat = [
			...exported,
			...members.filter(
				(member) => !names.has(nameOf(member)) && !exportedInline(member),
			),
		];
		write(
			`${module}.d.ts`,
			dts
				.replace(block, "")
				.replace(
					finalExport[0],
					flat.length === 0 ? "" : `export { ${flat.join(", ")} };\n`,
				),
		);
		write(
			`${entry}.d.ts`,
			[
				`import { ${members.join(", ")} } from "${specifier}";`,
				doc,
				`declare namespace ${name} {`,
				`\texport { ${members.join(", ")} };`,
				"}",
				`export { ${name} };`,
				"",
			].join("\n"),
		);
	}
	const runtime = path.join(outDir, "_virtual");
	const files = readdirSync(outDir, { recursive: true, encoding: "utf8" });
	const usesRuntime = files.some(
		(file) =>
			file.endsWith(".js") &&
			readFileSync(path.join(outDir, file), "utf8").includes("_virtual/"),
	);
	if (!usesRuntime) {
		rmSync(runtime, { recursive: true, force: true });
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
			restoreNamespaces(ctx.options.outDir);
			formatDeclarations(ctx.options.outDir);
		},
	},
});
