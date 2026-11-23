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

export default defineConfig(({ command }) => ({
	define: { __PACKAGE_VERSION__: JSON.stringify(version) },
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
}));
