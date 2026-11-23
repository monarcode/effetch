import * as Twoslash from "fumadocs-twoslash/ui";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { TypeTable } from "fumadocs-ui/components/type-table";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";

// Every name in an example is a hover target, hundreds a page, so they stay
// out of the tab order: the code reads the same without its hovers.
function PopupTrigger(props: ComponentProps<typeof Twoslash.PopupTrigger>) {
	return <Twoslash.PopupTrigger {...props} tabIndex={-1} />;
}

export function getMDXComponents(components?: MDXComponents) {
	return {
		...defaultMdxComponents,
		...Twoslash,
		PopupTrigger,
		Accordion,
		Accordions,
		Step,
		Steps,
		Tab,
		Tabs,
		TypeTable,
		...components,
	} satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
