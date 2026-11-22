export const docsRoute = "/docs";

/** A page's title and description, for the browser and for link previews. */
export function pageMeta(title: string, description: string) {
	return [
		{ title },
		{ name: "description", content: description },
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
	];
}

/** The route prerendered to `404.html`, and the meta tag that marks it. */
export const NOT_FOUND_PATH = "/404";
export const NOT_FOUND_MARK = "effetch-not-found";

export const gitConfig = {
	user: "monarcode",
	repo: "effetch",
	branch: "main",
};
