#!/usr/bin/env node
// Moves a project from Effetch's flat main entry (0.1.0-rc.3 and before) to
// the `Fetch` namespace (0.1.0-rc.4). See `migrate.mjs` for what it changes.

import { execFileSync } from "node:child_process";
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { migrateSources } from "./migrate.mjs";

const usage = `Usage: effetch-migrate [--dry-run] [path ...]

Moves imports of @monarcode/effetch to the Fetch namespace (0.1.0-rc.4):

  import * as Fetch from "@monarcode/effetch"
  import { HttpError, type Client } from "@monarcode/effetch"

become

  import { Fetch } from "@monarcode/effetch"

with each use of a named import, such as HttpError, written as
Fetch.HttpError.

Paths are files or directories, the current directory by default. It
reads .ts, .tsx, .mts, .cts, .js, .jsx, .mjs and .cjs files. In a git
repository, it reads the files git sees, so it skips what .gitignore
does. Elsewhere, it skips node_modules, dist, build, coverage and hidden
directories. It uses the project's own TypeScript, so run it where
TypeScript is installed.

It lists what it can't rewrite, such as a dynamic import() or a JSDoc
type, with its line, for you to change by hand.

Options:
  --dry-run   List the files it would change, and change none.
  --help      Show this help.`;

/** Directories skipped outside a git repository. */
const SKIPPED = new Set(["node_modules", "dist", "build", "coverage"]);

/** The directories skipped outside a git repository, to report them. */
const skipped = new Set();

/** The files it reads. */
const EXTENSIONS = [
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
];

/** TypeScript, from the project first, then from next to this script. */
const loadTypeScript = () => {
	for (const from of [
		path.join(process.cwd(), "package.json"),
		import.meta.url,
	]) {
		try {
			return createRequire(from)("typescript");
		} catch {
			// Try the next place.
		}
	}
	console.error(
		"effetch-migrate needs TypeScript. Install it in the project (pnpm add -D typescript), or run it from a directory where it's installed.",
	);
	process.exit(1);
};

const isSource = (fileName) =>
	EXTENSIONS.some((extension) => fileName.endsWith(extension)) &&
	!fileName.split(/[\\/]/).includes("node_modules");

/** `true` when git ignores `directory` itself, which it then lists nothing in. */
const ignoredByGit = (directory) => {
	try {
		execFileSync("git", ["check-ignore", "-q", "."], {
			cwd: directory,
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
};

/**
 * The files git sees under `directory`: tracked, or untracked and not
 * ignored. `undefined` outside a git repository, or in a directory git
 * ignores.
 */
const gitFilesIn = (directory) => {
	if (ignoredByGit(directory)) {
		return undefined;
	}
	let output;
	try {
		output = execFileSync(
			"git",
			["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
			{
				cwd: directory,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			},
		);
	} catch {
		return undefined;
	}
	return output
		.split("\0")
		.filter((file) => file !== "" && isSource(file))
		.map((file) => path.join(directory, file))
		.filter((file) => existsSync(file))
		.sort();
};

/**
 * The files under `directory` outside a git repository: not in
 * `node_modules`, `dist`, `build`, `coverage` or hidden directories.
 */
const walk = (directory) =>
	readdirSync(directory, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name))
		.flatMap((entry) => {
			const full = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				if (entry.name.startsWith(".") || SKIPPED.has(entry.name)) {
					if (
						entry.name !== "node_modules" &&
						!entry.name.startsWith(".")
					) {
						skipped.add(path.relative(process.cwd(), full));
					}
					return [];
				}
				return walk(full);
			}
			return entry.isFile() && isSource(entry.name) ? [full] : [];
		});

/**
 * The files `target` names: itself, or, for a directory, the files git
 * sees there, or, outside a repository, the files `walk` finds.
 */
const filesIn = (target) => {
	let stats;
	try {
		stats = statSync(target);
	} catch {
		console.error(`effetch-migrate: no such file or directory: ${target}`);
		process.exit(1);
	}
	if (stats.isFile()) {
		return [target];
	}
	if (!stats.isDirectory()) {
		return [];
	}
	return gitFilesIn(target) ?? walk(target);
};

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
	console.log(usage);
	process.exit(0);
}
const dryRun = args.includes("--dry-run");
const unknown = args.filter(
	(arg) => arg.startsWith("-") && arg !== "--dry-run",
);
if (unknown.length > 0) {
	console.error(`Unknown option: ${unknown.join(", ")}\n\n${usage}`);
	process.exit(1);
}
const targets = args.filter((arg) => !arg.startsWith("-"));

const files = new Set(
	(targets.length === 0 ? ["."] : targets).flatMap((target) =>
		filesIn(path.resolve(target)),
	),
);
const sources = [...files]
	.map((fileName) => ({ fileName, text: readFileSync(fileName, "utf8") }))
	// The main entry only, not `@monarcode/effetch/plugins` or another
	// package such as `@monarcode/effetch-query`.
	.filter(({ text }) => /(["'`])@monarcode\/effetch\1/.test(text));

const results = migrateSources(loadTypeScript(), sources);
const changed = results.filter((result) => result.changed);
for (const result of changed) {
	if (!dryRun) {
		writeFileSync(result.fileName, result.text);
	}
	console.log(
		`${dryRun ? "Would update" : "Updated"} ${path.relative(process.cwd(), result.fileName)}`,
	);
}
const warnings = results.flatMap((result) =>
	result.warnings.map(
		({ line, message }) =>
			`${path.relative(process.cwd(), result.fileName)}:${line}: ${message}`,
	),
);
for (const warning of warnings) {
	console.warn(`Check ${warning}`);
}
if (skipped.size > 0) {
	console.log(
		`\nSkipped, as build output: ${[...skipped].join(", ")}. Pass a path to read one.`,
	);
}
console.log(
	`\n${changed.length} of ${sources.length} files importing @monarcode/effetch ${dryRun ? "would change" : "changed"}${warnings.length > 0 ? `, ${warnings.length} to check by hand` : ""}.`,
);
if (!dryRun && changed.length > 0) {
	console.log(
		"Run your formatter and type checker: rewritten lines may need reflowing.",
	);
}
