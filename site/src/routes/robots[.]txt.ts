import { createFileRoute } from "@tanstack/react-router";

import { SITE_URL } from "@/lib/shared";

// Every page is open to crawlers, for search and for AI answers that cite
// it; whether it can be used for training is left unsaid. The search
// index is data for the search box, not a page. Preview deploys need no
// rule here: Cloudflare marks them noindex.
export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: {
			GET: () =>
				new Response(
					[
						"User-agent: *",
						"Content-Signal: search=yes, ai-input=yes",
						"Allow: /",
						"Disallow: /api/",
						"",
						`Sitemap: ${SITE_URL}/sitemap.xml`,
						"",
					].join("\n"),
					{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
				),
		},
	},
});
