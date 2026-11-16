/** The message of a thrown value: an `Error`'s, or the value as a string. */
export const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
