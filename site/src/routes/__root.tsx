import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";

import { Link } from "@/components/link";
import SearchDialog from "@/components/search";
import { TOUCH_ICON_PATH } from "@/lib/og";

import appCss from "@/styles/app.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Effetch" },
			// The default; `pageHead` sets each page's own.
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "Effetch" },
			{ property: "og:locale", content: "en_US" },
			// The browser's chrome in the page's ink.
			{ name: "theme-color", content: "#16171d" },
			// Proves to Google Search Console that we own the site.
			{
				name: "google-site-verification",
				content: "7y8trQGlcdjBScPh8lbUxFfgVqx62EJ03olqqGvcmrE",
			},
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
			{ rel: "apple-touch-icon", href: TOUCH_ICON_PATH },
		],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		// The theme script sets the class before the first paint.
		<html lang="en" className="dark" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="flex flex-col min-h-screen">
				<RootProvider
					components={{ Link }}
					search={{ SearchDialog }}
					// Dark only: the brand is ink and lime.
					theme={{
						forcedTheme: "dark",
						defaultTheme: "dark",
						enableSystem: false,
						hotKey: false,
					}}
				>
					<Outlet />
				</RootProvider>
				<Scripts />
			</body>
		</html>
	);
}
