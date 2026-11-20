#!/usr/bin/env node
import path from "node:path";

import ts from "typescript";

const dir = process.cwd();
const probe = path.join(dir, "editor.ts");
const source = `import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { bearer, type TimeoutPlugin } from "@monarcode/effetch/plugins";
import { FetchTest } from "@monarcode/effetch/test";

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

export const defined = Fetch.endpoint(/*definedRoute*/"");
export const badRoute = Fetch.endpoint(/*badRoute*/"GET todos");
export const badEndpointRoute = typed.endpoint(/*badEndpointRoute*/"GET todos");
const getTodoDefinition = Fetch./*define*/endpoint("GET /todos/:id", { output: Todo });
export const /*bound*/bound = typed./*bind*/bind(getTodoDefinition);
export const /*boundCall*/boundCall = bound({ params: { id: 1 } });
export const boundParams = bound({ params: { /*boundParams*/ } });

interface Locale { readonly locale: string }
interface Signer { readonly sign: (s: string) => string }
declare const Localized: Schema.Codec<{ readonly id: number }, unknown, Locale>;
declare const Signed: Schema.Codec<string, string, never, Signer>;
export const /*servicesCall*/servicesCall = typed.post("/x", {
	input: Signed,
	body: "x",
	output: Localized,
});

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
	message: Schema.String,
}) {}
class SessionExpired extends Schema.TaggedError<SessionExpired>()("SessionExpired", {
	message: Schema.String,
}) {}
declare const mapped: Fetch.Client<[], typeof ApiError, { 401: typeof SessionExpired }>;
export const /*statusGet*/statusGet = typed.get("/todos/:id", {
	params: { id: 1 },
	output: Todo,
	statusErrors: { 404: TodoNotFound },
});
const getMapped = mapped.endpoint("GET /todos/:id", {
	output: Todo,
	statusErrors: { 404: TodoNotFound },
});
export const /*statusEndpoint*/statusEndpoint = getMapped({ params: { id: 1 } });
const definedMapped = Fetch.endpoint("GET /todos/:id", {
	output: Todo,
	statusErrors: { 404: TodoNotFound },
});
export const /*statusBound*/statusBound = mapped.bind(definedMapped)({ params: { id: 1 } });

export class Api extends Fetch./*service*/Service<Api>()("Api", {
	defaultError: ApiError,
	statusErrors: { 404: TodoNotFound },
}) {}
export const /*apiLayer*/apiLayer = Api./*layer*/layer;
export const /*apiConfig*/apiConfig = Api./*config*/config;
export class TodoApi extends Fetch./*endpointsClass*/Endpoints<TodoApi>()("TodoApi", Api, {
	get: getTodoDefinition,
}) {}
declare const todos: Effect.Success<typeof TodoApi>;
export const /*todosGet*/todosGet = todos.get;
export const allBound = typed./*bindAll*/bindAll({ get: getTodoDefinition });
export const /*serviceCall*/serviceCall = Effect.gen(function* () {
	const client = yield* Api;
	return yield* client.get("/todos/:id", { params: { id: 1 }, output: Todo });
});
export const /*sseCall*/sseCall = typed./*sse*/sse("/jobs/:id/events", { params: { id: 1 }, output: Todo });
const jobEvents = Fetch.endpoint("GET /jobs/:id/events", { output: Todo, stream: "sse" });
export const /*streamBound*/streamBound = typed.bind(jobEvents)({ params: { id: 1 } });
const listTodos = Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) });
export const /*pages*/pages = Fetch./*paginate*/paginate(typed.bind(listTodos), {
	start: 1,
	request: () => ({}),
	next: (todos, page) => (todos.length === 0 ? Option.none() : Option.some(page + 1)),
});
export const namespace = /*fetchTestNamespace*/FetchTest;
export const fetchNamespace = /*fetchNamespace*/Fetch;
export const members = Fetch./*fetchMembers*/;
export const /*backend*/backend = FetchTest./*fetchTestLayer*/layer([
	FetchTest./*respond*/respond(getTodoDefinition, ({ params }) =>
		Effect.succeed({ id: Number(params./*handlerParams*/id), title: "x" }),
	),
	FetchTest./*fail*/fail(definedMapped, 404, new TodoNotFound({ message: "x" })),
]);
`;

const config = ts.getParsedCommandLineOfConfigFile(
	path.join(dir, "tsconfig.nodenext.json"),
	{},
	{ ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
);
// A file that doesn't import Effetch yet, to check the editor offers to.
const autoImportProbe = path.join(dir, "auto-import.ts");
const autoImportSource = "export const api = Fetc";
const read = (fileName) =>
	fileName === probe
		? source
		: fileName === autoImportProbe
			? autoImportSource
			: ts.sys.readFile(fileName);

const service = ts.createLanguageService(
	{
		getScriptFileNames: () => [probe, autoImportProbe],
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
			fileName === probe ||
			fileName === autoImportProbe ||
			ts.sys.fileExists(fileName),
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
	["define", "Endpoint.d.ts", "Defines an endpoint without a client"],
	["bind", "Client.d.ts", "Binds an endpoint defined with"],
	["service", "Service.d.ts", "Declares a client as a service class"],
	["layer", "Service.d.ts", "Builds the client with"],
	["config", "Service.d.ts", "The config the class was declared with"],
	["endpointsClass", "Endpoints.d.ts", "Declares a module's endpoints"],
	["bindAll", "Client.d.ts", "Binds a record of endpoint definitions"],
	["sse", "Client.d.ts", "Sends a request and gives its Server-Sent Events"],
	["paginate", "Paginate.d.ts", "Pages through a list"],
	[
		"fetchTestLayer",
		path.join("test", "FetchTest.d.ts"),
		"Makes a fake backend",
	],
	[
		"respond",
		path.join("test", "FetchTest.d.ts"),
		"Makes a handler that answers",
	],
	[
		"fail",
		path.join("test", "FetchTest.d.ts"),
		"Makes a handler that answers every request",
	],
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
			marker === "bind" ||
			marker === "layer" ||
			marker === "bindAll" ||
			marker === "sse" ||
			marker === "config" ||
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

const definedRoutes = (
	service.getCompletionsAtPosition(probe, at("definedRoute") + 1, undefined)
		?.entries ?? []
).map((entry) => entry.name);
expect(
	definedRoutes.includes("GET /") && definedRoutes.includes("POST /"),
	`Fetch.endpoint("") doesn't suggest the methods: ${definedRoutes.slice(0, 10).join(", ")}`,
);

// A malformed route is reported on the route itself, as a route error, for
// both ways of defining an endpoint.
const diagnostics = service.getSemanticDiagnostics(probe);
for (const marker of ["badRoute", "badEndpointRoute"]) {
	const messages = diagnostics
		.filter((diagnostic) => diagnostic.start === at(marker))
		.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
		);
	expect(
		messages.length === 1 &&
			messages[0].includes("GET /") &&
			!messages[0].includes("No overload matches"),
		`A malformed route at ${marker} isn't reported as a route error: ${messages.join("; ") || "no error"}`,
	);
}

const endpointParams = (
	service.getCompletionsAtPosition(probe, at("endpointParams"), undefined)
		?.entries ?? []
).map((entry) => entry.name);
expect(
	endpointParams.includes("id"),
	`params of a "GET /users/:id" endpoint don't complete id: ${endpointParams.slice(0, 10).join(", ")}`,
);

const boundParams = (
	service.getCompletionsAtPosition(probe, at("boundParams"), undefined)
		?.entries ?? []
).map((entry) => entry.name);
expect(
	boundParams.includes("id"),
	`params of a bound "GET /todos/:id" endpoint don't complete id: ${boundParams.slice(0, 10).join(", ")}`,
);

const handlerParams = (
	service.getCompletionsAtPosition(probe, at("handlerParams"), undefined)
		?.entries ?? []
).map((entry) => entry.name);
expect(
	handlerParams.includes("id"),
	`params of a FetchTest.respond handler don't complete id: ${handlerParams.slice(0, 10).join(", ")}`,
);

const namespaceDocs = ts.displayPartsToString(
	service.getQuickInfoAtPosition(probe, at("fetchTestNamespace"))
		?.documentation,
);
expect(
	namespaceDocs.includes("A typed fake backend for tests"),
	`Hover on FetchTest doesn't show its docs: ${JSON.stringify(namespaceDocs.slice(0, 80))}`,
);

const fetchDocs = ts.displayPartsToString(
	service.getQuickInfoAtPosition(probe, at("fetchNamespace"))?.documentation,
);
expect(
	fetchDocs.includes("Typed, schema-driven HTTP calls"),
	`Hover on Fetch doesn't show its docs: ${JSON.stringify(fetchDocs.slice(0, 80))}`,
);

const fetchMembers = (
	service.getCompletionsAtPosition(probe, at("fetchMembers"), undefined)
		?.entries ?? []
).map((entry) => entry.name);
expect(
	// Types aren't offered in a value position.
	["make", "endpoint", "Service", "Endpoints", "UploadFile"].every((name) =>
		fetchMembers.includes(name),
	),
	`Fetch. doesn't complete its members: ${fetchMembers.slice(0, 10).join(", ")}`,
);

const autoImports = (
	service.getCompletionsAtPosition(autoImportProbe, autoImportSource.length, {
		includeCompletionsForModuleExports: true,
	})?.entries ?? []
)
	.filter((entry) => entry.name === "Fetch")
	.map((entry) => entry.source);
expect(
	autoImports.includes("@monarcode/effetch"),
	`Typing Fetch doesn't offer to import it from @monarcode/effetch: ${autoImports.join(", ") || "no Fetch entry"}`,
);

const backendHover = ts
	.displayPartsToString(
		service.getQuickInfoAtPosition(probe, at("backend"))?.displayParts,
	)
	.replace(/\s+/g, " ");
expect(
	backendHover.includes(
		"Layer<HttpClient | FetchTest.Recorder, never, never>",
	) || backendHover.includes("Layer<HttpClient | Recorder, never, never>"),
	`Hover on a FetchTest layer doesn't show what it provides: ${backendHover}`,
);

const endpointHover = ts.displayPartsToString(
	service.getQuickInfoAtPosition(probe, at("getUser"))?.displayParts,
);
expect(
	endpointHover.includes('Endpoint<"GET /users/:id"'),
	`Hover on an endpoint doesn't name its type and route: ${endpointHover}`,
);

const boundHover = ts.displayPartsToString(
	service.getQuickInfoAtPosition(probe, at("bound"))?.displayParts,
);
expect(
	boundHover.includes('Endpoint<"GET /todos/:id"'),
	`Hover on a bound endpoint doesn't name its type and route: ${boundHover}`,
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

// The error and services of a hover such as `const x: Effect.Effect<A, E, R>`,
// or `const x: Stream.Stream<A, E, R>`.
const errorsAndServices = (hover) => {
	const flat = hover.replace(/\s+/g, " ");
	const start = /: (Effect\.Effect|Stream\.Stream|Stream)</.exec(flat);
	if (start === null || !flat.endsWith(">")) {
		return undefined;
	}
	const args = splitTopLevel(
		flat.slice(start.index + start[0].length, -1),
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
	["boundCall", callErrors, ["never"]],
	["postCall", callErrors, ["never"]],
	["requestCall", callErrors, ["never"]],
	["timedCall", [...callErrors, "TimeoutError"].sort(), ["never"]],
	["servicesCall", callErrors, ["Locale", "Signer"]],
	["statusGet", [...callErrors, "TodoNotFound"].sort(), ["never"]],
	[
		"statusEndpoint",
		[...callErrors, "SessionExpired", "TodoNotFound"].sort(),
		["never"],
	],
	[
		"statusBound",
		[...callErrors, "SessionExpired", "TodoNotFound"].sort(),
		["never"],
	],
	["serviceCall", [...callErrors, "TodoNotFound"].sort(), ["Api"]],
	["sseCall", callErrors, ["never"]],
	["streamBound", callErrors, ["never"]],
	["pages", callErrors, ["never"]],
]) {
	const hover = ts.displayPartsToString(
		service.getQuickInfoAtPosition(probe, at(marker))?.displayParts,
	);
	const shown = errorsAndServices(hover);
	expect(
		shown !== undefined &&
			shown.errors.join(" | ") === errors.join(" | ") &&
			shown.services.join(" | ") === services.join(" | "),
		`Hover on ${marker} doesn't show Effect.Effect or Stream<…, ${errors.join(" | ")}, ${services.join(" | ")}>: ${hover}`,
	);
}

// A Fetch.Endpoints service's endpoints hover as Endpoint types.
const todosGetHover = ts
	.displayPartsToString(
		service.getQuickInfoAtPosition(probe, at("todosGet"))?.displayParts,
	)
	.replace(/\s+/g, " ");
expect(
	todosGetHover.includes('Endpoint<"GET /todos/:id"'),
	`Hover on a Fetch.Endpoints endpoint doesn't name its type and route: ${todosGetHover}`,
);

// A Fetch.Service class's statics name their types, from the config.
const apiLayerHover = ts
	.displayPartsToString(
		service.getQuickInfoAtPosition(probe, at("apiLayer"))?.displayParts,
	)
	.replace(/\s+/g, " ");
expect(
	/Layer(\.Layer)?<Api, never, HttpClient(\.HttpClient)?>$/.test(
		apiLayerHover,
	),
	`Hover on a Fetch.Service layer doesn't show its type: ${apiLayerHover}`,
);
const apiConfigHover = ts
	.displayPartsToString(
		service.getQuickInfoAtPosition(probe, at("apiConfig"))?.displayParts,
	)
	.replace(/\s+/g, " ");
expect(
	apiConfigHover.includes("Fetch.ClientConfig<") &&
		apiConfigHover.includes("404: typeof TodoNotFound"),
	`Hover on a Fetch.Service config doesn't show its type: ${apiConfigHover}`,
);

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
	/, ListUsersParams[,>]/.test(queryHover) && !queryHover.includes("QueryOf"),
	`Hover on get with a query doesn't name the query's type: ${queryHover}`,
);

if (failures.length > 0) {
	console.error(failures.map((failure) => `✗ ${failure}`).join("\n"));
	process.exit(1);
}
console.log("editor: ok");
