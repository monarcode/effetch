import { createFileRoute } from "@tanstack/react-router";

import { SITE_URL } from "@/lib/shared";
import { currentFolder, docsLlms } from "@/lib/source";

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
						`Each link is a page as Markdown, in the order the docs read. [llms-full.txt](${SITE_URL}/llms-full.txt) has every page in one file. They cover the newest release of \`@monarcode/effetch\`.`,
						"",
						...(folder.index ? [docsLlms.indexNode(folder.index)] : []),
						...folder.children.map((node) => docsLlms.indexNode(node)),
					].join("\n"),
					{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
				);
			},
		},
	},
});
