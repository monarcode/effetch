#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const entries = ["src/index.ts", "src/plugins/index.ts"].map((file) =>
	path.join(root, file),
);
const markdown = ["README.md"]
	.map((file) => path.join(root, file))
	.filter((file) => existsSync(file));

const relative = (file) => path.relative(root, file);

const parsed = ts.getParsedCommandLineOfConfigFile(
	path.join(root, "tsconfig.json"),
	{},
	{
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
			throw new Error(
				ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
			);
		},
	},
);
const options = { ...parsed.options, noEmit: true, plugins: [] };
const problems = [];

const program = ts.createProgram(entries, options);
const checker = program.getTypeChecker();

const locate = (node) => {
	const file = node.getSourceFile();
	const { line } = file.getLineAndCharacterOfPosition(node.getStart());
	return `${relative(file.fileName)}:${line + 1}`;
};

const docOf = (node) => {
	const doc = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc).at(-1);
	const tags = new Map(
		(doc?.tags ?? []).map((tag) => [
			tag.tagName.text,
			ts.getTextOfJSDocComment(tag.comment)?.trim() ?? "",
		]),
	);
	return {
		description: Boolean(ts.getTextOfJSDocComment(doc?.comment)?.trim()),
		tags,
	};
};

const requireFull = (name, node) => {
	const { description, tags } = docOf(node);
	const missing = [
		description ? undefined : "a description",
		tags.has("example") ? undefined : "@example",
		/^\d+\.\d+\.\d+$/.test(tags.get("since") ?? "") ? undefined : "@since",
	].filter(Boolean);
	if (missing.length > 0) {
		problems.push(`${locate(node)}: ${name} needs ${missing.join(", ")}`);
	}
};

const requireDescription = (name, node) => {
	if (!docOf(node).description) {
		problems.push(`${locate(node)}: ${name} needs a description`);
	}
};

const checkMembers = (name, node) => {
	for (const member of node.members) {
		if (
			ts.isConstructorDeclaration(member) ||
			ts.isCallSignatureDeclaration(member) ||
			ts.isIndexSignatureDeclaration(member) ||
			member.name === undefined
		) {
			continue;
		}
		requireDescription(`${name}.${member.name.getText()}`, member);
	}
};

const isImplementation = (node) =>
	(ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
	node.body !== undefined &&
	checker.getSymbolAtLocation(node.name)?.declarations?.length > 1;

const checkDeclaration = (name, node) => {
	if (isImplementation(node)) {
		return;
	}
	requireFull(name, node);
	if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
		checkMembers(name, node);
	}
	if (
		ts.isModuleDeclaration(node) &&
		node.body &&
		ts.isModuleBlock(node.body)
	) {
		for (const statement of node.body.statements) {
			const exported = statement.modifiers?.some(
				(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
			);
			if (exported && statement.name) {
				checkDeclaration(`${name}.${statement.name.getText()}`, statement);
			}
		}
	}
};

let exportCount = 0;
for (const entry of entries) {
	const moduleSymbol = checker.getSymbolAtLocation(
		program.getSourceFile(entry),
	);
	for (const exported of checker.getExportsOfModule(moduleSymbol)) {
		exportCount += 1;
		const symbol =
			exported.flags & ts.SymbolFlags.Alias
				? checker.getAliasedSymbol(exported)
				: exported;
		for (const declaration of symbol.declarations ?? []) {
			checkDeclaration(exported.name, declaration);
		}
	}
}

const codeBlocks = (file, lines, firstLine) => {
	const blocks = [];
	let block;
	lines.forEach((line, index) => {
		const fence = line.trim();
		if (block === undefined && fence === "```ts") {
			block = { file, line: firstLine + index + 1, code: [] };
		} else if (block !== undefined && fence === "```") {
			blocks.push({ ...block, code: block.code.join("\n") });
			block = undefined;
		} else if (block !== undefined) {
			block.code.push(line);
		}
	});
	return blocks;
};

const examples = [];
const publicSources = program
	.getSourceFiles()
	.filter(
		(file) =>
			file.fileName.startsWith(path.join(root, "src")) &&
			!file.fileName.includes(`${path.sep}internal${path.sep}`),
	);
for (const source of publicSources) {
	const text = source.text;
	for (const comment of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
		const firstLine = text.slice(0, comment.index).split("\n").length;
		const lines = comment[0]
			.split("\n")
			.map((line) => line.replace(/^\s*\*\s?/, ""));
		examples.push(...codeBlocks(source.fileName, lines, firstLine));
	}
}
for (const file of markdown) {
	examples.push(
		...codeBlocks(file, readFileSync(file, "utf8").split("\n"), 1),
	);
}

const virtual = new Map(
	examples.map((example, index) => [
		path.join(root, ".docs-check", `example-${index}.ts`),
		example,
	]),
);
const host = ts.createCompilerHost(options);
const getSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (fileName, languageVersion, ...rest) => {
	const example = virtual.get(fileName);
	return example === undefined
		? getSourceFile(fileName, languageVersion, ...rest)
		: ts.createSourceFile(
				fileName,
				`${example.code}\nexport {};\n`,
				languageVersion,
				true,
			);
};
const fileExists = host.fileExists.bind(host);
host.fileExists = (fileName) => virtual.has(fileName) || fileExists(fileName);

const examplesProgram = ts.createProgram([...virtual.keys()], options, host);
for (const diagnostic of ts.getPreEmitDiagnostics(examplesProgram)) {
	const example = diagnostic.file && virtual.get(diagnostic.file.fileName);
	if (!example) {
		continue;
	}
	const { line } = diagnostic.file.getLineAndCharacterOfPosition(
		diagnostic.start ?? 0,
	);
	const message = ts.flattenDiagnosticMessageText(
		diagnostic.messageText,
		"\n",
	);
	problems.push(
		`${relative(example.file)}:${example.line + line}: example doesn't compile: TS${diagnostic.code} ${message}`,
	);
}

if (problems.length > 0) {
	console.error(problems.map((problem) => `✗ ${problem}`).join("\n"));
	process.exit(1);
}
console.log(
	`✓ ${exportCount} exports documented, ${examples.length} examples compile`,
);
