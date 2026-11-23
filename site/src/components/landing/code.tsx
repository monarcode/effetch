import type { CSSProperties } from "react";

import type { EffectParts, Example, Token } from "@/lib/landing";

/** Whether an element shows in the viewport now. */
export function onScreen(element: Element) {
	const rect = element.getBoundingClientRect();
	return rect.width > 0 && rect.top < innerHeight && rect.bottom > 0;
}

/** The `Effect` a query found, or a build error naming the query. */
export function effectOf(example: Example, name: string): EffectParts {
	const bone = example.bones.find((b) => b.name === name);
	if (!bone?.effect) throw new Error(`The example has no Effect for ${name}`);
	return bone.effect;
}

/** A token's text, with a break opportunity after each `.`, `(` and `/`. */
export function breakable(text: string) {
	const pieces = text.split(/(?<=[.(/])/);
	return pieces.map((piece, i) => (
		<span key={i}>
			{piece}
			{i < pieces.length - 1 && <wbr />}
		</span>
	));
}

/**
 * One line of code. When code wraps, a line breaks only after a `.`, a `(`
 * or a `/`, and its continuation hangs two columns past its indent.
 */
export function CodeLine({
	tokens,
	className = "",
}: {
	tokens: Token[];
	className?: string;
}) {
	const text = tokens.map((token) => token.text).join("");
	const indent = text.length - text.trimStart().length;
	return (
		<span
			className={`spec-code-line block ${className}`}
			style={{ "--indent": indent } as CSSProperties}
		>
			{tokens.map((token, j) => (
				<span key={j} className={`t-${token.role}`}>
					{breakable(token.text)}
				</span>
			))}
			{tokens.length === 0 && " "}
		</span>
	);
}

/** Code lines as the page sets them, coloured by role. */
export function CodeLines({ lines }: { lines: Token[][] }) {
	return (
		<code className="block">
			{lines.map((line, i) => (
				<CodeLine key={i} tokens={line} />
			))}
		</code>
	);
}
