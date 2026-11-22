import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { Suspense, use } from "react";

import { useMDXComponents } from "@/components/mdx";
import { docs } from "@/lib/docs";
import { baseOptions } from "@/lib/layout.shared";
import { pageMeta } from "@/lib/shared";
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
			? pageMeta(`${loaderData.title} | Effetch`, loaderData.description)
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
		return {
			path: page.path,
			title: page.data.title ?? "",
			description: page.data.description ?? "",
			pageTree: await source.serializePageTree(source.getPageTree()),
		};
	});

function Content({ path }: { path: string }) {
	const page = docs.getPage(path);
	if (!page) throw new Error(`unknown page: ${path}`);

	const { toc } = use(page.load());
	const MDX = page.body;

	return (
		<DocsPage toc={toc}>
			<DocsTitle>{page.title}</DocsTitle>
			<DocsDescription>{page.description}</DocsDescription>
			<DocsBody>
				<MDX components={useMDXComponents()} />
			</DocsBody>
		</DocsPage>
	);
}

function Page() {
	const { pageTree, path } = useFumadocsLoader(Route.useLoaderData());

	return (
		<DocsLayout {...baseOptions()} tree={pageTree}>
			<Suspense>
				<Content path={path} />
			</Suspense>
		</DocsLayout>
	);
}
