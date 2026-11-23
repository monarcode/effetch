#!/usr/bin/env node
// Writes the docs site's API reference from the JSDoc: a page per namespace
// or entry point, listing every export with the first paragraph of its docs,
// grouped by the guide that covers it.
//
//   pnpm run docs:reference
//
// `check-docs` renders the same pages and fails when the files differ, so the
// reference can't fall behind the code. Don't edit the pages by hand.

import { execFileSync } from "node:child_process";
import { realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const OUT = "site/content/docs/(latest)/reference";
/** Where the type tables read the declarations: the site's workspace link. */
const DIST = "node_modules/@monarcode/effetch/dist";

/**
 * Each page: the module whose exports it lists, the name readers reach them
 * through, and its groups. An export's group comes from `names`, then from
 * the file that declares it; one that has neither fails the render, so a new
 * export can't be left off.
 */
const PAGES = [
	{
		slug: "fetch",
		title: "Fetch",
		description:
			"Every member of the Fetch namespace: clients, calls, errors, plugins, endpoints, streams and pages.",
		module: "src/Fetch.ts",
		qualifier: "Fetch",
		importLine: 'import { Fetch } from "@monarcode/effetch";',
		intro: "`@monarcode/effetch` exports one name, the `Fetch` namespace. Its members, grouped by the guide that covers them:",
		groups: [
			["Clients", ["Declare a client", "/docs/clients"]],
			["Calls", ["Methods", "/docs/calls"]],
			["Responses", ["Read the response", "/docs/calls/responses"]],
			["Uploads", ["Upload files", "/docs/calls/uploads"]],
			["Errors", ["Call errors", "/docs/errors"]],
			["Plugins", ["Write a plugin", "/docs/plugins/writing"]],
			[
				"Endpoints and services",
				["Endpoints or methods", "/docs/endpoints"],
			],
			["Streaming", ["Streaming responses", "/docs/streaming"]],
			["Pagination", ["Pagination", "/docs/pagination"]],
		],
		files: {
			"src/Client.ts": "Clients",
			"src/Service.ts": "Clients",
			"src/Options.ts": "Calls",
			"src/Path.ts": "Calls",
			"src/Output.ts": "Responses",
			"src/Input.ts": "Uploads",
			"src/Errors.ts": "Errors",
			"src/Status.ts": "Errors",
			"src/Plugin.ts": "Plugins",
			"src/Endpoint.ts": "Endpoints and services",
			"src/Endpoints.ts": "Endpoints and services",
			"src/Streams.ts": "Streaming",
			"src/Paginate.ts": "Pagination",
		},
		names: {
			CallError: "Errors",
			QuerySchema: "Endpoints and services",
			ResponseMode: "Responses",
			StatusError: "Errors",
			StatusErrorMap: "Errors",
			StatusErrorSchema: "Errors",
			StatusErrorServices: "Errors",
			Success: "Responses",
		},
	},
	{
		slug: "plugins",
		title: "Plugins",
		description:
			"Every export of @monarcode/effetch/plugins: the built-in plugins and their options.",
		module: "src/plugins/index.ts",
		intro: "`@monarcode/effetch/plugins` exports the built-in plugins, their options and the types they return:",
		groups: [
			["Bearer tokens", ["Refresh a token", "/docs/plugins/token-refresh"]],
			[
				"Retries",
				["Retry-After and a time limit", "/docs/plugins/retry-after"],
			],
			[
				"Time limits",
				["Choose a time limit", "/docs/plugins#choose-a-time-limit"],
			],
			[
				"Logging",
				["Built-in plugins", "/docs/plugins#what-each-plugin-does"],
			],
			[
				"Console logging",
				["Log to the console", "/docs/plugins/console-logging"],
			],
		],
		files: {
			"src/plugins/bearer.ts": "Bearer tokens",
			"src/plugins/retry.ts": "Retries",
			"src/plugins/timeout.ts": "Time limits",
			"src/plugins/logger.ts": "Logging",
			"src/plugins/consoleLogger.ts": "Console logging",
		},
		names: {},
	},
	{
		slug: "fetch-test",
		title: "FetchTest",
		description:
			"Every member of the FetchTest namespace: the fake backend for tests and the requests it records.",
		module: "src/test/FetchTest.ts",
		qualifier: "FetchTest",
		importLine: 'import { FetchTest } from "@monarcode/effetch/test";',
		intro: "`@monarcode/effetch/test` exports one name, the `FetchTest` namespace. Its members:",
		groups: [
			["Fake backend", ["Test with a fake backend", "/docs/testing"]],
			[
				"Recorded requests",
				["Check what was sent", "/docs/testing/requests"],
			],
		],
		files: { "src/test/FetchTest.ts": "Fake backend" },
		names: {
			Recorder: "Recorded requests",
			RequestBody: "Recorded requests",
			RequestQuery: "Recorded requests",
			requests: "Recorded requests",
			SentRequest: "Recorded requests",
		},
	},
];

/**
 * Interfaces that get a table of their properties: the options and settings
 * an app passes in, and the objects it reads or builds.
 */
const TABLE_SUFFIX = /(?:Options|Config|Settings|Context)$/;
const TABLES = new Set([
	"Client",
	"ConsoleLoggerCall",
	"ConsoleLoggerRedact",
	"EndpointDefinition",
	"Plugin",
	"RespondRequest",
	"SentRequest",
	"SseEvent",
	"TestEvent",
]);

/**
 * The reference: its pages by path from the repository root, formatted as
 * Oxfmt writes them, and the qualified name of every export they list, such
 * as `Fetch.make`, `bearer` and `Fetch.HttpError.With`. `program` must cover
 * each page's module; one is created when it's left out.
 */
export function renderReference(program = createProgram()) {
	const checker = program.getTypeChecker();
	const pages = PAGES.map((page) => collect(page, program, checker));
	const tabled = new Set(
		pages.flatMap((page) =>
			page.entries
				.filter((entry) => entry.table)
				.map((entry) => entry.short),
		),
	);
	for (const name of TABLES)
		if (!tabled.has(name))
			throw new Error(
				`reference-docs: TABLES lists ${name}, which isn't an exported interface`,
			);
	// Every entry's page and anchor, by symbol, for the JSDoc's links.
	const targets = new Map();
	for (const page of pages)
		for (const entry of page.entries)
			targets.set(entry.symbol, { page: page.slug, entry });
	const files = new Map();
	const names = [];
	for (const page of pages) {
		files.set(
			`${OUT}/${page.slug}.mdx`,
			format(render(page, checker, targets)),
		);
		names.push(...page.entries.map((entry) => entry.name));
	}
	return { files, names };
}

/** A page's entries, each with its symbol, group, anchor and declaration. */
function collect(page, program, checker) {
	const file = program.getSourceFile(path.join(root, page.module));
	if (!file)
		throw new Error(`reference-docs: ${page.module} isn't in the program`);
	const prefix = page.qualifier ? `${page.qualifier}.` : "";
	const entries = [];
	const exports = checker
		.getExportsOfModule(checker.getSymbolAtLocation(file))
		.sort(byName);
	for (const exported of exports) {
		const symbol = resolve(exported, checker);
		const declaration = documented(symbol);
		const source = path
			.relative(root, declaration.getSourceFile().fileName)
			.split(path.sep)
			.join("/");
		const group = Object.hasOwn(page.names, exported.name)
			? page.names[exported.name]
			: Object.hasOwn(page.files, source)
				? page.files[source]
				: undefined;
		if (!group)
			throw new Error(
				`reference-docs: no group for ${prefix}${exported.name} (${source}). Add it to the "${page.slug}" page in scripts/reference-docs.mjs.`,
			);
		if (!page.groups.some(([title]) => title === group))
			throw new Error(
				`reference-docs: ${prefix}${exported.name} is in the "${group}" group, which the "${page.slug}" page doesn't have`,
			);
		const entry = {
			name: `${prefix}${exported.name}`,
			short: exported.name,
			symbol,
			declaration,
			group,
			value: Boolean(symbol.flags & ts.SymbolFlags.Value),
			table:
				ts.isInterfaceDeclaration(declaration) &&
				(TABLE_SUFFIX.test(exported.name) || TABLES.has(exported.name)),
			source,
			members: [],
		};
		// A namespace merged with the export, such as `HttpError.With`.
		for (const member of namespaceMembers(symbol, checker))
			entry.members.push({
				name: `${entry.name}.${member.name}`,
				short: `${exported.name}.${member.name}`,
				symbol: member,
				declaration: documented(member),
				group,
				value: false,
				table: false,
				source,
				members: [],
			});
		entries.push(entry);
	}
	// Anchors: the name in lower case. A type that shares its name with a
	// value, as `Endpoint` does with `endpoint`, gets `-type`.
	const values = new Set(
		entries
			.filter((entry) => entry.value)
			.map((entry) => entry.short.toLowerCase()),
	);
	const ids = new Set(page.groups.map(([title]) => slug(title)));
	const assign = (entry) => {
		const id = entry.short.toLowerCase().replace(/\./g, "-");
		entry.id = !entry.value && values.has(id) ? `${id}-type` : id;
		if (ids.has(entry.id))
			throw new Error(
				`reference-docs: two headings on ${page.slug} have the ID "${entry.id}"`,
			);
		ids.add(entry.id);
	};
	for (const entry of entries) {
		assign(entry);
		entry.members.forEach(assign);
	}
	const used = new Set(entries.map((entry) => entry.group));
	for (const [title] of page.groups)
		if (!used.has(title))
			throw new Error(
				`reference-docs: the "${title}" group on ${page.slug} is empty`,
			);
	return {
		...page,
		entries: entries.flatMap((entry) => [entry, ...entry.members]),
		top: entries,
	};
}

function render(page, checker, targets) {
	const importLine =
		page.importLine ??
		`import { ${page.top
			.filter((entry) => entry.value)
			.map((entry) => entry.short)
			.join(", ")} } from "@monarcode/effetch/${page.slug}";`;
	let body = `---
title: ${JSON.stringify(page.title)}
description: ${JSON.stringify(page.description)}
---

{/* Written by scripts/reference-docs.mjs from the JSDoc. Run \`pnpm run docs:reference\` after changing it; don't edit this page. */}

${page.intro}

\`\`\`ts
${importLine}
\`\`\`
`;
	for (const [title, [guide, guideUrl]] of page.groups) {
		body += `\n## ${title} [#${slug(title)}]\n\nGuide: [${guide}](${guideUrl}).\n`;
		const entries = page.top
			.filter((entry) => entry.group === title)
			.sort((a, b) => Number(b.value) - Number(a.value) || byName(a, b));
		for (const entry of entries.flatMap((entry) => [
			entry,
			...entry.members,
		])) {
			body += `\n### ${entry.name} [#${entry.id}]\n\n${summaryOf(entry.declaration, page, checker, targets)}\n`;
			if (entry.table) {
				const declared = entry.source
					.replace(/^src\//, "")
					.replace(/\.ts$/, ".d.ts");
				body += `\n<auto-type-table path="${DIST}/${declared}" name="${entry.short}" />\n`;
			}
		}
	}
	return body;
}

/**
 * A declaration's first paragraph, with a list it introduces. A link to an
 * export on the reference becomes a link to its entry; others become code.
 */
function summaryOf(node, page, checker, targets) {
	const doc = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc).at(-1);
	const comment = doc?.comment;
	let text = "";
	for (const part of typeof comment === "string"
		? [{ text: comment }]
		: (comment ?? [])) {
		if (
			ts.isJSDocLink(part) ||
			ts.isJSDocLinkCode(part) ||
			ts.isJSDocLinkPlain(part)
		) {
			text += link(part, page, checker, targets);
		} else text += part.text;
	}
	const blocks = text.trim().split(/\n\s*\n/);
	const kept = [blocks[0] ?? ""];
	// A list right after the first paragraph finishes its sentence.
	if (/^\s*- /.test(blocks[1] ?? "")) kept.push(blocks[1]);
	return kept.map(toMarkdown).join("\n\n");
}

/**
 * A `{@link}` as Markdown, labelled as the JSDoc writes it, so the sentence
 * around it still reads ("an `HttpError`"). A URL stays a link.
 */
function link(part, page, checker, targets) {
	const written = part.name?.getText() ?? "";
	const url = /^https?$/.test(written) && part.text.startsWith("://");
	if (url) {
		const [address, ...words] = `${written}${part.text}`.trim().split(/\s+/);
		const label = words.join(" ").replace(/^\|\s*/, "");
		return `[${escapeMdx(label || address)}](${address})`;
	}
	const label = part.text.replace(/^\s*\|?\s*/, "").trim() || written;
	const symbol = part.name && checker.getSymbolAtLocation(part.name);
	const target = symbol && targets.get(resolve(symbol, checker));
	if (!target) return `\`${label}\``;
	const href =
		target.page === page.slug
			? `#${target.entry.id}`
			: `/docs/reference/${target.page}#${target.entry.id}`;
	return `[\`${label}\`](${href})`;
}

/** One block of JSDoc text as Markdown: list items keep their own lines. */
function toMarkdown(block) {
	const lines = [];
	for (const line of block.split("\n").map((part) => part.trim())) {
		if (lines.length === 0 || line.startsWith("- ")) lines.push(line);
		else lines[lines.length - 1] += ` ${line}`;
	}
	return lines.map(escapeMdx).join("\n");
}

/** Escapes what MDX would read as JSX or an expression, outside code spans. */
function escapeMdx(text) {
	return text
		.split(/(`[^`]*`)/)
		.map((part, index) =>
			index % 2 ? part : part.replace(/[{}<>]/g, (char) => `\\${char}`),
		)
		.join("");
}

function resolve(symbol, checker) {
	return symbol.flags & ts.SymbolFlags.Alias
		? checker.getAliasedSymbol(symbol)
		: symbol;
}

/** The declaration that carries the docs: an overload's, not its body's. */
function documented(symbol) {
	const declarations = symbol.declarations ?? [];
	const described = declarations.find((node) =>
		ts
			.getJSDocCommentsAndTags(node)
			.some(
				(doc) =>
					ts.isJSDoc(doc) && ts.getTextOfJSDocComment(doc.comment)?.trim(),
			),
	);
	const declaration = described ?? declarations[0];
	if (!declaration)
		throw new Error(`reference-docs: ${symbol.name} has no declaration`);
	return declaration;
}

/** The exported members of a namespace merged with a symbol, by name. */
function namespaceMembers(symbol, checker) {
	if (!(symbol.flags & ts.SymbolFlags.Namespace)) return [];
	return checker
		.getExportsOfModule(symbol)
		.filter((member) =>
			member.declarations?.some((node) => ts.isModuleBlock(node.parent)),
		)
		.sort(byName);
}

function byName(a, b) {
	const name = (item) => item.short ?? item.name;
	return (
		name(a).localeCompare(name(b), "en", { sensitivity: "base" }) ||
		name(a).localeCompare(name(b))
	);
}

function slug(title) {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/** The page as Oxfmt writes it, so `format:check` passes on what's written. */
function format(text) {
	return execFileSync(
		path.join(root, "node_modules", ".bin", "oxfmt"),
		["--stdin-filepath=reference.mdx"],
		{ cwd: root, input: text, encoding: "utf8" },
	);
}

function createProgram() {
	return ts.createProgram(
		PAGES.map((page) => path.join(root, page.module)),
		{
			strict: true,
			noEmit: true,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			target: ts.ScriptTarget.ES2022,
			skipLibCheck: true,
		},
	);
}

const invoked = process.argv[1] && realpathSync(process.argv[1]);
if (invoked === realpathSync(fileURLToPath(import.meta.url))) {
	const { files } = renderReference();
	for (const [file, body] of files) writeFileSync(path.join(root, file), body);
	console.log(`✓ wrote ${files.size} reference pages to ${OUT}`);
}
