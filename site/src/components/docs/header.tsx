import { Link, useLocation } from "@tanstack/react-router";
import { useNotebookLayout } from "fumadocs-ui/layouts/notebook";
import { Menu } from "lucide-react";
import type { ComponentProps } from "react";

import {
	GITHUB,
	navLink,
	SearchButton,
	Wordmark,
} from "@/components/landing/chrome";

/** Whether a docs address is in the API reference, in any release line. */
function inReference(pathname: string) {
	return /^\/docs(?:\/[^/]+)?\/reference(?:\/|$)/.test(pathname);
}

/**
 * The docs' masthead: the landing page's, over the sidebar and the page,
 * so the two read as one site. It stands in for the notebook layout's
 * header slot, so it keeps that slot's contract: the header grid area,
 * sticky under any banner, the layout's header height, and the button that
 * opens the sidebar on phones. Its inset is the landing page's gutter, 16px
 * then 48px from 768px, so the mark and Search stay put on the way in.
 */
export function DocsHeader(props: ComponentProps<"header">) {
	const { slots } = useNotebookLayout();
	const { pathname } = useLocation();
	const reference = inReference(pathname);
	const current = navLink.replace("text-steel", "text-paper");
	const SidebarTrigger = slots.sidebar.trigger;

	return (
		<header
			{...props}
			id="nd-subnav"
			className="docs-masthead sticky top-(--fd-docs-row-1) z-30 bg-ink [grid-area:header] layout:[--fd-header-height:--spacing(16)] sm:layout:[--fd-header-height:--spacing(18)]"
		>
			<nav
				aria-label="Main"
				className="flex h-16 items-center gap-5 border-b border-rule px-4 sm:h-[4.5rem] sm:gap-8 md:px-12"
			>
				<Link
					to="/"
					aria-label="Effetch, home"
					className="flex items-center gap-5"
				>
					<Wordmark />
				</Link>
				<span className="spec-mono mr-auto border-l border-rule pl-5 text-[12px] leading-[1.35] text-steel max-lg:hidden">
					Typed HTTP calls for Effect
					<br />
					Documentation
				</span>
				<span className="mr-auto lg:hidden" />
				<Link
					to="/docs/$"
					params={{ _splat: "" }}
					activeOptions={{ exact: true }}
					className={`${reference ? navLink : current} max-md:hidden`}
				>
					Docs
				</Link>
				<Link
					to="/docs/$"
					params={{ _splat: "reference" }}
					activeOptions={{ exact: true }}
					className={`${reference ? current : navLink} max-md:hidden`}
				>
					Reference
				</Link>
				<a href={GITHUB} className={`${navLink} max-md:hidden`}>
					GitHub
				</a>
				<SearchButton />
				<SidebarTrigger className="-mr-2.5 grid size-11 place-items-center text-steel transition-colors duration-150 hover:text-paper md:hidden">
					<Menu className="size-5" strokeWidth={1.75} aria-hidden="true" />
				</SidebarTrigger>
			</nav>
		</header>
	);
}
