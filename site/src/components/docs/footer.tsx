import { useLocation } from "@tanstack/react-router";
import { useFooterItems } from "fumadocs-ui/utils/use-footer-items";
import type { ReactNode } from "react";

import { Link } from "@/components/link";

type Item = { name: ReactNode; url: string; description?: ReactNode };

function normalize(url: string) {
	return url.length > 1 && url.endsWith("/") ? url.slice(0, -1) : url;
}

function PagerItem({ item, label }: { item: Item; label: string }) {
	return (
		<Link
			href={item.url}
			rel={label === "Next" ? "next" : "prev"}
			className="docs-pager-item"
			data-direction={label.toLowerCase()}
		>
			<span className="docs-pager-label">{label}</span>
			<span className="docs-pager-title">{item.name}</span>
			{item.description && (
				<span className="docs-pager-description">{item.description}</span>
			)}
		</Link>
	);
}

/**
 * The page's foot: the previous and next pages as two ruled rows, each a
 * label, the title in paper and its whole description, in place of
 * Fumadocs' cards. The page order is the sidebar's.
 */
export function DocsFooter() {
	const list = useFooterItems();
	const { pathname } = useLocation();
	const index = list.findIndex(
		(item) => normalize(item.url) === normalize(pathname),
	);
	if (index === -1) return null;
	const previous = list[index - 1];
	const next = list[index + 1];
	if (!previous && !next) return null;

	return (
		<nav aria-label="Previous and next pages" className="docs-pager">
			{previous && <PagerItem item={previous} label="Previous" />}
			{next && <PagerItem item={next} label="Next" />}
		</nav>
	);
}
