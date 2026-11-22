import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { NotFound } from "@/components/not-found";
import { NOT_FOUND_MARK, NOT_FOUND_PATH } from "@/lib/shared";

import { routeTree } from "./routeTree.gen";

/**
 * The host serves `404.html` at any unknown path. The router must start on
 * that page's route to hydrate it, not on the route the address matches.
 */
function servedNotFound() {
	if (typeof document === "undefined") return undefined;
	if (!document.querySelector(`meta[name="${NOT_FOUND_MARK}"]`)) {
		return undefined;
	}
	const asked = window.location.href;
	return {
		input: ({ url }: { url: URL }) => {
			if (url.href === asked) url.pathname = NOT_FOUND_PATH;
			return url;
		},
	};
}

export function getRouter() {
	return createTanStackRouter({
		routeTree,
		defaultPreload: "intent",
		scrollRestoration: true,
		defaultNotFoundComponent: NotFound,
		rewrite: servedNotFound(),
	});
}
