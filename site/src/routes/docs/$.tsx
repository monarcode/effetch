import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
	MarkdownCopyButton,
	ViewOptionsPopover,
} from "fumadocs-ui/layouts/notebook/page";
import { Suspense, use } from "react";

import { Callout } from "@/components/docs/callout";
import { DocsFooter } from "@/components/docs/footer";
import { DocsHeader } from "@/components/docs/header";
import { useMDXComponents } from "@/components/mdx";
import { docs } from "@/lib/docs";
import { baseOptions } from "@/lib/layout.shared";
import { pageImagePath } from "@/lib/og";
import {
	getPageMarkdownUrl,
	gitConfig,
	LATEST,
	latestLabel,
	pageMeta,
	versionOfPath,
} from "@/lib/shared";
// Used only by the server function's handler, which the client build drops.
import { source } from "@/lib/source";

export const Route = createFileRoute("/docs/$")({
	component: Page,
	loader: async ({ params }) => {
		const slugs = params._splat?.split("/") ?? [];
		const data = await pageData(slugs);
		await docs.getPage(data.path)?.preload();
		return data;
	},
	head: ({ loaderData }) => ({
		meta: loaderData
			? [
					...pageMeta(
						`${loaderData.title} | Effetch`,
						loaderData.description,
						pageImagePath(loaderData.slugs),
					),
					// Older lines stay out of search engines, which send readers
					// to the current docs instead.
					...(loaderData.older
						? [{ name: "robots", content: "noindex" }]
						: []),
				]
			: [],
	}),
});

/**
 * In the browser, a page's data is a JSON file. A missing page has none, so
 * the host answers with its 404 page, which fails to parse.
 */
async function pageData(slugs: string[]) {
	try {
		return await loader({ data: slugs });
	} catch (error) {
		if (error instanceof SyntaxError) throw notFound();
		throw error;
	}
}

const loader = createServerFn({ method: "GET" })
	.validator((slugs: string[]) => slugs)
	.middleware([staticFunctionMiddleware])
	.handler(async ({ data: slugs }) => {
		const page = source.getPage(slugs);
		if (!page) throw notFound();
		const version = versionOfPath(page.path);
		const older =
			version === LATEST
				? undefined
				: {
						version,
						// The same page in the current line, or its first page.
						latestUrl: source.getPage(slugs.slice(1))?.url ?? "/docs",
					};
		return {
			path: page.path,
			slugs: page.slugs,
			title: page.data.title ?? "",
			description: page.data.description ?? "",
			markdownUrl: getPageMarkdownUrl(page).url,
			pageTree: await source.serializePageTree(source.getPageTree()),
			older,
		};
	});

type Older = { version: string; latestUrl: string } | undefined;

function Content({
	path,
	markdownUrl,
	older,
}: {
	path: string;
	markdownUrl: string;
	older: Older;
}) {
	const page = docs.getPage(path);
	if (!page) throw new Error(`unknown page: ${path}`);

	const { toc } = use(page.load());
	const MDX = page.body;

	return (
		<DocsPage toc={toc} slots={{ footer: DocsFooter }}>
			{older && (
				<Callout type="warn" title="An older release">
					These docs are for Effetch {older.version}. The latest is{" "}
					{latestLabel()}:{" "}
					<Link to={older.latestUrl}>read this page there</Link>.
				</Callout>
			)}
			{/* The page's opening: its title, the lead and what you can do
			    with the page, closed by a hairline. */}
			<header className="docs-head">
				<DocsTitle>{page.title}</DocsTitle>
				<DocsDescription>{page.description}</DocsDescription>
				<div className="docs-actions">
					<MarkdownCopyButton markdownUrl={markdownUrl} />
					<ViewOptionsPopover
						markdownUrl={markdownUrl}
						githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.ref}/site/content/docs/${encodeURI(path)}`}
					/>
				</div>
			</header>
			<DocsBody>
				<MDX components={useMDXComponents()} />
			</DocsBody>
		</DocsPage>
	);
}

function Page() {
	const { pageTree, path, markdownUrl, older } = useFumadocsLoader(
		Route.useLoaderData(),
	);

	return (
		<DocsLayout
			{...baseOptions()}
			// The landing page's masthead, full width over the sidebar and page.
			nav={{ ...baseOptions().nav, mode: "top" }}
			slots={{ header: DocsHeader }}
			tree={pageTree}
		>
			{/* For the prerender's crawler, which then writes every `.md` file. */}
			<Link to={markdownUrl} hidden />
			<Suspense>
				<Content path={path} markdownUrl={markdownUrl} older={older} />
			</Suspense>
		</DocsLayout>
	);
}
