export interface PackageManifest {
	readonly name?: unknown;
	readonly version?: unknown;
	readonly repository?: { readonly url?: unknown } | undefined;
	readonly publishConfig?:
		| { readonly access?: unknown; readonly registry?: unknown }
		| undefined;
}

export interface Release {
	readonly version: string;
	readonly tag: string;
	readonly prerelease: boolean;
	readonly notes: string;
}

export type DistTag = "latest" | "next";

export declare function prepareRelease(
	manifest: PackageManifest,
	changelog: string,
	version: unknown,
): Release;

export declare function chooseDistTag(
	version: string,
	published: ReadonlyArray<string>,
): DistTag;

export declare function checkRegistry(
	version: string,
	request?: (url: string) => Promise<{
		readonly status: number;
		readonly ok: boolean;
		readonly json: () => Promise<unknown>;
	}>,
): Promise<{ readonly distTag: DistTag }>;
