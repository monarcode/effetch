import { createFileRoute } from "@tanstack/react-router";
import { createFromSource } from "fumadocs-core/search/server";

import { source } from "@/lib/source";

const server = createFromSource(source, { language: "english" });

// Prerendered to a static index, which the search dialog downloads.
export const Route = createFileRoute("/api/search")({
	server: { handlers: { GET: () => server.staticGET() } },
});
