import {
	findPath,
	flattenTree,
	getPageTreeRoots,
	type Folder,
	type Item,
} from "fumadocs-core/page-tree";
import { llms, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";

import { docs } from "./docs";
import {
	docsRoute,
	getPageMarkdownUrl,
	LATEST,
	latestLabel,
	SITE_URL,
	versionOfPath,
} from "./shared";

/** The page tree and page lookup. Import it from server code only. */
export const source = loader({
	source: docs.toFumadocsSource(),
	baseUrl: docsRoute,
	plugins: [
		lucideIconsPlugin(),
		{
			// The current line is named by the package's version, so the label
			// moves from "prerelease" to stable when the release ships.
			transformPageTree: {
				folder: (node, folderPath) =>
					node.root && versionOfPath(folderPath) === LATEST
						? { ...node, name: latestLabel() }
						: node,
			},
		},
	],
});

// Full URLs throughout: these files are read away from the site.
export const docsLlms = llms(source, {
	renderUrl: (node: Item) => {
		const page = source.getNodePage(node);
		if (page) return SITE_URL + getPageMarkdownUrl(page).url;
		return node.url.startsWith("/") ? SITE_URL + node.url : node.url;
	},
	renderPage: async (page) =>
		`# ${page.data.title} (${SITE_URL}${page.url})\n\n${plainMarkdown(await page.data.getText("processed"), page.url)}`,
});

/**
 * Rewrites what the processed Markdown keeps of the MDX, for a page at
 * `url`, outside code blocks: headings lose their anchor IDs, comments go, a
 * callout becomes a quote, an accordion's title becomes a bold line, a type
 * table keeps only its table, and links into the site, the page's own
 * anchors too, get its full URL.
 */
function plainMarkdown(text: string, url: string) {
	return text
		.split(/(^[ \t]*```[\s\S]*?^[ \t]*```[ \t]*$)/m)
		.map((part, index) => (index % 2 ? part : plainProse(part, url)))
		.join("");
}

function plainProse(text: string, url: string) {
	return (
		text
			.replace(/^(#+ .*) \[#[\w-]+\]$/gm, "$1")
			.replace(/^\{\/\*[\s\S]*?\*\/\}\n+/gm, "")
			.replace(
				/^<Callout\b([^>]*)>\n([\s\S]*?)\n<\/Callout>$/gm,
				(_, attributes: string, body: string) => {
					const title = /\btitle="([^"]*)"/.exec(attributes)?.[1];
					const quoted = title ? `**${title}**\n\n${body}` : body;
					return quoted
						.split("\n")
						.map((line) => (line ? `> ${line}` : ">"))
						.join("\n");
				},
			)
			.replace(/^<\/?Accordions>\n/gm, "")
			.replace(/^<Accordion title="([^"]*)">$/gm, "**$1**\n")
			.replace(/^<\/Accordion>\n/gm, "")
			// A type table's Markdown repeats the entry's heading and docs
			// before its table: `### Fetch.ClientConfig` … `### ClientConfig`.
			.replace(
				/^(### (?:\w+\.)*(\w+)\n(?:(?!^### )[\s\S])*?)^### \2\n(?:(?!^### )[\s\S])*?(?=^\| Prop )/gm,
				"$1",
			)
			.replace(/\]\(#/g, `](${SITE_URL}${url}#`)
			.replace(/\]\(\/(?!\/)/g, `](${SITE_URL}/`)
	);
}

/**
 * The folders the page at `url` sits in, outermost first, without the
 * release line's root, each with the URL of its first page. A folder whose
 * first page is this page is left out, since it would name the page twice.
 */
export function pageFolders(url: string): { name: string; url: string }[] {
	const path = findPath(
		source.getPageTree().children,
		(node) => node.type === "page" && node.url === url,
	);
	return (path ?? []).flatMap((node) => {
		if (node.type !== "folder" || node.root) return [];
		const first = node.index ?? flattenTree(node.children)[0];
		if (!first || first.url === url) return [];
		return [{ name: String(node.name), url: first.url }];
	});
}

/**
 * The current release line's root folder in the sidebar. `llms.txt` lists
 * only its pages, so readers and LLMs don't get an older line's API beside
 * the current one.
 */
export function currentFolder(): Folder {
	const folder = getPageTreeRoots(source.getPageTree()).find(
		(root): root is Folder => {
			if (root.type !== "folder") return false;
			const first = flattenTree([root])[0];
			const page = first && source.getNodePage(first);
			return versionOfPath(page?.path ?? "") === LATEST;
		},
	);
	if (!folder) throw new Error("The docs have no current release line");
	return folder;
}

/**
 * The current release line's pages, in the sidebar's order. Fails on a page
 * its `meta.json` doesn't list, which would be missing from `llms.txt`.
 */
export function currentPages() {
	const pages = flattenTree([currentFolder()]).flatMap(
		(node) => source.getNodePage(node) ?? [],
	);
	const listed = new Set(pages.map((page) => page.path));
	const unlisted = source
		.getPages()
		.filter(
			(page) =>
				versionOfPath(page.path) === LATEST && !listed.has(page.path),
		);
	if (unlisted.length > 0)
		throw new Error(
			`Add these pages to their folder's meta.json: ${unlisted.map((page) => page.path).join(", ")}`,
		);
	return pages;
}
