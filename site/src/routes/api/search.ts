import { createFileRoute } from "@tanstack/react-router";
import { createFromSource } from "fumadocs-core/search/server";

import { versionOfPath } from "@/lib/shared";
import { source } from "@/lib/source";

// Each page is tagged with its release line, so search looks only in the
// version being read.
const server = createFromSource(source, {
	language: "english",
	buildIndex: async (page) => ({
		id: page.url,
		url: page.url,
		title: page.data.title ?? "",
		description: page.data.description,
		structuredData: await page.data.structuredData(),
		tag: versionOfPath(page.path),
	}),
});

// Prerendered to a static index, which the search dialog downloads.
export const Route = createFileRoute("/api/search")({
	server: { handlers: { GET: () => server.staticGET() } },
});
