import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: { title: "Effetch" },
		githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
	};
}
