"use client";
import { useLocation } from "@tanstack/react-router";
import { useStaticSearch } from "fumadocs-core/search/client";
import {
	SearchDialog,
	SearchDialogClose,
	SearchDialogContent,
	SearchDialogHeader,
	SearchDialogIcon,
	SearchDialogInput,
	SearchDialogList,
	SearchDialogOverlay,
	type SharedProps,
} from "fumadocs-ui/components/dialog/search";

import { versionOfUrl } from "@/lib/shared";

/**
 * Searches the index that `/api/search` prerenders, in the browser: the site
 * is static files, with no server to query. It searches the release line
 * being read.
 */
export default function DefaultSearchDialog(props: SharedProps) {
	const { pathname } = useLocation();
	const search = useStaticSearch({ tag: versionOfUrl(pathname) });

	return (
		<SearchDialog {...search} {...props}>
			<SearchDialogOverlay />
			<SearchDialogContent>
				<SearchDialogHeader>
					<SearchDialogIcon />
					<SearchDialogInput />
					<SearchDialogClose />
				</SearchDialogHeader>
				<SearchDialogList />
			</SearchDialogContent>
		</SearchDialog>
	);
}
