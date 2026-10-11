/** `true` if `key` is an own property of `object`, never an inherited one. */
export const hasOwn = (object: object, key: string): boolean =>
	Object.prototype.hasOwnProperty.call(object, key);
