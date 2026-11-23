#!/usr/bin/env node
// Freezes a release line's docs into the site, so readers can still open
// them once the next line is current.
//
//   node scripts/snapshot-docs.mjs 0.1
//
// Run it while preparing the first release of a new line (for `0.2.0-rc.0`,
// snapshot `0.1`), and again after a later patch to that line. It takes the
// pages from the line's newest release tag, not from `main`, which already
// documents the new line, and that release's types from npm, so the
// snapshot's type tables show the line's own API.
//
// Options:
//   --tag v0.1.3      take the pages from this tag instead of the newest one
//   --worktree        take the pages from the working tree, to try the script
//                     before the line has a release (with --types)
//   --types 0.1.3     take the types from this published version instead of
//                     the tag's

import { execFileSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const docs = join(root, "site", "content", "docs");
const LATEST = "(latest)";
const PAGES = `site/content/docs/${LATEST}`;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		tag: { type: "string" },
		worktree: { type: "boolean", default: false },
		types: { type: "string" },
	},
});
const [line] = positionals;
if (!line || !/^\d+\.\d+$/.test(line))
	fail("Usage: node scripts/snapshot-docs.mjs <line>, such as 0.1");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const current = pkg.version.split(".").slice(0, 2).join(".");
if (line === current && !values.worktree)
	fail(
		`${line} is the current line (package.json is ${pkg.version}). Snapshot a line once the next one has started.`,
	);

if (
	values.tag !== undefined &&
	!new RegExp(`^v${line.replace(".", "\\.")}\\.\\d+(-[\\w.]+)?$`).test(
		values.tag,
	)
)
	fail(`--tag must be a v${line}.* release tag, such as v${line}.0`);
const tag = values.worktree ? undefined : (values.tag ?? newestTag(line));
const typesVersion = values.types ?? tag?.slice(1);
if (!typesVersion) fail("--worktree needs --types <published version>");

const scratch = mkdtempSync(join(tmpdir(), "snapshot-docs-"));
try {
	// Everything is built in the scratch folder first, so a failure, such as
	// npm being offline, leaves the existing snapshot as it was.
	const pages = join(scratch, "pages");
	const types = join(scratch, "types");
	copyPages(pages);
	copyTypes(types);
	const count = rewritePages(pages);
	// Titled by the release it was taken from, such as 0.1.3.
	setTitle(join(pages, "meta.json"), typesVersion);

	// Formatted like the rest of the pages, so `check` passes on the result.
	// The scratch folder is outside the repository, so name the config.
	execFileSync(
		join(root, "node_modules", ".bin", "oxfmt"),
		["--config", join(root, ".oxfmtrc.json"), "--write", pages],
		{
			cwd: root,
			stdio: "inherit",
		},
	);

	// Swapped in only once both are ready.
	const target = join(docs, line);
	const typesTarget = join(root, "site", "versions", line, "types");
	rmSync(target, { recursive: true, force: true });
	rmSync(typesTarget, { recursive: true, force: true });
	cpSync(pages, target, { recursive: true });
	cpSync(types, typesTarget, { recursive: true });
	console.log(
		`✓ ${line}: ${count} pages from ${tag ?? "the working tree"}, types from ${pkg.name}@${typesVersion}`,
	);
} catch (error) {
	console.error(`✗ ${error instanceof Error ? error.message : error}`);
	process.exitCode = 1;
} finally {
	rmSync(scratch, { recursive: true, force: true });
}

function fail(message) {
	console.error(`✗ ${message}`);
	process.exit(1);
}

/**
 * The line's newest release tag, by semver precedence: a release beats its
 * own prereleases, and `rc.1` beats `rc.0` and `alpha.8`.
 */
function newestTag(line) {
	const tags = execFileSync("git", ["tag", "--list", `v${line}.*`], {
		cwd: root,
		encoding: "utf8",
	})
		.split("\n")
		.filter((name) => /^v\d+\.\d+\.\d+(-[\w.]+)?$/.test(name));
	if (tags.length === 0) fail(`no v${line}.* tag: has ${line} been released?`);
	return tags.sort(compareVersions).at(-1);
}

function compareVersions(a, b) {
	const [coreA, preA] = splitVersion(a);
	const [coreB, preB] = splitVersion(b);
	const patch = Number(coreA.split(".")[2]) - Number(coreB.split(".")[2]);
	if (patch !== 0) return patch;
	if (preA === undefined || preB === undefined)
		return (preA === undefined ? 1 : 0) - (preB === undefined ? 1 : 0);
	const partsA = preA.split(".");
	const partsB = preB.split(".");
	for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
		const x = partsA[i];
		const y = partsB[i];
		// A shorter prerelease comes first: `rc` before `rc.0`.
		if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
		const numeric = /^\d+$/.test(x) && /^\d+$/.test(y);
		const order = numeric
			? Number(x) - Number(y)
			: x < y
				? -1
				: x > y
					? 1
					: 0;
		if (order !== 0) return order;
	}
	return 0;
}

function splitVersion(tag) {
	const dash = tag.indexOf("-");
	return dash === -1
		? [tag.slice(1)]
		: [tag.slice(1, dash), tag.slice(dash + 1)];
}

function copyPages(target) {
	if (!tag) {
		cpSync(join(docs, LATEST), target, { recursive: true });
		return;
	}
	const listed = execFileSync("git", ["ls-tree", "-d", tag, "--", PAGES], {
		cwd: root,
		encoding: "utf8",
	});
	if (!listed.trim()) throw new Error(`${tag} has no ${PAGES}`);
	const archive = execFileSync(
		"git",
		["archive", "--format=tar", tag, PAGES],
		{ cwd: root, maxBuffer: 1 << 28 },
	);
	const extracted = join(scratch, "archive");
	mkdirSync(extracted, { recursive: true });
	execFileSync("tar", ["-x", "-C", extracted], { input: archive });
	cpSync(join(extracted, PAGES), target, { recursive: true });
}

/** The published `.d.ts` files of the line's release, from npm. */
function copyTypes(types) {
	const file = execFileSync(
		"npm",
		[
			"pack",
			`${pkg.name}@${typesVersion}`,
			"--pack-destination",
			scratch,
			// A cache of its own, so it doesn't depend on the machine's.
			"--cache",
			join(scratch, "npm-cache"),
			"--silent",
		],
		{ cwd: scratch, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
	).trim();
	execFileSync("tar", ["-xzf", join(scratch, file), "-C", scratch]);
	cpSync(join(scratch, "package", "dist"), types, {
		recursive: true,
		filter: (path) => !/\.(js|map)$/.test(path),
	});
}

/**
 * Points the snapshot at itself: links into the docs, and type tables at its
 * own types. Its examples get no Twoslash hovers: the site adds them to
 * `(latest)` pages only, as theirs would come from the current package.
 */
function rewritePages(target) {
	let count = 0;
	for (const name of readdirSync(target, { recursive: true })) {
		if (!name.endsWith(".mdx")) continue;
		const path = join(target, name);
		const text = readFileSync(path, "utf8")
			.replace(/\]\(\/docs(?=[/#)])/g, `](/docs/${line}`)
			.replace(/href="\/docs(?=[/#"])/g, `href="/docs/${line}`)
			.replace(
				/path="node_modules\/@monarcode\/effetch\/dist\//g,
				`path="versions/${line}/types/`,
			);
		writeFileSync(path, text);
		count++;
	}
	return count;
}

function setTitle(path, title) {
	const meta = JSON.parse(readFileSync(path, "utf8"));
	writeFileSync(path, `${JSON.stringify({ ...meta, title }, null, "\t")}\n`);
}
