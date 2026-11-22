import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

import { baseOptions } from "@/lib/layout.shared";
import { pageMeta } from "@/lib/shared";

const TAGLINE = "Typed HTTP calls for Effect, without the boilerplate.";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: pageMeta(
			"Effetch: typed HTTP calls for Effect",
			"Schema-driven HTTP calls on Effect v4's HttpClient: path params, object queries, decoded responses, typed errors and plugins.",
		),
	}),
	component: Home,
});

// A placeholder until the landing page is designed.
function Home() {
	return (
		<HomeLayout {...baseOptions()}>
			<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-16">
				<h1 className="text-4xl font-semibold">Effetch</h1>
				<p className="mt-3 text-lg text-fd-muted-foreground">{TAGLINE}</p>
				<pre className="mt-6 overflow-x-auto rounded-md border bg-fd-card px-4 py-3 text-sm">
					<code>pnpm add @monarcode/effetch effect</code>
				</pre>
				<div className="mt-6">
					<Link
						to="/docs/$"
						params={{ _splat: "" }}
						className="rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
					>
						Read the docs
					</Link>
				</div>
			</main>
		</HomeLayout>
	);
}
