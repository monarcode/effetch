import { createFileRoute } from "@tanstack/react-router";

import { GITHUB, Header } from "@/components/landing/chrome";
import {
	Closing,
	Compare,
	Footer,
	Hero,
	Narrowing,
	Paths,
	Specifications,
} from "@/components/landing/sections";
import { SpecimenProvider } from "@/components/landing/specimen";
import { loadLanding } from "@/lib/landing";
import { HOME_IMAGE_PATH } from "@/lib/og";
import { pageHead, SITE_URL, websiteJsonLd } from "@/lib/shared";

import { version } from "../../../package.json";

const DESCRIPTION =
	"Schema-driven HTTP calls on Effect v4's HttpClient: path params, object queries, decoded responses, typed errors and plugins.";

export const Route = createFileRoute("/")({
	loader: () => loadLanding(),
	head: () =>
		pageHead({
			title: "Effetch: typed HTTP calls for Effect",
			description: DESCRIPTION,
			path: "/",
			type: "website",
			image: HOME_IMAGE_PATH,
			jsonLd: [
				// The site's name, for search results.
				websiteJsonLd(),
				{
					"@context": "https://schema.org",
					"@type": "SoftwareSourceCode",
					name: "Effetch",
					description: DESCRIPTION,
					url: `${SITE_URL}/`,
					codeRepository: GITHUB,
					programmingLanguage: "TypeScript",
					license: "https://opensource.org/licenses/MIT",
					version,
				},
			],
		}),
	component: Home,
});

function Home() {
	const { specimen, paths, byHand, withEffetch, narrowing } =
		Route.useLoaderData();
	return (
		<div className="spec flex min-h-svh flex-col">
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:border focus:border-rule focus:bg-ink focus:px-4 focus:py-2"
			>
				Skip to content
			</a>
			<Header />
			<main id="main" className="flex-1">
				<SpecimenProvider specimen={specimen}>
					<Hero />
				</SpecimenProvider>
				<Compare byHand={byHand} withEffetch={withEffetch} />
				<Paths paths={paths} />
				<Narrowing example={narrowing} />
				<Specifications version={version} />
				<Closing />
			</main>
			<Footer />
		</div>
	);
}
