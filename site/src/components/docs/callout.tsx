import {
	CircleCheck,
	CircleX,
	Info,
	Lightbulb,
	type LucideIcon,
	TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";

type Kind = "info" | "warning" | "error" | "success" | "idea";

/** Fumadocs' callout types, and the aliases it accepts. */
export type CalloutType = Kind | "warn" | "tip";

const KINDS: Record<Kind, { label: string; Icon: LucideIcon }> = {
	info: { label: "Note", Icon: Info },
	warning: { label: "Warning", Icon: TriangleAlert },
	error: { label: "Error", Icon: CircleX },
	success: { label: "Done", Icon: CircleCheck },
	idea: { label: "Tip", Icon: Lightbulb },
};

function kindOf(type: CalloutType): Kind {
	if (type === "warn") return "warning";
	if (type === "tip") return "info";
	return type;
}

/**
 * A note beside the text, in place of Fumadocs' callout: a ruled box with
 * no fill and no coloured bar. Its kind shows in its icon and its label,
 * and a warning's rule and label step up from rule grey to steel and paper,
 * so the kinds differ without a hue the brand doesn't use.
 */
export function Callout({
	type = "info",
	title,
	children,
}: {
	type?: CalloutType | undefined;
	title?: ReactNode;
	children?: ReactNode;
}) {
	const kind = kindOf(type);
	const { label, Icon } = KINDS[kind];
	return (
		<aside className="docs-callout not-prose" data-kind={kind}>
			<p className="docs-callout-title">
				<Icon
					className="docs-callout-icon"
					strokeWidth={1.75}
					aria-hidden="true"
				/>
				<span>{title ?? label}</span>
			</p>
			{children && <div className="docs-callout-body">{children}</div>}
		</aside>
	);
}
