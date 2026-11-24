import { createFileRoute, notFound } from "@tanstack/react-router";
import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";

import { decodeImagePath } from "@/lib/og";
import { DocsImage, imageResponse } from "@/lib/og-image";
import { LATEST, versionOfPath } from "@/lib/shared";
import { source } from "@/lib/source";

// Each docs page's link preview. `vite.config.ts` lists every one for the
// prerender, since pages name them only in a meta tag, which the crawler
// doesn't follow.
export const Route = createFileRoute("/og/docs/{$}.png")({
	server: {
		handlers: {
			GET: ({ params, request }) => {
				const slugs = decodeImagePath(params._splat);
				const page = source.getPage(slugs);
				if (!page) throw notFound();

				// Where the page sits: its folders, and an older line's version.
				const folders = getBreadcrumbItems(page.url, source.getPageTree())
					.filter((item) => item.url !== page.url)
					.map((item) => String(item.name));
				const version = versionOfPath(page.path);
				const section = [
					"Docs",
					...(version === LATEST ? [] : [version]),
					...folders,
				].join(" / ");

				return imageResponse(
					<DocsImage
						section={section}
						title={page.data.title ?? ""}
						description={page.data.description ?? ""}
						path={page.url}
					/>,
					request,
				);
			},
		},
	},
});
