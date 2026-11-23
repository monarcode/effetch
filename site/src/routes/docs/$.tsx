import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { Callout } from "fumadocs-ui/components/callout";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
	MarkdownCopyButton,
	ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";
import { Suspense, use } from "react";

import { useMDXComponents } from "@/components/mdx";
import { docs } from "@/lib/docs";
import { baseOptions } from "@/lib/layout.shared";
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
		<DocsPage toc={toc}>
			{older && (
				<Callout type="warn">
					These docs are for Effetch {older.version}. The latest is{" "}
					{latestLabel()}:{" "}
					<Link to={older.latestUrl} className="font-medium underline">
						read this page there
					</Link>
					.
				</Callout>
			)}
			<DocsTitle>{page.title}</DocsTitle>
			<DocsDescription>{page.description}</DocsDescription>
			<div className="-mt-4 mb-2 flex flex-row items-center gap-2">
				<MarkdownCopyButton markdownUrl={markdownUrl} />
				<ViewOptionsPopover
					markdownUrl={markdownUrl}
					githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/site/content/docs/${encodeURI(path)}`}
				/>
			</div>
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
		<DocsLayout {...baseOptions()} tree={pageTree}>
			{/* For the prerender's crawler, which then writes every `.md` file. */}
			<Link to={markdownUrl} hidden />
			<Suspense>
				<Content path={path} markdownUrl={markdownUrl} older={older} />
			</Suspense>
		</DocsLayout>
	);
}
