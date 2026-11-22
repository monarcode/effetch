import { Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

import { baseOptions } from "@/lib/layout.shared";

/** A path with no page, and two ways back. */
export function NotFound() {
	return (
		<HomeLayout {...baseOptions()}>
			<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-16">
				<h1 className="text-3xl font-semibold">Page not found</h1>
				<p className="mt-3 text-fd-muted-foreground">
					The page may have moved. Search, at the top, finds it by name.
				</p>
				<div className="mt-6 flex flex-wrap gap-3">
					{/* Exact, or a missing docs page would mark this link current. */}
					<Link
						to="/docs/$"
						params={{ _splat: "" }}
						activeOptions={{ exact: true }}
						className="rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
					>
						Read the docs
					</Link>
					<Link
						to="/"
						className="rounded-md border px-4 py-2 text-sm font-medium"
					>
						Home
					</Link>
				</div>
			</main>
		</HomeLayout>
	);
}
