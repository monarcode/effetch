import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Header } from "@/components/landing/chrome";

/**
 * A path with no page, and two ways back, under the landing page's
 * masthead, whose search finds a page by name.
 */
export function NotFound() {
	return (
		<div className="spec flex min-h-screen flex-col">
			<Header />
			<main className="spec-column flex flex-1 flex-col">
				<div className="mt-16 sm:mt-24">
					<h1 className="max-w-[18ch] text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.03em] text-balance sm:text-[3.5rem]">
						<span className="block font-light text-steel">
							This path has
						</span>
						no page.
					</h1>
					<p className="mt-6 max-w-[46ch] text-[17px] leading-[1.55] text-steel">
						It may have moved. Search, at the top, finds a page by name,
						or start again from the docs.
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
						{/* Exact, or a missing docs page would mark this link current. */}
						<Link
							to="/docs/$"
							params={{ _splat: "" }}
							activeOptions={{ exact: true }}
							className="group inline-flex h-12 items-center gap-3 bg-lime px-6 text-[16px] font-semibold text-ink transition-transform duration-150 active:translate-y-px"
						>
							Read the docs
							<ArrowRight
								className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-1"
								strokeWidth={2.25}
								aria-hidden="true"
							/>
						</Link>
						<Link
							to="/"
							className="inline-flex min-h-11 items-center text-[15px] text-steel underline decoration-rule underline-offset-4 transition-colors duration-150 hover:text-paper hover:decoration-steel"
						>
							Home
						</Link>
					</div>
				</div>
			</main>
		</div>
	);
}
