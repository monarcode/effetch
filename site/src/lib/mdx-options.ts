import { sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createShikiHighlighter } from "fumadocs-core/highlight/shiki";
import { defaultShikiFactory } from "fumadocs-core/highlight/shiki/full";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import type { MDXPresetOptions } from "fumadocs-mdx/config";
import { transformerTwoslash } from "fumadocs-twoslash";
import { createGenerator, remarkAutoTypeTable } from "fumadocs-typescript";
import type { Element, Root, RootContent } from "hast";

import { exampleCompilerOptions } from "./examples.ts";

/*
 * How pages compile, for the build only: `vite.config.ts` hands these to
 * Fumadocs MDX as its global options. Kept out of `docs.ts`, which the
 * browser loads: the macro there drops only the `defineDocs` call, so its
 * imports, TypeScript among them, would ship to every reader.
 */

/** The repository's root: the package, its `dist` and `tsconfig.json`. */
const root = fileURLToPath(new URL("../../../", import.meta.url));
/** The site's own folder, which the type tables' paths start from. */
const site = fileURLToPath(new URL("../../", import.meta.url));

/**
 * What to do with a type error in an example. `vite build` fails, as
 * `check-docs` would, whatever `NODE_ENV` says. The dev server logs it and
 * shows the example without hovers instead: a thrown error stops the server
 * while a page is being written.
 */
function twoslashErrors(build: boolean) {
	return (error: unknown, code: string) => {
		if (build) throw error;
		console.error(error);
		return code;
	};
}

/**
 * A hover's docs: their first paragraph, and a list after it when the
 * paragraph doesn't end a sentence, as one ending in a colon doesn't.
 */
function firstParagraph(docs: string) {
	const [first = "", next = ""] = docs.split(/\n\s*\n/);
	return !/[.!?]\s*$/.test(first) && /^\s*- /.test(next)
		? `${first}\n\n${next}`
		: first;
}

/**
 * Formats a hover's type as fumadocs-twoslash's default does, except that a
 * namespace keeps its `namespace Fetch` line. The default drops it, which
 * leaves `Fetch` and `FetchTest` without a popup, and their docs unseen.
 */
function processHoverInfo(info: string) {
	const content = info
		.replace(/^\(([\w-]+)\)\s+/gm, "")
		.replace(/\nimport .*$/, "")
		.trim();
	if (/^namespace \w+$/.test(content)) return content;
	const rest = content.replace(/^(interface|namespace) \w+$/gm, "").trim();
	if (/^[A-Z]\w*(?:<[^>]*>)?:/.test(rest)) return `type ${rest}`;
	if (/^\w*\(/.test(rest)) return `function ${rest}`;
	return rest;
}

// Tags a hover leaves out: the page around it is the example.
const PAGE_TAGS = new Set(["example", "since"]);
// Twoslash's own opt-outs.
const OPT_OUT = /(?:^|\s)no-?twoslash(?:\s|$)/;
const LATEST = `${sep}(latest)${sep}`;

/**
 * Marks every `ts` block on a current page for Twoslash, so authors don't
 * have to, unless its meta says `no-twoslash`. Pages of an older release
 * line get no hovers: their examples would compile against the current
 * `dist` and fail the build once the API changes. Runs before `rehypeCode`.
 */
function rehypeTwoslashMeta() {
	return (tree: Root, file: { path?: string | undefined }) => {
		if (!file.path?.includes(LATEST)) return;
		visitCode(tree, (code) => {
			const meta = String(code.data?.meta ?? "");
			if (OPT_OUT.test(meta)) return;
			code.data = { ...code.data, meta: `${meta} twoslash`.trim() };
		});
	};
}

/**
 * Calls `visit` with the `code` of each `ts` block, including those in MDX
 * components such as `<Accordion>`, which aren't `element`s.
 */
function visitCode(node: Root | RootContent, visit: (code: Element) => void) {
	if (!("children" in node)) return;
	for (const child of node.children as RootContent[]) {
		const code = child.type === "element" ? child.children[0] : undefined;
		if (
			child.type === "element" &&
			child.tagName === "pre" &&
			code?.type === "element" &&
			code.tagName === "code" &&
			classes(code).includes("language-ts")
		)
			visit(code);
		else visitCode(child, visit);
	}
}

function classes(node: Element) {
	const value = node.properties.className;
	return Array.isArray(value) ? value.map(String) : [];
}

// The ink sheet's neutrals, as DESIGN.md names them.
const SKIN = "#c4c6ce";
const STEEL = "#8a8d99";
const PAPER = "#ecedf1";

/**
 * The code's colours: the landing page's greys by role, not a syntax theme,
 * so an example reads as part of the same sheet. Names and values in skin;
 * keywords, punctuation and comments in steel; strings, numbers and the
 * names a block declares in paper. Every one is at least 5.4:1 on ink.
 */
const inkTheme = {
	name: "effetch-ink",
	type: "dark" as const,
	colors: { "editor.background": "#16171d", "editor.foreground": SKIN },
	tokenColors: [
		{
			scope: [
				"keyword",
				"storage",
				"storage.type",
				"storage.modifier",
				"keyword.control",
				"keyword.operator.new",
				"keyword.operator.expression",
				"variable.language",
				"constant.language",
				"punctuation",
				"meta.brace",
				"keyword.operator",
				"storage.type.function.arrow",
				"comment",
				"punctuation.definition.comment",
			],
			settings: { foreground: STEEL },
		},
		{
			scope: [
				"string",
				"string.template",
				"punctuation.definition.string",
				"constant.numeric",
				"meta.definition.variable variable.other.constant",
				"meta.definition.variable variable.other.readwrite",
				"meta.definition.function entity.name.function",
				"entity.name.type.class",
				"entity.name.type.alias",
				"entity.name.type.interface",
			],
			settings: { foreground: PAPER },
		},
	],
};

/** The pages' MDX options; `build` is true for `vite build`. */
export const mdxOptions = (build: boolean): MDXPresetOptions => ({
	rehypeCodeOptions: {
		...rehypeCodeDefaultOptions,
		// The site is dark only; both slots take the one theme.
		themes: { light: inkTheme, dark: inkTheme },
		transformers: [
			...(rehypeCodeDefaultOptions.transformers ?? []),
			// Type hovers on every example. A type error fails the build. No
			// cache: it's keyed by the block, so it would hide a change to the
			// types.
			transformerTwoslash({
				twoslashOptions: {
					cwd: root,
					compilerOptions: exampleCompilerOptions(root),
				},
				rendererRich: { processHoverInfo },
				onTwoslashError: twoslashErrors(build),
			}),
			// A hover shows a name's type and its docs' first paragraph, with
			// the tags that say how to use it, such as `@default`. The export's
			// own example and its version stay out: the page is the example,
			// and every hover ships in the page. Runs before Twoslash renders
			// its popups.
			{
				name: "hover-docs",
				tokens() {
					for (const node of this.meta.twoslash?.nodes ?? []) {
						if (node.type !== "hover") continue;
						if (node.docs) node.docs = firstParagraph(node.docs);
						if (node.tags)
							node.tags = node.tags.filter(
								([name]) => !PAGE_TAGS.has(name),
							);
					}
				},
			},
		],
	},
	// Before `rehypeCode`, which highlights what it leaves.
	rehypePlugins: (plugins) => [rehypeTwoslashMeta, ...plugins],
	remarkPlugins: [
		[
			remarkAutoTypeTable,
			{
				// No cache: it's keyed by the page, not the types, so it would
				// keep showing an API that changed.
				generator: createGenerator({
					tsconfigPath: `${site}tsconfig.json`,
				}),
				// A table's `path` starts from the site, where the workspace
				// link `node_modules/@monarcode/effetch` points at the package.
				options: { basePath: site },
				// Its types in the pages' code colours, not Shiki's defaults.
				highlighter: createShikiHighlighter(
					() => defaultShikiFactory.getOrInit(),
					{
						themes: { light: inkTheme, dark: inkTheme },
						defaultColor: false,
					},
				),
			},
		],
	],
});
