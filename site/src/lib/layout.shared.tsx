import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: { title: "Effetch" },
		// Dark only.
		themeSwitch: { enabled: false },
		githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
	};
}
