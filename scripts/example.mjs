// Runs one of the examples: `pnpm example <name> [args...]`.
//
// An example with a `main.ts` is a program. It imports `@monarcode/effetch`,
// which Node resolves to `dist` through the package's `exports`, so this
// builds `dist` first when `src` is newer. Node runs the example's `.ts`
// files as they are, which needs Node.js 22.18 or later.
//
// An example with a `package.json`, such as `store-react`, is an app: this
// starts its dev server, which reads Effetch from `src`.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examples = path.join(root, "examples");

/** Whether the example is an app with a dev server, rather than a program. */
const isApp = (name) => existsSync(path.join(examples, name, "package.json"));

const names = readdirSync(examples, { withFileTypes: true })
	.filter(
		(entry) =>
			entry.isDirectory() &&
			(isApp(entry.name) ||
				existsSync(path.join(examples, entry.name, "main.ts"))),
	)
	.map((entry) => entry.name)
	.sort();

const [name, ...args] = process.argv.slice(2);

if (name === undefined || !names.includes(name)) {
	console.error(
		`${name === undefined ? "Name an example" : `No example "${name}"`}: pnpm example <name> [args...]\n\nExamples: ${names.join(", ")}`,
	);
	process.exit(1);
}

if (isApp(name)) {
	// From the app's folder, so a space in the path doesn't split the
	// command where Windows needs a shell.
	const dev = spawnSync("pnpm", ["run", "dev", ...args], {
		cwd: path.join(examples, name),
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	if (dev.error) {
		console.error(`Couldn't run pnpm to start the app: ${dev.error.message}`);
		process.exit(1);
	}
	process.exit(dev.status ?? 1);
}

if (!process.features.typescript) {
	console.error(
		`Node.js ${process.versions.node} can't run TypeScript files. Use Node.js 22.18 or later.`,
	);
	process.exit(1);
}

/** The newest modification time of the files under `dir`, in ms. */
const newest = (dir) =>
	Math.max(
		...readdirSync(dir, { withFileTypes: true, recursive: true })
			.filter((entry) => entry.isFile())
			.map(
				(entry) =>
					statSync(path.join(entry.parentPath, entry.name)).mtimeMs,
			),
	);

const built = path.join(root, "dist", "index.js");
if (
	!existsSync(built) ||
	statSync(built).mtimeMs < newest(path.join(root, "src"))
) {
	console.error("› Building the package first");
	const build = spawnSync("pnpm", ["run", "--silent", "build"], {
		cwd: root,
		stdio: ["ignore", "ignore", "inherit"],
		// pnpm is a `.cmd` shim on Windows, which needs a shell.
		shell: process.platform === "win32",
	});
	if (build.error) {
		console.error(
			`Couldn't run pnpm to build the package: ${build.error.message}`,
		);
		process.exit(1);
	}
	if (build.status !== 0) process.exit(build.status ?? 1);
}

const run = spawnSync(
	process.execPath,
	[path.join(examples, name, "main.ts"), ...args],
	{ cwd: root, stdio: "inherit" },
);
process.exit(run.status ?? 1);
