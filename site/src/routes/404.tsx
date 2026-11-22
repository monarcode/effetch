import { createFileRoute } from "@tanstack/react-router";

import { NotFound } from "@/components/not-found";
import { NOT_FOUND_MARK } from "@/lib/shared";

// Prerendered to `404.html`, which the host serves for any unknown path.
export const Route = createFileRoute("/404")({
	component: NotFound,
	head: () => ({
		meta: [
			{ title: "Not found | Effetch" },
			{ name: "robots", content: "noindex" },
			{ name: NOT_FOUND_MARK, content: "" },
		],
	}),
});
