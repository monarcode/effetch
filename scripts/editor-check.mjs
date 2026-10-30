#!/usr/bin/env node
import path from "node:path";

import ts from "typescript";

const dir = process.cwd();
const probe = path.join(dir, "editor.ts");
const source = `import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { bearer, type TimeoutPlugin } from "@monarcode/effetch/plugins";

export const make = Fetch./*make*/make({
	plugins: [/*bearer*/bearer({ token: "token" })],
});

declare const api: Fetch.Client;

export const call = api./*get*/get("/users/:id", { params: { /*params*/ } });

interface ListUsersParams {
	readonly limit: number;
	readonly page?: number | undefined;
}
declare const listUsersParams: ListUsersParams;

export const list = api./*query*/get("/users", { query: listUsersParams });

export const route = api.endpoint("");
export const /*getUser*/getUser = api./*endpoint*/endpoint("GET /users/:id");
export const user = getUser({ params: { /*endpointParams*/ } });

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const ApiError = Schema.Struct({ code: Schema.String });
declare const typed: Fetch.Client<[], typeof ApiError>;
declare const timed: Fetch.Client<[TimeoutPlugin]>;

export const /*todoCall*/todoCall = typed.get("/todos/:id", { params: { id: 1 }, output: Todo });
export const /*todoProgram*/todoProgram = Effect.gen(function* () {
	const todo = yield* typed.get("/todos/:id", { params: { id: 1 }, output: Todo });
	return todo.title;
});
const getTodo = typed.endpoint("GET /todos/:id", { output: Todo });
export const /*endpointCall*/endpointCall = getTodo({ params: { id: 1 } });
export const /*timedCall*/timedCall = timed.get("/todos", { output: Todo });
export const /*postCall*/postCall = typed.post("/todos", {
	input: Todo,
	body: { id: 1, title: "x" },
	output: Todo,
});
export const /*requestCall*/requestCall = typed.request("PATCH", "/todos/:id", {
	params: { id: 1 },
	output: Todo,
});

interface Locale { readonly locale: string }
interface Signer { readonly sign: (s: string) => string }
declare const Localized: Schema.Codec<{ readonly id: number }, unknown, Locale>;
declare const Signed: Schema.Codec<string, string, never, Signer>;
export const /*servicesCall*/servicesCall = typed.post("/x", {
	input: Signed,
	body: "x",
	output: Localized,
});
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
	["endpoint", "Client.d.ts", "Defines an endpoint"],
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
		marker === "get" ||
			marker === "endpoint" ||
			(tags.includes("example") && tags.includes("since")),
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

const routeCompletions = service.getCompletionsAtPosition(
	probe,
	source.indexOf('endpoint("")') + 'endpoint("'.length,
	undefined,
);
const routes = (routeCompletions?.entries ?? []).map((entry) => entry.name);
expect(
	routes.includes("GET /") && routes.includes("POST /"),
	`endpoint("") doesn't suggest the methods: ${routes.slice(0, 10).join(", ")}`,
);

const endpointParams = (
	service.getCompletionsAtPosition(probe, at("endpointParams"), undefined)
		?.entries ?? []
).map((entry) => entry.name);
expect(
	endpointParams.includes("id"),
	`params of a "GET /users/:id" endpoint don't complete id: ${endpointParams.slice(0, 10).join(", ")}`,
);

const endpointHover = ts.displayPartsToString(
	service.getQuickInfoAtPosition(probe, at("getUser"))?.displayParts,
);
expect(
	endpointHover.includes('Endpoint<"GET /users/:id"'),
	`Hover on an endpoint doesn't name its type and route: ${endpointHover}`,
);

// Splits `text` at `separator`, outside any brackets.
const splitTopLevel = (text, separator) => {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index++) {
		if ("<{([".includes(text[index])) {
			depth++;
		} else if (">})]".includes(text[index])) {
			depth--;
		} else if (depth === 0 && text.startsWith(separator, index)) {
			parts.push(text.slice(start, index).trim());
			start = index + separator.length;
		}
	}
	return [...parts, text.slice(start).trim()];
};

// The member names of a union, such as `["NetworkError", "HttpError.With"]`.
const members = (union) =>
	splitTopLevel(union, "|")
		.map((member) => member.replace(/^Fetch\./, "").replace(/<.*$/, ""))
		.sort();

// The error and services of a hover such as `const x: Effect.Effect<A, E, R>`.
const errorsAndServices = (hover) => {
	const flat = hover.replace(/\s+/g, " ");
	const start = flat.indexOf(": Effect.Effect<");
	if (start === -1 || !flat.endsWith(">")) {
		return undefined;
	}
	const args = splitTopLevel(
		flat.slice(start + ": Effect.Effect<".length, -1),
		",",
	);
	return args.length === 3
		? { errors: members(args[1]), services: members(args[2]) }
		: undefined;
};

const callErrors = ["DecodeError", "HttpError.With", "NetworkError"];
for (const [marker, errors, services] of [
	["todoCall", callErrors, ["never"]],
	["todoProgram", callErrors, ["never"]],
	["endpointCall", callErrors, ["never"]],
	["postCall", callErrors, ["never"]],
	["requestCall", callErrors, ["never"]],
	["timedCall", [...callErrors, "TimeoutError"].sort(), ["never"]],
	["servicesCall", callErrors, ["Locale", "Signer"]],
]) {
	const hover = ts.displayPartsToString(
		service.getQuickInfoAtPosition(probe, at(marker))?.displayParts,
	);
	const shown = errorsAndServices(hover);
	expect(
		shown !== undefined &&
			shown.errors.join(" | ") === errors.join(" | ") &&
			shown.services.join(" | ") === services.join(" | "),
		`Hover on ${marker} doesn't show Effect.Effect<…, ${errors.join(" | ")}, ${services.join(" | ")}>: ${hover}`,
	);
}

const queryStart = source.lastIndexOf("\n", at("query")) + 1;
const queryEnd = source.indexOf("\n", at("query"));
const queryErrors = service
	.getSemanticDiagnostics(probe)
	.filter(
		(diagnostic) =>
			diagnostic.start !== undefined &&
			diagnostic.start >= queryStart &&
			diagnostic.start < queryEnd,
	)
	.map((diagnostic) =>
		ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
	);
expect(
	queryErrors.length === 0,
	`An interface-typed query doesn't compile: ${queryErrors.join("; ")}`,
);
const queryHover = ts.displayPartsToString(
	service.getQuickInfoAtPosition(probe, at("query"))?.displayParts,
);
expect(
	queryHover.includes(", ListUsersParams>") && !queryHover.includes("QueryOf"),
	`Hover on get with a query doesn't name the query's type: ${queryHover}`,
);

if (failures.length > 0) {
	console.error(failures.map((failure) => `✗ ${failure}`).join("\n"));
	process.exit(1);
}
console.log("editor: ok");
