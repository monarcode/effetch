import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { migrateSources } from "../bin/migrate.mjs";

const migrate = (text: string, fileName = "/project/a.ts") => {
	const [result] = migrateSources(ts, [{ fileName, text }]);
	if (result === undefined) {
		throw new Error("No result");
	}
	return result;
};

const lines = (...parts: ReadonlyArray<string>) => `${parts.join("\n")}\n`;

describe("effetch-migrate", () => {
	it("turns a namespace import into a named one", () => {
		expect(
			migrate(
				lines(
					'import * as Fetch from "@monarcode/effetch";',
					'export const getTodo = Fetch.endpoint("GET /todos/:id");',
				),
			).text,
		).toBe(
			lines(
				'import { Fetch } from "@monarcode/effetch";',
				'export const getTodo = Fetch.endpoint("GET /todos/:id");',
			),
		);
		expect(
			migrate(
				lines(
					"import type * as Http from '@monarcode/effetch'",
					"declare const api: Http.Client",
				),
			).text,
		).toBe(
			lines(
				"import type { Fetch as Http } from '@monarcode/effetch'",
				"declare const api: Http.Client",
			),
		);
	});

	it("qualifies each use of a named import", () => {
		expect(
			migrate(
				lines(
					'import { HttpError, make, type Client, endpoint as define } from "@monarcode/effetch";',
					"",
					"export const client = make({ baseUrl: 'https://api.test' });",
					"export const route = define('GET /todos');",
					"export const isHttp = (u: unknown): u is HttpError.With<string> => u instanceof HttpError;",
					"export type Api = Client;",
					"export type Make = typeof make;",
					"export class NotFound extends HttpError {}",
					"export const all = { make, define };",
					"const shadow = (make: number) => make;",
				),
			).text,
		).toBe(
			lines(
				'import { Fetch } from "@monarcode/effetch";',
				"",
				"export const client = Fetch.make({ baseUrl: 'https://api.test' });",
				"export const route = Fetch.endpoint('GET /todos');",
				"export const isHttp = (u: unknown): u is Fetch.HttpError.With<string> => u instanceof Fetch.HttpError;",
				"export type Api = Fetch.Client;",
				"export type Make = typeof Fetch.make;",
				"export class NotFound extends Fetch.HttpError {}",
				"export const all = { make: Fetch.make, define: Fetch.endpoint };",
				"const shadow = (make: number) => make;",
			),
		);
	});

	it("keeps a type-only import type-only", () => {
		expect(
			migrate(
				lines(
					'import type { Client, CallError } from "@monarcode/effetch";',
					"declare const api: Client;",
					"type E = CallError<never, never>;",
				),
			).text,
		).toBe(
			lines(
				'import type { Fetch } from "@monarcode/effetch";',
				"declare const api: Fetch.Client;",
				"type E = Fetch.CallError<never, never>;",
			),
		);
	});

	it("merges several imports, and uses a namespace import's name", () => {
		expect(
			migrate(
				lines(
					'import * as Http from "@monarcode/effetch";',
					'import { make } from "@monarcode/effetch";',
					'import type { Client } from "@monarcode/effetch";',
					"export const client: Client = make({}) as never;",
					"export const route = Http.endpoint('GET /');",
				),
			).text,
		).toBe(
			lines(
				'import { Fetch as Http } from "@monarcode/effetch";',
				"export const client: Http.Client = Http.make({}) as never;",
				"export const route = Http.endpoint('GET /');",
			),
		);
	});

	it("picks another name when Fetch is taken", () => {
		expect(
			migrate(
				lines(
					'import { make } from "@monarcode/effetch";',
					"const Fetch = globalThis.fetch;",
					"export const client = make({});",
				),
			).text,
		).toBe(
			lines(
				'import { Fetch as Effetch } from "@monarcode/effetch";',
				"const Fetch = globalThis.fetch;",
				"export const client = Effetch.make({});",
			),
		);
	});

	it("re-exports from the flat subpath", () => {
		expect(
			migrate(
				lines(
					'export * from "@monarcode/effetch";',
					'export * as Http from "@monarcode/effetch";',
					'export { make, type Client } from "@monarcode/effetch";',
					'import { endpoint, HttpError } from "@monarcode/effetch";',
					"export { endpoint };",
					"export const isHttp = (u: unknown) => u instanceof HttpError;",
				),
			).text,
		).toBe(
			lines(
				'export * from "@monarcode/effetch/Fetch";',
				'export * as Http from "@monarcode/effetch/Fetch";',
				'export { make, type Client } from "@monarcode/effetch/Fetch";',
				'import { Fetch } from "@monarcode/effetch";',
				'import { endpoint } from "@monarcode/effetch/Fetch";',
				"export { endpoint };",
				"export const isHttp = (u: unknown) => u instanceof Fetch.HttpError;",
			),
		);
	});

	it("rewrites import() types", () => {
		expect(
			migrate(
				lines(
					'type Api = import("@monarcode/effetch").Client<[], import("@monarcode/effetch").AnySchema>;',
					'type Module = typeof import("@monarcode/effetch");',
					'type Done = import("@monarcode/effetch").Fetch.Client;',
				),
			).text,
		).toBe(
			lines(
				'type Api = import("@monarcode/effetch").Fetch.Client<[], import("@monarcode/effetch").Fetch.AnySchema>;',
				'type Module = typeof import("@monarcode/effetch").Fetch;',
				'type Done = import("@monarcode/effetch").Fetch.Client;',
			),
		);
	});

	it("warns about what it can't rewrite, and leaves it", () => {
		const source = lines(
			'export const load = () => import("@monarcode/effetch");',
			'vi.mock("@monarcode/effetch", () => ({}));',
		);
		const result = migrate(source);
		expect(result.text).toBe(source);
		expect(result.warnings).toEqual([
			{ line: 1, message: expect.stringMatching(/^a dynamic import\(\)/) },
			{
				line: 2,
				message: expect.stringMatching(
					/^"@monarcode\/effetch" passed to a call/,
				),
			},
		]);
	});

	it("warns about module blocks, template strings and JSDoc", () => {
		const blocks = lines(
			'declare module "x" {',
			'\timport type { Client } from "@monarcode/effetch";',
			"\tinterface Ctx { api: Client }",
			"}",
			"vi.mock(`@monarcode/effetch`);",
			'/** @type {import("@monarcode/effetch").Client} */',
			"export let api;",
		);
		const result = migrate(blocks);
		expect(result.text).toBe(blocks);
		expect(result.warnings.map(({ line }) => line)).toEqual([2, 5, 6]);
		const js = migrate(
			lines(
				'import { make } from "@monarcode/effetch";',
				"/** @param {ReturnType<typeof make>} client */",
				"export const use = (client) => make(client);",
			),
			"/project/use.js",
		);
		expect(js.text).toBe(
			lines(
				'import { Fetch } from "@monarcode/effetch";',
				"/** @param {ReturnType<typeof make>} client */",
				"export const use = (client) => Fetch.make(client);",
			),
		);
		expect(js.warnings).toEqual([
			{ line: 2, message: "a JSDoc comment uses `make`: update it by hand" },
		]);
	});

	it("makes a type-only Fetch import a value import when values need it", () => {
		expect(
			migrate(
				lines(
					'import type { Fetch } from "@monarcode/effetch";',
					'import { make } from "@monarcode/effetch";',
					"make({});",
				),
			).text,
		).toBe(
			lines(
				'import { Fetch } from "@monarcode/effetch";',
				"Fetch.make({});",
			),
		);
		expect(
			migrate(
				lines(
					'import type { Fetch, Client } from "@monarcode/effetch";',
					'import { make } from "@monarcode/effetch";',
					"declare const c: Client;",
					"make({});",
				),
			).text,
		).toBe(
			lines(
				'import { Fetch } from "@monarcode/effetch";',
				"declare const c: Fetch.Client;",
				"Fetch.make({});",
			),
		);
		// A value import already there is used instead.
		expect(
			migrate(
				lines(
					'import type { Fetch } from "@monarcode/effetch";',
					'import * as Http from "@monarcode/effetch";',
					'import { make } from "@monarcode/effetch";',
					"make();",
				),
			).text,
		).toBe(
			lines(
				'import type { Fetch } from "@monarcode/effetch";',
				'import { Fetch as Http } from "@monarcode/effetch";',
				"Http.make();",
			),
		);
	});

	it("doesn't qualify with a name that's shadowed where it's used", () => {
		expect(
			migrate(
				lines(
					'import * as Http from "@monarcode/effetch";',
					'import { make } from "@monarcode/effetch";',
					"export const f = (Http: number) => make({ Http });",
				),
			).text,
		).toBe(
			lines(
				'import { Fetch as Http } from "@monarcode/effetch";',
				'import { Fetch } from "@monarcode/effetch";',
				"export const f = (Http: number) => Fetch.make({ Http });",
			),
		);
		expect(
			migrate(
				lines(
					'import { Fetch, make } from "@monarcode/effetch";',
					"export const f = (Fetch: number) => make({ Fetch });",
				),
			).text,
		).toBe(
			lines(
				'import { Fetch as Effetch } from "@monarcode/effetch";',
				'import { Fetch } from "@monarcode/effetch";',
				"export const f = (Fetch: number) => Effetch.make({ Fetch });",
			),
		);
	});

	it("keeps re-exports of Fetch on the main entry", () => {
		const migrated = lines(
			'export { Fetch } from "@monarcode/effetch";',
			'export type { Fetch as F } from "@monarcode/effetch";',
		);
		expect(migrate(migrated).changed).toBe(false);
		expect(
			migrate(lines('export { Fetch, make } from "@monarcode/effetch";'))
				.text,
		).toBe(
			lines(
				'export { Fetch } from "@monarcode/effetch";',
				'export { make } from "@monarcode/effetch/Fetch";',
			),
		);
	});

	it("keeps import attributes, line endings, and reports dropped comments", () => {
		const attributes = migrate(
			lines(
				'import { /* keep */ make } from "@monarcode/effetch" with { type: "x" };',
				"make();",
			),
		);
		expect(attributes.text).toBe(
			lines(
				'import { Fetch } from "@monarcode/effetch" with { type: "x" };',
				"Fetch.make();",
			),
		);
		expect(attributes.warnings).toEqual([
			{ line: 1, message: "comments inside this import were dropped" },
		]);
		expect(
			migrate(
				[
					'import { endpoint, make } from "@monarcode/effetch";',
					"export { endpoint };",
					"make();",
					"",
				].join("\r\n"),
			).text,
		).toBe(
			[
				'import { Fetch } from "@monarcode/effetch";',
				'import { endpoint } from "@monarcode/effetch/Fetch";',
				"export { endpoint };",
				"Fetch.make();",
				"",
			].join("\r\n"),
		);
		expect(
			migrate(
				lines(
					'import * as Http from "@monarcode/effetch";',
					'import { make } from "@monarcode/effetch"; // two',
					"make();",
				),
			).text,
		).toBe(
			lines(
				'import { Fetch as Http } from "@monarcode/effetch";',
				"Http.make();",
			),
		);
	});

	it("reads files named with Windows paths", () => {
		expect(
			migrate(
				lines('import { make } from "@monarcode/effetch";', "make();"),
				"C:\\project\\a.ts",
			).changed,
		).toBe(true);
	});

	it("leaves migrated code and the other entries alone", () => {
		const source = lines(
			'import { Fetch } from "@monarcode/effetch";',
			'import { bearer } from "@monarcode/effetch/plugins";',
			'import { FetchTest } from "@monarcode/effetch/test";',
			"export const client = Fetch.make({ plugins: [bearer({ token: 'x' })] });",
			"export const Backend = FetchTest.layer([]);",
		);
		expect(migrate(source)).toEqual({
			fileName: "/project/a.ts",
			text: source,
			changed: false,
			warnings: [],
		});
	});

	it("reads TSX and JavaScript", () => {
		expect(
			migrate(
				lines(
					'import { make } from "@monarcode/effetch";',
					"export const App = () => <div>{String(make)}</div>;",
				),
				"/project/App.tsx",
			).text,
		).toBe(
			lines(
				'import { Fetch } from "@monarcode/effetch";',
				"export const App = () => <div>{String(Fetch.make)}</div>;",
			),
		);
		expect(
			migrate(
				lines(
					'import { make } from "@monarcode/effetch"',
					"export const client = make({})",
				),
				"/project/client.mjs",
			).text,
		).toBe(
			lines(
				'import { Fetch } from "@monarcode/effetch"',
				"export const client = Fetch.make({})",
			),
		);
	});

	it("runs as a CLI, with --dry-run", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "effetch-migrate-"));
		const file = path.join(dir, "api.ts");
		const old = lines(
			'import * as Fetch from "@monarcode/effetch";',
			"export const make = Fetch.make;",
		);
		const migrated = lines(
			'import { Fetch } from "@monarcode/effetch";',
			"export const make = Fetch.make;",
		);
		writeFileSync(file, old);
		writeFileSync(path.join(dir, "other.ts"), "export const x = 1;\n");
		writeFileSync(
			path.join(dir, "plugins.ts"),
			'import { bearer } from "@monarcode/effetch/plugins";\n',
		);
		// Outside a git repository, build output is skipped, and reported.
		mkdirSync(path.join(dir, "src", "build"), { recursive: true });
		const nested = path.join(dir, "src", "build", "steps.ts");
		writeFileSync(nested, old);
		const cli = path.resolve("bin/effetch-migrate.mjs");
		const dry = execFileSync("node", [cli, "--dry-run", dir, file], {
			encoding: "utf8",
		});
		expect(dry).toContain("Would update");
		expect(dry).toContain(
			"1 of 1 files importing @monarcode/effetch would change",
		);
		expect(dry).toContain("Skipped, as build output:");
		expect(dry).toContain(path.join("src", "build"));
		expect(readFileSync(file, "utf8")).toBe(old);
		execFileSync("node", [cli, dir], { encoding: "utf8" });
		expect(readFileSync(file, "utf8")).toBe(migrated);
		expect(readFileSync(nested, "utf8")).toBe(old);
		expect(() =>
			execFileSync("node", [cli, path.join(dir, "missing")], {
				encoding: "utf8",
				stdio: "pipe",
			}),
		).toThrow(/no such file or directory/);
	});

	it("reads what git sees in a repository", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "effetch-migrate-git-"));
		execFileSync("git", ["init", "-q"], { cwd: dir });
		const old = lines(
			'import * as Fetch from "@monarcode/effetch";',
			"export const make = Fetch.make;",
		);
		writeFileSync(path.join(dir, ".gitignore"), "generated/\n");
		mkdirSync(path.join(dir, "generated"));
		mkdirSync(path.join(dir, "src", "build"), { recursive: true });
		const ignored = path.join(dir, "generated", "api.js");
		const nested = path.join(dir, "src", "build", "steps.ts");
		writeFileSync(ignored, old);
		writeFileSync(nested, old);
		execFileSync("node", [path.resolve("bin/effetch-migrate.mjs"), dir], {
			encoding: "utf8",
		});
		expect(readFileSync(nested, "utf8")).not.toBe(old);
		expect(readFileSync(ignored, "utf8")).toBe(old);
		// A directory git ignores is read when it's the one given.
		execFileSync(
			"node",
			[path.resolve("bin/effetch-migrate.mjs"), path.join(dir, "generated")],
			{ encoding: "utf8" },
		);
		expect(readFileSync(ignored, "utf8")).not.toBe(old);
	});
});
