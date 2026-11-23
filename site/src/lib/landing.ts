import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";
import { highlightHast } from "fumadocs-core/highlight";
import { transformerTwoslash } from "fumadocs-twoslash";
import type { Element, ElementContent } from "hast";

import { exampleCompilerOptions } from "./examples.ts";

/*
 * The landing page's code, and the types under it. Each example in
 * `site/landing/` is a program Twoslash compiles against the package's
 * build when the site is built, as it does the docs' examples, so a type
 * error fails the build. The types the page shows are the ones TypeScript
 * infers there, read from the `// ^?` queries under the names that get one.
 */

/** What a stretch of code is, for the page's monochrome code colours. */
export type Role = "text" | "keyword" | "string" | "punctuation";

export type Token = { text: string; role: Role };

/** A part of a type: the value a call succeeds with, an error, or neither. */
export type Tone = "plain" | "value" | "error";

export type Segment = { text: string; tone: Tone };

/**
 * An `Effect<A, E, R>` or a `Stream<A, E, R>` type in parts: what comes
 * before its arguments (`Effect<`, or a function's parameters and
 * `Effect<`), its arguments, and what follows them (`>`).
 */
export type EffectParts = {
	head: string;
	value: string;
	errors: string[];
	context: string;
	tail: string;
};

/** A name's inferred type, where the name sits in the code. */
export type Bone = {
	line: number;
	character: number;
	name: string;
	segments: Segment[];
	effect?: EffectParts;
};

export type Example = { lines: Token[][]; bones: Bone[] };

// Twoslash runs from the repository's root, where `dist` and
// `tsconfig.json` are. The build runs in the site's folder, and this file is
// bundled, so `import.meta.url` can't locate it.
const root = `${join(process.cwd(), "..")}/`;

// The code's colours, by role: greys, so the types are what stands out.
// Shiki needs a theme to tell the roles apart; the page sets the colours.
// Every one keeps at least 4.5:1 on ink.
const COLOURS: Record<string, Role> = {
	"#a3a6b1": "text",
	"#858894": "keyword",
	"#c4c6ce": "string",
	"#858895": "punctuation",
};

const codeTheme = {
	name: "landing-code",
	type: "dark" as const,
	colors: { "editor.background": "#16171d", "editor.foreground": "#a3a6b1" },
	tokenColors: [
		{
			scope: [
				"keyword",
				"storage",
				"storage.type",
				"storage.modifier",
				"keyword.control",
				"keyword.operator.new",
				"keyword.operator.expression",
				"variable.language",
			],
			settings: { foreground: "#858894" },
		},
		{
			scope: ["string", "string.template", "punctuation.definition.string"],
			settings: { foreground: "#c4c6ce" },
		},
		{
			scope: [
				"punctuation",
				"meta.brace",
				"keyword.operator",
				"storage.type.function.arrow",
			],
			settings: { foreground: "#858895" },
		},
	],
};

function textOf(node: ElementContent): string {
	if (node.type === "text") return node.value;
	if (node.type === "element") return node.children.map(textOf).join("");
	return "";
}

function roleOf(node: ElementContent): Role {
	if (node.type !== "element") return "text";
	const style = String(node.properties.style ?? "");
	const colour = /color:\s*(#[0-9a-f]{6})/i.exec(style)?.[1]?.toLowerCase();
	return (colour ? COLOURS[colour] : undefined) ?? "text";
}

/** The code's lines as tokens, coloured by role. */
async function tokenize(code: string): Promise<Token[][]> {
	const root = await highlightHast(code, { lang: "ts", theme: codeTheme });
	const pre = root.children.find(
		(node): node is Element => node.type === "element",
	);
	const codeElement = pre?.children.find(
		(node): node is Element => node.type === "element",
	);
	const lines = (codeElement?.children ?? []).filter(
		(node): node is Element => node.type === "element",
	);
	return lines.map((line) =>
		line.children
			.map((token) => ({ text: textOf(token), role: roleOf(token) }))
			.filter((token) => token.text.length > 0),
	);
}

/**
 * A query's text as the page shows it: on one line, without the kind of
 * name it is, and with Effetch's and Schema's types named as you'd write
 * them. TypeScript prints `HttpError.With` as `With`, and `Fetch.Client` as
 * `Client`.
 */
function typeText(text: string) {
	return text
		.replace(/^\((?:property|parameter|alias)\)\s+/, "")
		.replace(/^(?:const|let|var)\s+/, "")
		.replace(/\s*\n\s*/g, " ")
		.replace(/; \}/g, " }")
		.replace(/\bWith</g, "HttpError.With<")
		.replace(/\bClient</g, "Fetch.Client<")
		.replace(/\bPathParams</g, "Fetch.PathParams<")
		.replace(/\bStruct</g, "Schema.Struct<")
		.replace(/: Finite\b/g, ": Schema.Finite")
		.replace(/: String\b/g, ": Schema.String");
}

/** Splits `text` on `separator` where it isn't nested in brackets. */
function splitTopLevel(text: string, separator: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text[i]!;
		if ("<{([".includes(char)) depth++;
		else if (">})]".includes(char) && text[i - 1] !== "=") depth--;
		else if (depth === 0 && text.startsWith(separator, i)) {
			parts.push(text.slice(start, i));
			start = i + separator.length;
			i += separator.length - 1;
		}
	}
	parts.push(text.slice(start));
	return parts.map((part) => part.trim());
}

/**
 * The `Effect<A, E, R>` or `Stream<A, E, R>` in a type, by where its
 * arguments start and end.
 */
function findEffect(type: string) {
	const match = /\b(?:Effect|Stream)</.exec(type);
	if (!match) return undefined;
	const start = match.index + match[0].length;
	let depth = 1;
	for (let i = start; i < type.length; i++) {
		const char = type[i]!;
		if ("<{([".includes(char)) depth++;
		else if (">})]".includes(char) && type[i - 1] !== "=") depth--;
		if (depth === 0) return { start, end: i };
	}
	throw new Error(`Unbalanced Effect type: ${type}`);
}

/**
 * A bone's type in parts: in an `Effect`, the value it succeeds with and
 * its errors; or, for a name in `values`, all of it as a value.
 */
function boneOf(
	node: { line: number; character: number; target: string; text: string },
	values: ReadonlySet<string>,
): Bone {
	const full = typeText(node.text);
	const colon = full.indexOf(":");
	const name = full.slice(0, colon);
	const type = full.slice(colon + 1).trimStart();
	const head = `${name}: `;
	const base = { line: node.line, character: node.character, name };
	if (values.has(name))
		return {
			...base,
			segments: [
				{ text: head, tone: "plain" },
				{ text: type, tone: "value" },
			],
		};
	const range = findEffect(type);
	if (!range) return { ...base, segments: [{ text: full, tone: "plain" }] };
	const [value = "", errors = "", context = ""] = splitTopLevel(
		type.slice(range.start, range.end),
		",",
	);
	const segments: Segment[] = [
		{ text: head + type.slice(0, range.start), tone: "plain" },
		{ text: value, tone: "value" },
		{ text: ", ", tone: "plain" },
	];
	const members = splitTopLevel(errors, "|");
	members.forEach((member, i) => {
		if (i > 0) segments.push({ text: " | ", tone: "plain" });
		segments.push({
			text: member,
			tone: member === "never" ? "plain" : "error",
		});
	});
	segments.push({
		text: `, ${context}${type.slice(range.end)}`,
		tone: "plain",
	});
	return {
		...base,
		segments,
		effect: {
			head: type.slice(0, range.start),
			value,
			errors: members.filter((member) => member !== "never"),
			context,
			tail: type.slice(range.end),
		},
	};
}

/** What Twoslash read from a compiled example. */
type Compiled = {
	code: string;
	queries: {
		line: number;
		character: number;
		target: string;
		text: string;
	}[];
	errors: {
		line: number;
		character: number;
		length: number;
		code: number;
		text: string;
	}[];
};

/**
 * Compiles an example in `site/landing/`. A type error fails the build,
 * unless the example expects it with `// @errors:`.
 */
async function compile(file: string): Promise<Compiled> {
	const source = await readFile(join("landing", file), "utf8");
	let result: { code: string; nodes: { type: string }[] } | undefined;
	await highlightHast(source, {
		lang: "ts",
		theme: codeTheme,
		meta: { __raw: "twoslash" },
		transformers: [
			transformerTwoslash({
				twoslashOptions: {
					cwd: root,
					compilerOptions: exampleCompilerOptions(root),
				},
				// The landing's code must compile, in the dev server too.
				onTwoslashError: (error) => {
					throw error;
				},
			}),
			{
				name: "read-types",
				tokens() {
					result = this.meta.twoslash;
				},
			},
		],
	});
	if (!result) throw new Error(`Twoslash read no types from ${file}`);
	return {
		code: result.code.replace(/\n$/, ""),
		queries: result.nodes.filter((node) => node.type === "query") as never,
		errors: result.nodes.filter((node) => node.type === "error") as never,
	};
}

/** Compiles an example and reads its queried types. */
async function readExample(
	file: string,
	values: readonly string[] = [],
): Promise<Example> {
	const { code, queries } = await compile(file);
	if (queries.length === 0) throw new Error(`${file} has no ^? queries`);
	const valueSet = new Set(values);
	return {
		lines: await tokenize(code),
		bones: queries.map((query) => boneOf(query, valueSet)),
	};
}

/**
 * A path, the parameter names TypeScript reads from it, a call that fills
 * them in, and one that doesn't, with the error TypeScript gives it.
 */
export type TypedPath = {
	path: string;
	/** `PathParamNames` of the path, as TypeScript prints it. */
	names: string;
	call: Token[];
	/** The wrong call's text, and where in it TypeScript puts the error. */
	wrong: { text: string; start: number; end: number };
	error: { code: number; text: string };
};

/**
 * The paths from the compiled `paths.ts`: each `PathParamNames` query, then
 * the call that compiles, then the one with the expected error.
 */
async function readPaths(): Promise<TypedPath[]> {
	const { code, queries, errors } = await compile("paths.ts");
	const lines = await tokenize(code);
	const text = code.split("\n");
	const paths = queries.map((query): TypedPath => {
		const path = /PathParamNames<"([^"]+)">/.exec(text[query.line]!)?.[1];
		if (!path) throw new Error(`paths.ts: no path on line ${query.line}`);
		const calls = text
			.map((line, i) => ({ line, i }))
			.filter(({ line, i }) => i > query.line && line.startsWith("api.get("))
			.slice(0, 2);
		const [right, wrong] = calls;
		const error = errors.find((e) => e.line === wrong?.i);
		if (!right || !wrong || !error)
			throw new Error(`paths.ts: ${path} needs a call and a wrong call`);
		if (errors.some((e) => e.line === right.i))
			throw new Error(`paths.ts: the call for ${path} doesn't compile`);
		return {
			path,
			names: query.text.slice(query.text.indexOf("=") + 1).trim(),
			call: lines[right.i]!,
			wrong: {
				text: wrong.line,
				start: error.character,
				end: error.character + error.length,
			},
			error: { code: error.code, text: error.text },
		};
	});
	if (paths.length !== 4)
		throw new Error(`paths.ts: ${paths.length} paths, not 4`);
	return paths;
}

/** One combination of the specimen's options, and its compiled call. */
export type Combo = {
	output: boolean;
	error: boolean;
	retry: boolean;
	timeout: boolean;
	/** The client's plugins, as written: `[]` when it has none. */
	plugins: string;
	/** The call, as written. */
	call: string;
	effect: EffectParts;
};

/**
 * Every combination of the specimen's options, and one order for the
 * errors that every combination's union keeps, so a member never moves
 * when another enters or leaves.
 */
export type Specimen = { combos: Combo[]; errors: string[] };

/** The specimen's combinations, from the compiled `specimen.ts`. */
async function readSpecimen(): Promise<Specimen> {
	const example = await readExample("specimen.ts");
	const text = example.lines.map((line) =>
		line.map((token) => token.text).join(""),
	);
	const combos = example.bones.map((bone): Combo => {
		const flags = /^o([01])e([01])r([01])t([01])$/.exec(bone.name);
		if (!flags || !bone.effect)
			throw new Error(`specimen.ts: unexpected query ${bone.name}`);
		const line = text[bone.line]!;
		const call = line.slice(line.indexOf("api.get("), line.lastIndexOf(";"));
		// The client is the nearest `Fetch.make` above the call.
		const make = text
			.slice(0, bone.line)
			.reverse()
			.find((candidate) => candidate.includes("Fetch.make("))!;
		const plugins = /plugins: (\[.*\])/.exec(make)?.[1] ?? "[]";
		return {
			output: flags[1] === "1",
			error: flags[2] === "1",
			retry: flags[3] === "1",
			timeout: flags[4] === "1",
			plugins,
			call,
			effect: bone.effect,
		};
	});
	if (combos.length !== 16)
		throw new Error(`specimen.ts: ${combos.length} combinations, not 16`);
	// One order for every error, by name before any type argument, that
	// each union follows.
	const key = (error: string) => error.split("<")[0]!;
	const errors: string[] = [];
	for (const combo of combos)
		for (const error of combo.effect.errors)
			if (!errors.includes(key(error))) {
				const before = combo.effect.errors
					.slice(combo.effect.errors.indexOf(error) + 1)
					.map(key)
					.find((next) => errors.includes(next));
				errors.splice(
					before === undefined ? errors.length : errors.indexOf(before),
					0,
					key(error),
				);
			}
	for (const combo of combos) {
		const order = combo.effect.errors.map(key);
		const kept = errors.filter((error) => order.includes(error));
		if (kept.join() !== order.join())
			throw new Error(`specimen.ts: ${combo.call} orders its errors apart`);
	}
	return { combos, errors };
}

export type Landing = {
	specimen: Specimen;
	paths: TypedPath[];
	byHand: Example;
	withEffetch: Example;
	narrowing: Example;
};

export const loadLanding = createServerFn({ method: "GET" })
	.middleware([staticFunctionMiddleware])
	.handler(async (): Promise<Landing> => {
		const [specimen, paths, byHand, withEffetch, narrowing] =
			await Promise.all([
				readSpecimen(),
				readPaths(),
				readExample("by-hand.ts"),
				readExample("with-effetch.ts"),
				readExample("narrowing.ts"),
			]);
		return { specimen, paths, byHand, withEffetch, narrowing };
	});
