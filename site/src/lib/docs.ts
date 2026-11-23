import { defineDocs } from "fumadocs-mdx/macro";

/**
 * The compiled pages, which the browser loads to render a page. Apart from
 * `source.ts`, which only server code imports, so the page tree's loader
 * and its icons stay out of the browser's bundle.
 */
export const docs = defineDocs({
	dir: "content/docs",
	// Pages are MDX only: the docs check and the prerender list read `.mdx`.
	docs: {
		files: ["**/*.mdx"],
		async: true,
		// Each page's Markdown, for `llms.txt` and the `.md` routes.
		postprocess: { includeProcessedMarkdown: true },
	},
});
