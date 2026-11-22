import { Link as RouterLink, useRouter } from "@tanstack/react-router";
import type { ComponentProps } from "react";

type LinkProps = ComponentProps<"a"> & { prefetch?: boolean };

/**
 * Fumadocs' TanStack Router link, marked current only on an exact match. The
 * router marks a link `aria-current="page"` when its path starts the
 * address, so the Introduction's `/docs` would be current on every page.
 */
export function Link({ href = "", prefetch = true, ...props }: LinkProps) {
	const router = useRouter();
	if (href.startsWith("#")) return <a href={href} {...props} />;
	const hashIndex = href.indexOf("#");
	const path = hashIndex === -1 ? href : href.slice(0, hashIndex);
	const searchIndex = path.indexOf("?");
	return (
		<RouterLink
			to={searchIndex === -1 ? path : path.slice(0, searchIndex)}
			search={
				searchIndex === -1
					? undefined
					: router.options.parseSearch(path.slice(searchIndex))
			}
			hash={hashIndex === -1 ? undefined : href.slice(hashIndex + 1)}
			preload={prefetch ? "intent" : false}
			activeOptions={{ exact: true }}
			{...props}
		/>
	);
}
