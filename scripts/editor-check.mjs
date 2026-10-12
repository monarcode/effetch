#!/usr/bin/env node
import path from "node:path";

import ts from "typescript";

const dir = process.cwd();
const probe = path.join(dir, "editor.ts");
const source = `import * as Fetch from "@monarcode/effetch";
import { bearer } from "@monarcode/effetch/plugins";

export const make = Fetch./*make*/make({
	plugins: [/*bearer*/bearer({ token: "token" })],
});

declare const api: Fetch.Client;

export const call = api./*get*/get("/users/:id", { params: { /*params*/ } });
`;

const config = ts.getParsedCommandLineOfConfigFile(
	path.join(dir, "tsconfig.nodenext.json"),
	{},
	{ ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
);
const read = (fileName) =>
	fileName === probe ? source : ts.sys.readFile(fileName);

const service = ts.createLanguageService(
	{
		getScriptFileNames: () => [probe],
		getScriptVersion: () => "1",
		getScriptSnapshot: (fileName) => {
			const text = read(fileName);
			return text === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(text);
		},
		getCurrentDirectory: () => dir,
		getCompilationSettings: () => config.options,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		fileExists: (fileName) =>
			fileName === probe || ts.sys.fileExists(fileName),
		readFile: read,
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
	},
	ts.createDocumentRegistry(),
);

const at = (marker) => {
	const index = source.indexOf(`/*${marker}*/`);
	if (index === -1) {
		throw new Error(`No marker ${marker}`);
	}
	return index + marker.length + 4;
};

const failures = [];
const expect = (ok, message) => {
	if (!ok) {
		failures.push(message);
	}
};

const dist = path.join(dir, "node_modules", "@monarcode", "effetch", "dist");

for (const [marker, file, docs] of [
	["make", "Client.d.ts", "Makes a"],
	["get", "Client.d.ts", "Sends a `GET` request"],
	["bearer", path.join("plugins", "bearer.d.ts"), "Sends `Authorization"],
]) {
	const definitions = service.getDefinitionAtPosition(probe, at(marker)) ?? [];
	const targets = definitions.map((definition) =>
		path.relative(dist, definition.fileName),
	);
	expect(
		targets.includes(file),
		`Go to definition on ${marker} lands on ${targets.join(", ") || "nothing"}, not dist/${file}`,
	);
	const info = service.getQuickInfoAtPosition(probe, at(marker));
	const documentation = ts.displayPartsToString(info?.documentation);
	const tags = (info?.tags ?? []).map((tag) => tag.name);
	expect(
		documentation.includes(docs),
		`Hover on ${marker} doesn't show its docs: ${JSON.stringify(documentation.slice(0, 80))}`,
	);
	expect(
		marker === "get" || (tags.includes("example") && tags.includes("since")),
		`Hover on ${marker} lacks @example or @since: ${tags.join(", ")}`,
	);
}

const completions = service.getCompletionsAtPosition(
	probe,
	at("params"),
	undefined,
);
const names = (completions?.entries ?? []).map((entry) => entry.name);
expect(
	names.includes("id"),
	`params on "/users/:id" doesn't complete id: ${names.slice(0, 10).join(", ")}`,
);

if (failures.length > 0) {
	console.error(failures.map((failure) => `✗ ${failure}`).join("\n"));
	process.exit(1);
}
console.log("editor: ok");
