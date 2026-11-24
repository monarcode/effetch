export const docsRoute = "/docs";

/** The site's structured-data node, which every page's data refers to. */
export function websiteJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		"@id": `${SITE_URL}/#website`,
		name: "Effetch",
		url: `${SITE_URL}/`,
	};
}

/** What {@link pageHead} needs to describe a page. */
export interface PageHeadInput {
	title: string;
	description: string;
	/** The page's path, such as `/docs/calls/body`: its canonical URL. */
	path: string;
	/** `article` for a docs page, `website` for the landing page. */
	type: "website" | "article";
	/** The path of its link-preview image (see `lib/og.ts`). */
	image?: string | undefined;
	/** The path of the page as Markdown, for LLMs and agents. */
	markdown?: string | undefined;
	/** Its structured data, for search engines. */
	jsonLd?: readonly object[] | undefined;
}

/**
 * A page's head: its title and description, for the browser, search
 * engines and link previews, with the canonical URL each of them should
 * use. Full URLs throughout, since these are read away from the site.
 */
export function pageHead(page: PageHeadInput) {
	const url = SITE_URL + page.path;
	return {
		meta: [
			{ title: page.title },
			{ name: "description", content: page.description },
			{ property: "og:title", content: page.title },
			{ property: "og:description", content: page.description },
			{ property: "og:url", content: url },
			{ property: "og:type", content: page.type },
			...(page.image
				? [
						{ property: "og:image", content: SITE_URL + page.image },
						{ property: "og:image:width", content: "1200" },
						{ property: "og:image:height", content: "630" },
						{ property: "og:image:alt", content: page.title },
						{ name: "twitter:card", content: "summary_large_image" },
					]
				: []),
		],
		// Written into the page as is, so `<` is escaped: a string can't end
		// the script.
		scripts: (page.jsonLd ?? []).map((data) => ({
			type: "application/ld+json",
			children: JSON.stringify(data).replace(/</g, "\\u003c"),
		})),
		links: [
			{ rel: "canonical", href: url },
			...(page.markdown
				? [
						{
							rel: "alternate",
							type: "text/markdown",
							href: SITE_URL + page.markdown,
						},
					]
				: []),
		],
	};
}

/** The route prerendered to `404.html`, and the meta tag that marks it. */
export const NOT_FOUND_PATH = "/404";
export const NOT_FOUND_MARK = "effetch-not-found";

/** Set by `vite.config.ts` from the build's environment. */
declare const __SOURCE_REF__: string;
declare const __SITE_URL__: string;

export const gitConfig = {
	user: "monarcode",
	repo: "effetch",
	/**
	 * The commit the site was built from, so a page's GitHub link shows the
	 * source it was built from: on the live site, the release's.
	 */
	ref: __SOURCE_REF__,
};

/**
 * Where this build is served: the live site, or a preview's own address.
 * `llms.txt` and the pages' Markdown need full URLs.
 */
export const SITE_URL = __SITE_URL__;

/** The URL of a page's Markdown, for LLMs and the copy button. */
export function getPageMarkdownUrl(page: { slugs: string[] }) {
	const segments = [...page.slugs];
	if (segments.length === 0) segments.push("index.md");
	else segments[segments.length - 1] += ".md";
	return { segments, url: [docsRoute, ...segments].join("/") };
}

/** The page slugs of a Markdown URL from {@link getPageMarkdownUrl}. */
export function decodeMarkdownUrl(segments: string[]) {
	if (segments.length === 0) return [];
	const out = [...segments];
	out[out.length - 1] = out[out.length - 1]!.replace(/\.md$/, "");
	if (out.length === 1 && out[0] === "index") out.pop();
	return out;
}

/** The search tag and version of the current release line's pages. */
export const LATEST = "latest";

/**
 * The version dropdown's label for a release: `0.1.0` once it's stable, and
 * `0.1.0 prerelease` for an alpha, beta or release candidate of it.
 */
export function versionLabel(release: string): string {
	const [stable, prerelease] = release.split("-", 2);
	return prerelease ? `${stable} prerelease` : stable!;
}

/** Set by `vite.config.ts` from the package's `package.json`. */
declare const __PACKAGE_VERSION__: string;

/** The current line's label, from the package's version as the site builds. */
export function latestLabel(): string {
	return versionLabel(__PACKAGE_VERSION__);
}

/**
 * The release line a page belongs to: its version folder (`0.1`), or
 * {@link LATEST} for the current line in `(latest)`.
 */
export function versionOfPath(path: string): string {
	const folder = path.split("/")[0]!;
	return folder.startsWith("(") ? LATEST : folder;
}

/** The release line a docs URL shows, such as `/docs/0.1/…`. */
export function versionOfUrl(pathname: string): string {
	const segment = /^\/docs\/([^/]+)/.exec(pathname)?.[1];
	return segment && /^\d+\.\d+$/.test(segment) ? segment : LATEST;
}
