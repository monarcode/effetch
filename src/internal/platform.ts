import * as Predicate from "effect/Predicate";

/**
 * `true` in React Native, which sets `navigator.product` to
 * `"ReactNative"`. Browsers, Node, Bun and Deno don't.
 */
export const isReactNative = (): boolean => {
	const navigator: unknown = Reflect.get(globalThis, "navigator");
	return (
		Predicate.hasProperty(navigator, "product") &&
		navigator.product === "ReactNative"
	);
};

/**
 * True when `value` is an instance of the global constructor `name`.
 *
 * Falls back to the `Object.prototype.toString` tag so values from another
 * realm (an iframe, a `vm` context, a second undici copy) still match.
 * React Native's polyfills have no tag, but they are the global
 * constructors, so `instanceof` covers them.
 */
export const isGlobalInstance = (value: unknown, name: string): boolean => {
	const constructor = (globalThis as Record<string, unknown>)[name];
	return (
		(typeof constructor === "function" && value instanceof constructor) ||
		Object.prototype.toString.call(value) === `[object ${name}]`
	);
};

export const isBlob = (value: unknown): value is Blob =>
	isGlobalInstance(value, "Blob") || isGlobalInstance(value, "File");

/**
 * The parts of `form`, as name and value. React Native's `FormData` has no
 * `forEach`, but `getParts`, which gives a string part as `{ fieldName,
 * string }` and a file part as `{ fieldName, uri, name, type }`; a file
 * part comes back as the `{ uri, name, type }` it was appended as.
 */
export const formParts = (
	form: FormData,
): ReadonlyArray<readonly [string, unknown]> => {
	const parts: Array<readonly [string, unknown]> = [];
	if (typeof form.forEach === "function") {
		form.forEach((value, name) => {
			parts.push([name, value]);
		});
		return parts;
	}
	const getParts: unknown = Reflect.get(form, "getParts");
	const native: unknown =
		typeof getParts === "function" ? getParts.call(form) : [];
	for (const part of Array.isArray(native) ? native : []) {
		if (!Predicate.hasProperty(part, "fieldName")) {
			continue;
		}
		const name = String(part.fieldName);
		if (Predicate.hasProperty(part, "string")) {
			parts.push([name, part.string]);
		} else if (Predicate.hasProperty(part, "uri")) {
			const {
				uri,
				name: fileName,
				type,
			} = part as {
				readonly uri: unknown;
				readonly name?: unknown;
				readonly type?: unknown;
			};
			parts.push([name, { uri, name: fileName, type }]);
		}
	}
	return parts;
};
