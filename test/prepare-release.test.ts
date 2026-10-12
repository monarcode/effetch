import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
	checkRegistry,
	chooseDistTag,
	prepareRelease,
} from "../scripts/prepare-release.mjs";

const manifest = {
	name: "@monarcode/effetch",
	version: "0.1.0-alpha.1",
	repository: { url: "git+https://github.com/monarcode/effetch.git" },
	publishConfig: {
		access: "public",
		registry: "https://registry.npmjs.org/",
	},
};

const changelog =
	"# Changelog\n\n## 0.1.0-alpha.1\n\n### Added\n\n- New things.\n\n### Fixed\n\n- A bug.\n\n## 0.1.0-alpha.0\n\nFirst preview.\n";

describe("prepareRelease", () => {
	it("takes the notes of the version only, subsections included", () => {
		expect(prepareRelease(manifest, changelog, manifest.version)).toEqual({
			version: "0.1.0-alpha.1",
			tag: "v0.1.0-alpha.1",
			prerelease: true,
			notes: "### Added\n\n- New things.\n\n### Fixed\n\n- A bug.",
		});
		expect(
			prepareRelease(
				manifest,
				changelog.replaceAll("\n", "\r\n"),
				manifest.version,
			).tag,
		).toBe("v0.1.0-alpha.1");
	});

	it.each([
		["0.1.0", false],
		["1.0.0", false],
		["0.1.0-alpha.3", true],
		["0.1.0-beta.0", true],
		["0.1.0-rc.0", true],
		["0.1.0-rc.12", true],
	])("accepts %s (prerelease: %s)", (version, prerelease) => {
		const release = prepareRelease(
			{ ...manifest, version },
			`# Changelog\n\n## ${version}\n\nNotes.\n`,
			version,
		);
		expect(release).toEqual({
			version,
			tag: `v${version}`,
			prerelease,
			notes: "Notes.",
		});
	});

	it.each([
		"v0.1.0-alpha.1",
		"v0.1.0",
		"0.1",
		"0.1.0-rc",
		"0.1.0-rc.0.1",
		"0.1.0-pre.1",
		"0.1.0-RC.1",
		"0.1.0-alpha.01",
		"01.1.0-alpha.1",
		"0.1.0+build.1",
		" 0.1.0-alpha.1",
		"0.1.0-alpha.1\n",
		"$(echo bad)",
		undefined,
	])("rejects %j, which isn't a release version", (version) => {
		expect(() => prepareRelease(manifest, changelog, version)).toThrow(
			/Use a version such as/,
		);
	});

	it("rejects a version that isn't package.json's", () => {
		expect(() =>
			prepareRelease(manifest, changelog, "0.1.0-alpha.2"),
		).toThrow(/match package/);
	});

	it.each([
		{ name: "@monarcode/session-kit" },
		{ repository: { url: "git+https://github.com/someone/effetch.git" } },
		{ repository: undefined },
		{
			publishConfig: {
				access: "restricted",
				registry: "https://registry.npmjs.org/",
			},
		},
		{ publishConfig: { access: "public", registry: "https://example.com/" } },
	])("rejects the wrong package identity: %j", (change) => {
		expect(() =>
			prepareRelease(
				{ ...manifest, ...change },
				changelog,
				manifest.version,
			),
		).toThrow(/does not match effetch/);
	});

	it.each([
		["a missing heading", "# Changelog\n\n## 0.1.0-alpha.0\n\nOld.\n"],
		["a duplicate heading", `${changelog}\n## 0.1.0-alpha.1\n\nAgain.\n`],
		["a bracketed heading", "# Changelog\n\n## [0.1.0-alpha.1]\n\nNotes.\n"],
	])("rejects %s", (_, text) => {
		expect(() => prepareRelease(manifest, text, manifest.version)).toThrow(
			/exactly one heading/,
		);
	});

	it.each([
		[
			"followed by another version",
			"## 0.1.0-alpha.1\n\n## 0.1.0-alpha.0\nOld",
		],
		["at the end", "# Changelog\n\n## 0.1.0-alpha.1\n\n  \n"],
	])("rejects empty notes %s", (_, text) => {
		expect(() => prepareRelease(manifest, text, manifest.version)).toThrow(
			/must not be empty/,
		);
	});
});

describe("chooseDistTag", () => {
	it.each([
		["0.1.0", [], "latest"],
		["0.1.0", ["0.1.0-rc.0"], "latest"],
		["0.2.0", ["0.1.0"], "latest"],
		["0.1.0-rc.0", [], "latest"],
		["0.1.0-rc.0", ["0.0.0-stage", "0.1.0-alpha.2"], "latest"],
		["0.2.0-rc.0", ["0.1.0-rc.0", "0.1.0"], "next"],
	] as const)("tags %s with %j published as %s", (version, published, tag) => {
		expect(chooseDistTag(version, published)).toBe(tag);
	});
});

describe("checkRegistry", () => {
	const answering = (status: number, versions: Array<string> = []) => {
		const urls: Array<string> = [];
		const request = async (url: string) => {
			urls.push(url);
			return {
				status,
				ok: status >= 200 && status < 300,
				json: async () => ({
					versions: Object.fromEntries(versions.map((v) => [v, {}])),
				}),
			};
		};
		return { urls, request };
	};

	it("passes when the package isn't on npm (404)", async () => {
		const { urls, request } = answering(404);
		await expect(checkRegistry("0.1.0-alpha.1", request)).resolves.toEqual({
			distTag: "latest",
		});
		expect(urls).toEqual(["https://registry.npmjs.org/@monarcode%2Feffetch"]);
	});

	it("passes with the dist-tag when the version is new", async () => {
		await expect(
			checkRegistry("0.1.0-rc.0", answering(200, ["0.1.0-alpha.2"]).request),
		).resolves.toEqual({ distTag: "latest" });
		await expect(
			checkRegistry("0.2.0-rc.0", answering(200, ["0.1.0"]).request),
		).resolves.toEqual({ distTag: "next" });
	});

	it("fails when the version is already published", async () => {
		await expect(
			checkRegistry(
				"0.1.0-alpha.1",
				answering(200, ["0.1.0-alpha.0", "0.1.0-alpha.1"]).request,
			),
		).rejects.toThrow(/already published/);
	});

	it("fails on any other answer (500) or a network error", async () => {
		await expect(
			checkRegistry("0.1.0-alpha.1", answering(500).request),
		).rejects.toThrow(/HTTP 500/);
		await expect(
			checkRegistry("0.1.0-alpha.1", async () => {
				throw new Error("Network unavailable");
			}),
		).rejects.toThrow(/Network unavailable/);
	});
});

describe("the command", () => {
	const script = path.resolve("scripts/prepare-release.mjs");

	it("writes release-notes.md and release.json", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "effetch-release-"));
		writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
		writeFileSync(path.join(dir, "CHANGELOG.md"), changelog);
		execFileSync("node", [script, manifest.version, "out"], { cwd: dir });
		expect(
			readFileSync(path.join(dir, "out", "release-notes.md"), "utf8"),
		).toBe("### Added\n\n- New things.\n\n### Fixed\n\n- A bug.\n");
		expect(
			JSON.parse(
				readFileSync(path.join(dir, "out", "release.json"), "utf8"),
			),
		).toEqual({
			version: "0.1.0-alpha.1",
			tag: "v0.1.0-alpha.1",
			prerelease: true,
			notes: "### Added\n\n- New things.\n\n### Fixed\n\n- A bug.",
		});
	});

	it("fails without an output directory or with an unknown flag", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "effetch-release-"));
		for (const args of [
			[manifest.version],
			[manifest.version, "out", "--publish"],
		]) {
			expect(() =>
				execFileSync("node", [script, ...args], {
					cwd: dir,
					stdio: "pipe",
				}),
			).toThrow(/Usage/);
		}
	});
});
