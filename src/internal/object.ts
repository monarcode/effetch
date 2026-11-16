/** `true` if `key` is an own property of `object`, never an inherited one. */
export const hasOwn = (object: object, key: string): boolean =>
	Object.prototype.hasOwnProperty.call(object, key);

/** `true` for a non-null object that isn't an array. */
export const isRecord = (u: unknown): u is Readonly<Record<string, unknown>> =>
	typeof u === "object" && u !== null && !Array.isArray(u);
