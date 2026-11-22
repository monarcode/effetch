import { glob } from "node:fs/promises";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { getSlugs } from "fumadocs-core/source";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { defineConfig } from "vite";

// Every docs page, so the prerender doesn't depend on the sidebar linking to
// each one.
const docsPages: { path: string }[] = [];
for await (const entry of glob("**/*.mdx", { cwd: "content/docs" }))
	docsPages.push({ path: ["/docs", ...getSlugs(entry)].join("/") });

export default defineConfig({
	plugins: [
		fumadocsMdx(),
		tailwindcss(),
		tanstackStart({
			// Static files only: every page is prerendered to HTML at build time.
			prerender: { enabled: true, crawlLinks: true },
			// Routes no page links to, so the crawler doesn't find them.
			pages: [
				...docsPages,
				{ path: "/api/search" },
				// Written to `404.html` at the output's root.
				{ path: "/404", prerender: { autoSubfolderIndex: false } },
			],
		}),
		react(),
	],
	resolve: {
		tsconfigPaths: true,
	},
});
