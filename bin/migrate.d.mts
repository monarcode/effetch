import type ts from "typescript";

export interface Source {
	readonly fileName: string;
	readonly text: string;
}

export interface Warning {
	readonly line: number;
	readonly message: string;
}

export interface Migrated {
	readonly fileName: string;
	readonly text: string;
	readonly changed: boolean;
	readonly warnings: ReadonlyArray<Warning>;
}

export declare function migrateSources(
	typescript: typeof ts,
	sources: ReadonlyArray<Source>,
): Array<Migrated>;
