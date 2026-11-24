import { createFileRoute } from "@tanstack/react-router";

import { HomeImage, imageResponse } from "@/lib/og-image";

// The landing page's link preview, prerendered from `vite.config.ts`'s list.
export const Route = createFileRoute("/og/home.png")({
	server: {
		handlers: {
			GET: ({ request }) => imageResponse(<HomeImage />, request),
		},
	},
});
