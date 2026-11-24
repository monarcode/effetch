import { createFileRoute } from "@tanstack/react-router";

import { SITE_URL } from "@/lib/shared";
import { currentPages } from "@/lib/source";

// The landing page and the current release line's pages. Older lines are
// marked noindex, so they're left out.
export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () => {
				const urls = ["/", ...currentPages().map((page) => page.url)];
				return new Response(
					[
						'<?xml version="1.0" encoding="UTF-8"?>',
						'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
						...urls.map(
							(url) => `  <url><loc>${SITE_URL}${url}</loc></url>`,
						),
						"</urlset>",
						"",
					].join("\n"),
					{
						headers: { "Content-Type": "application/xml; charset=utf-8" },
					},
				);
			},
		},
	},
});
