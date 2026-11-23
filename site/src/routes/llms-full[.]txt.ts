import { createFileRoute } from "@tanstack/react-router";

import { currentPages, docsLlms } from "@/lib/source";

export const Route = createFileRoute("/llms-full.txt")({
	server: {
		handlers: {
			GET: async () =>
				new Response(
					(await Promise.all(currentPages().map(docsLlms.page))).join(
						"\n\n",
					),
					{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
				),
		},
	},
});
