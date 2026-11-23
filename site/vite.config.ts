import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { getSlugs } from "fumadocs-core/source";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { defineConfig } from "vite";

import { mdxOptions } from "./src/lib/mdx-options.ts";

// Every docs page, including older lines, which only the version dropdown
// links to, so the crawler wouldn't find them.
const docsPages: { path: string }[] = [];
for await (const entry of glob("**/*.mdx", { cwd: "content/docs" }))
	docsPages.push({ path: ["/docs", ...getSlugs(entry)].join("/") });

// The package's version, which names the current docs in the version dropdown.
const { version } = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

// The live site, or, on a Cloudflare Pages preview (`main` and pull
// requests), the preview's own address, so its Markdown links stay on it.
const PRODUCTION = "https://effetch.pages.dev";
const preview =
	process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== "site";
const siteUrl = (preview && process.env.CF_PAGES_URL) || PRODUCTION;

export default defineConfig(({ command }) => ({
	define: {
		__PACKAGE_VERSION__: JSON.stringify(version),
		__SOURCE_REF__: JSON.stringify(process.env.CF_PAGES_COMMIT_SHA || "main"),
		__SITE_URL__: JSON.stringify(siteUrl),
	},
	plugins: [
		// The pages' MDX options run here, in the build, never in the browser.
		fumadocsMdx({
			globalOptions: { mdxOptions: mdxOptions(command === "build") },
		}),
		tailwindcss(),
		tanstackStart({
			// Static files only: every page is prerendered to HTML at build time.
			prerender: { enabled: true, crawlLinks: true },
			// Routes no page links to, so the crawler doesn't find them.
			pages: [
				...docsPages,
				{ path: "/api/search" },
				{ path: "/llms.txt" },
				{ path: "/llms-full.txt" },
				// Written to `404.html` at the output's root.
				{ path: "/404", prerender: { autoSubfolderIndex: false } },
			],
		}),
		react(),
	],
	resolve: {
		tsconfigPaths: true,
	},
	// The landing page reads its types with Twoslash while it prerenders.
	// TypeScript locates its own files from where it's installed, so it
	// stays out of the server bundle.
	ssr: {
		external: ["fumadocs-twoslash", "typescript"],
	},
}));
