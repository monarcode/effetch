import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function prepareRelease(manifest, changelog, version) {
	const number = "(?:0|[1-9][0-9]*)";
	const alpha = new RegExp(
		`^${number}\\.${number}\\.${number}-alpha\\.${number}$`,
	);
	if (
		typeof version !== "string" ||
		version.trim() !== version ||
		!alpha.test(version)
	) {
		throw new Error(
			"Use an alpha version such as 0.1.0-alpha.1, without a v prefix.",
		);
	}
	if (manifest.version !== version)
		throw new Error("Version must match package.json.");
	if (
		manifest.name !== "@monarcode/effetch" ||
		manifest.repository?.url !==
			"git+https://github.com/monarcode/effetch.git" ||
		manifest.publishConfig?.access !== "public" ||
		manifest.publishConfig?.registry !== "https://registry.npmjs.org/"
	) {
		throw new Error(
			"Package identity or publishing configuration does not match effetch.",
		);
	}
	const sections = [...changelog.matchAll(/^## (.+)\r?$/gm)];
	const matching = sections.filter((section) => section[1].trim() === version);
	if (matching.length !== 1)
		throw new Error(
			"CHANGELOG.md must contain exactly one heading for this version.",
		);
	const section = matching[0];
	const next = sections[sections.indexOf(section) + 1];
	const notes = changelog
		.slice(section.index + section[0].length, next?.index)
		.trim();
	if (!notes) throw new Error("Release notes must not be empty.");
	return { version, tag: `v${version}`, notes };
}

export async function checkRegistry(version, request = fetch) {
	const response = await request(
		`https://registry.npmjs.org/@monarcode%2Feffetch/${version}`,
	);
	if (response.status === 404) return;
	if (response.ok) throw new Error(`Version ${version} is already published.`);
	throw new Error(`npm registry check failed with HTTP ${response.status}.`);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const [version, directory, registryFlag] = process.argv.slice(2);
	if (!directory || (registryFlag && registryFlag !== "--check-registry")) {
		throw new Error(
			"Usage: node scripts/prepare-release.mjs VERSION OUTPUT_DIRECTORY [--check-registry]",
		);
	}
	const manifest = JSON.parse(await readFile("package.json", "utf8"));
	const changelog = await readFile("CHANGELOG.md", "utf8");
	const release = prepareRelease(manifest, changelog, version);
	if (registryFlag) await checkRegistry(release.version);
	await mkdir(directory, { recursive: true });
	await writeFile(
		resolve(directory, "release-notes.md"),
		`${release.notes}\n`,
	);
	await writeFile(
		resolve(directory, "release.json"),
		`${JSON.stringify(release, null, 2)}\n`,
	);
}
