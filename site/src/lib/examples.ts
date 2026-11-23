import ts from "typescript";

/**
 * The compiler options examples are typed with: the root `tsconfig.json`'s,
 * which `check-docs` compiles the examples with, without `paths`. Those
 * point at `src`, and the types shown should be what readers get, the
 * built `dist` with the namespace docs the build puts back. Twoslash runs
 * from `root`, the repository, so `@monarcode/effetch` resolves to `dist`
 * through the package's `exports`.
 */
export function exampleCompilerOptions(root: string) {
	const file = `${root}tsconfig.json`;
	const { config, error } = ts.readConfigFile(file, ts.sys.readFile);
	if (error)
		throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
	const options = { ...config.compilerOptions };
	// The language service plugin is for editors.
	delete options.paths;
	delete options.plugins;
	return options as Record<string, unknown>;
}
