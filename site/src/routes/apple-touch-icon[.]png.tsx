import { createFileRoute } from "@tanstack/react-router";

import { TOUCH_ICON_SIZE } from "@/lib/og";
import { imageResponse, TouchIcon } from "@/lib/og-image";

// The home-screen icon, prerendered from `vite.config.ts`'s list.
export const Route = createFileRoute("/apple-touch-icon.png")({
	server: {
		handlers: {
			GET: ({ request }) =>
				imageResponse(<TouchIcon />, request, TOUCH_ICON_SIZE),
		},
	},
});
