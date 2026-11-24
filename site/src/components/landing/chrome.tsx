import { Link } from "@tanstack/react-router";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { ArrowRight, Check, Copy, Search } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { gitConfig } from "@/lib/shared";

import { Mark } from "./mark";

export const GITHUB = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;
export const INSTALL = "pnpm add @monarcode/effetch effect";

/** The mark and the name. */
export function Wordmark() {
	return (
		<span className="flex items-center gap-2.5">
			<Mark className="h-6 w-auto" />
			<span className="text-[19px] font-semibold tracking-[-0.01em] text-paper">
				Effetch
			</span>
		</span>
	);
}

/** A masthead link: steel, paper on hover. */
export const navLink =
	"inline-flex min-h-11 items-center text-[15px] text-steel transition-colors duration-150 hover:text-paper";

/** The masthead's search: a ruled button, with ⌘K from 640px. */
export function SearchButton({ className = "" }: { className?: string }) {
	const search = useSearchContext();
	if (!search.enabled) return null;
	return (
		<button
			type="button"
			onClick={() => search.setOpenSearch(true)}
			className={`inline-flex h-11 items-center gap-2.5 border border-rule px-3 text-[15px] text-steel transition-colors duration-150 hover:border-steel hover:text-paper ${className}`}
		>
			<Search className="size-4" strokeWidth={1.75} aria-hidden="true" />
			<span>Search</span>
			<kbd className="spec-mono text-[12px] max-sm:hidden">⌘K</kbd>
		</button>
	);
}

export function Header() {
	return (
		<header className="spec-column">
			<nav
				aria-label="Main"
				className="flex h-16 items-center gap-6 border-b border-rule sm:h-[4.5rem] sm:gap-8"
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
					A specimen of one call
				</span>
				<span className="mr-auto lg:hidden" />
				<Link to="/docs/$" params={{ _splat: "" }} className={navLink}>
					Docs
				</Link>
				<Link
					to="/docs/$"
					params={{ _splat: "reference" }}
					className={`${navLink} max-sm:hidden`}
				>
					Reference
				</Link>
				<a href={GITHUB} className={`${navLink} max-sm:hidden`}>
					GitHub
				</a>
				<SearchButton />
			</nav>
		</header>
	);
}

/** The install command, with a button that copies it. */
export function Install() {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	return (
		<div className="flex h-12 w-full max-w-[25rem] items-center border border-rule pl-4">
			<code className="spec-mono min-w-0 flex-1 overflow-x-auto text-[13px] whitespace-nowrap text-paper [scrollbar-width:none] max-[400px]:text-[12px]">
				<span aria-hidden="true" className="mr-2 text-steel">
					$
				</span>
				{INSTALL}
			</code>
			<button
				type="button"
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(INSTALL);
						setCopied(true);
						clearTimeout(timer.current);
						timer.current = setTimeout(() => setCopied(false), 1600);
					} catch {
						setCopied(false);
					}
				}}
				aria-label={copied ? "Copied" : "Copy the install command"}
				className="grid size-12 shrink-0 place-items-center text-steel transition-colors duration-150 hover:text-paper"
			>
				{copied ? (
					<Check
						className="spec-copied size-4 text-paper"
						strokeWidth={2}
						aria-hidden="true"
					/>
				) : (
					<Copy className="size-4" strokeWidth={1.75} aria-hidden="true" />
				)}
			</button>
			<span className="sr-only" aria-live="polite">
				{copied ? "Copied to the clipboard" : ""}
			</span>
		</div>
	);
}

/** The page's one primary action. */
export function GetStarted() {
	return (
		<Link
			to="/docs/$"
			params={{ _splat: "getting-started" }}
			className="group inline-flex h-12 items-center gap-3 bg-lime px-6 text-[16px] font-semibold text-ink transition-transform duration-150 active:translate-y-px"
		>
			Get started
			<ArrowRight
				className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-1"
				strokeWidth={2.25}
				aria-hidden="true"
			/>
		</Link>
	);
}

/** A section's opening: a hairline, the heading, and its lead beside it. */
export function SectionHead({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children?: ReactNode;
}) {
	return (
		<div className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-rule pt-6 lg:grid-cols-12">
			<h2
				id={id}
				className="text-[2rem] leading-[1.05] font-semibold tracking-[-0.025em] text-balance sm:text-[2.75rem] lg:col-span-7"
			>
				{title}
			</h2>
			{children && (
				<p className="max-w-[46ch] text-[17px] leading-[1.55] text-steel lg:col-span-5 lg:col-start-8 lg:pt-2">
					{children}
				</p>
			)}
		</div>
	);
}
