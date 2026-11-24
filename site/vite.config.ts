import { readFileSync } from "node:fs";
import { glob, readFile, writeFile } from "node:fs/promises";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { getSlugs } from "fumadocs-core/source";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { defineConfig } from "vite";

import { mdxOptions } from "./src/lib/mdx-options.ts";
import {
	HOME_IMAGE_PATH,
	IMAGE_AS_BASE64,
	pageImagePath,
	TOUCH_ICON_PATH,
} from "./src/lib/og.ts";

// The link-preview images. The prerender writes each response as text,
// which would corrupt a PNG, so it asks for the image as base64 and this
// writes the bytes over the text it saved.
const imagePrerender = {
	headers: { [IMAGE_AS_BASE64]: "true" },
	onSuccess: async ({
		page,
		html,
	}: {
		page: { path: string };
		html: string;
	}) => {
		const file = new URL(`./dist/client${page.path}`, import.meta.url);
		// The text must be where the prerender saved it, or the site would
		// ship base64 as the image.
		const saved = await readFile(file, "utf8").catch(() => undefined);
		if (saved !== html)
			throw new Error(
				`The prerender didn't save ${page.path} in dist/client, so its image can't be written`,
			);
		await writeFile(file, Buffer.from(html, "base64"));
	},
};

// Every docs page, including older lines, which only the version dropdown
// links to, so the crawler wouldn't find them, and each page's image.
const docsPages: { path: string; prerender?: typeof imagePrerender }[] = [];
for await (const entry of glob("**/*.mdx", { cwd: "content/docs" })) {
	const slugs = getSlugs(entry);
	docsPages.push({ path: ["/docs", ...slugs].join("/") });
	docsPages.push({ path: pageImagePath(slugs), prerender: imagePrerender });
}

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
			// Static files only: every page is prerendered to HTML at build time,
			// as `docs/calls/body.html` rather than `docs/calls/body/index.html`.
			// Cloudflare Pages serves the file at `/docs/calls/body`, the URL every
			// link uses; a folder's `index.html` would redirect it to a URL with a
			// trailing slash.
			prerender: {
				enabled: true,
				crawlLinks: true,
				autoSubfolderIndex: false,
			},
			// Routes no page links to, so the crawler doesn't find them.
			pages: [
				...docsPages,
				{ path: HOME_IMAGE_PATH, prerender: imagePrerender },
				{ path: TOUCH_ICON_PATH, prerender: imagePrerender },
				{ path: "/api/search" },
				{ path: "/llms.txt" },
				{ path: "/llms-full.txt" },
				{ path: "/robots.txt" },
				{ path: "/sitemap.xml" },
				// Written to `404.html` at the output's root.
				{ path: "/404" },
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
