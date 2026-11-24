/**
 * Where the link-preview images are served. Plain values with no build
 * globals, so `vite.config.ts` can import them to list the images to
 * prerender.
 */

/** The size every link preview is drawn at: the Open Graph standard. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The landing page's image. */
export const HOME_IMAGE_PATH = "/og/home.png";

/**
 * A docs page's image: `/og/docs/calls/body.png`, and the first page's
 * `/og/docs/index.png`.
 */
export function pageImagePath(slugs: readonly string[]): string {
	return `/og/docs/${slugs.length === 0 ? "index" : slugs.join("/")}.png`;
}

/** The page slugs of an image URL's splat, from {@link pageImagePath}. */
export function decodeImagePath(splat: string | undefined): string[] {
	const slugs = (splat ?? "").split("/").filter(Boolean);
	if (slugs.length === 1 && slugs[0] === "index") return [];
	return slugs;
}

/**
 * The header the prerender sends to ask for an image as base64 text. The
 * prerender writes every response as text, which would corrupt a PNG's
 * bytes, so `vite.config.ts` decodes the text back into the file.
 */
export const IMAGE_AS_BASE64 = "x-effetch-image-as-base64";
