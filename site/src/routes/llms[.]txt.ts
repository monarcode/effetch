import { createFileRoute } from "@tanstack/react-router";
import type { Folder } from "fumadocs-core/page-tree";

import { gitConfig, SITE_URL } from "@/lib/shared";
import { currentFolder, docsLlms } from "@/lib/source";

const GITHUB = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

/**
 * The docs as the sidebar groups them: one H2 section per separator, as
 * llms.txt sections its links. The pages before the first separator are
 * the place to start.
 */
function sections(folder: Folder): string[] {
	const lines = ["", "## Get started", ""];
	if (folder.index) lines.push(docsLlms.indexNode(folder.index));
	for (const node of folder.children) {
		if (node.type === "separator")
			lines.push("", `## ${String(node.name)}`, "");
		else lines.push(docsLlms.indexNode(node));
	}
	return lines;
}

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: () => {
				const folder = currentFolder();
				return new Response(
					[
						"# Effetch",
						"",
						"> Typed HTTP calls for Effect, without the boilerplate. You give Effetch a path and a schema. It fills in the path, builds the query, sends the request, checks the status and decodes the response. What you get back is an Effect that's typed end to end, errors included.",
						"",
						`Each link in the sections up to Optional is a page as Markdown, in the order the docs read. [llms-full.txt](${SITE_URL}/llms-full.txt) has every page in one file. They cover the newest release of \`@monarcode/effetch\`.`,
						...sections(folder),
						"",
						"## Optional",
						"",
						`- [Changelog](https://raw.githubusercontent.com/${gitConfig.user}/${gitConfig.repo}/${gitConfig.ref}/CHANGELOG.md): What changed in each release, and what to change in your code, as Markdown.`,
						`- [Source on GitHub](${GITHUB}): The package's source, its tests and runnable examples.`,
						"- [Package on npm](https://www.npmjs.com/package/@monarcode/effetch): The published versions of `@monarcode/effetch`.",
						"",
					].join("\n"),
					{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
				);
			},
		},
	},
});
