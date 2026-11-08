import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Headers from "effect/http/Headers";
import type * as HttpBody from "effect/http/HttpBody";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { type Plugin, type PluginExitContext, plugin } from "../Plugin.js";

/**
 * How much {@link consoleLogger} prints for each call.
 *
 * - `"summary"`: one line, such as
 *   `✗ POST /users/:id/roles  400 Bad Request  120 ms  → InvalidRole`.
 * - `"headers"`: that line opens a group holding the full URL, the request
 *   and response headers, and the error.
 * - `"full"`: the request and response bodies too.
 *
 * @example
 * ```ts
 * import type { ConsoleLoggerDetail } from "@monarcode/effetch/plugins";
 *
 * const detail: ConsoleLoggerDetail = "headers";
 * ```
 *
 * @since 0.1.0
 */
export type ConsoleLoggerDetail = "summary" | "headers" | "full";

/**
 * The options of {@link consoleLogger} that calls can override, with
 * `plugins: { consoleLogger: { ... } }`. See {@link ConsoleLoggerOptions}
 * for what each does.
 *
 * @example
 * ```ts
 * import type { ConsoleLoggerSettings } from "@monarcode/effetch/plugins";
 *
 * const quiet: Partial<ConsoleLoggerSettings> = {
 *   detail: "summary",
 *   only: "errors",
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface ConsoleLoggerSettings {
	/** How much to print for each call. */
	readonly detail: ConsoleLoggerDetail;
	/** Which calls to print: `"all"`, or only the failed ones (`"errors"`). */
	readonly only: "all" | "errors";
	/**
	 * Whether each call's group starts collapsed. `false` by default in
	 * React Native, where Metro's terminal drops collapsed groups.
	 */
	readonly collapsed: boolean;
	/** Calls that take at least this long are flagged; `false` for none. */
	readonly slow: Duration.Input | false;
	/** Body text longer than this many characters is cut. */
	readonly maxBodyLength: number;
}

/**
 * Names to redact on top of {@link consoleLogger}'s defaults. Strings match
 * a name ignoring case, `-` and `_`, so `"accessToken"` also matches
 * `access_token` and `Access-Token`. A `RegExp` is tested against the name
 * as it is.
 *
 * @example
 * ```ts
 * import type { ConsoleLoggerRedact } from "@monarcode/effetch/plugins";
 *
 * const redact: ConsoleLoggerRedact = {
 *   headers: ["x-session"],
 *   query: ["invite"],
 *   body: ["otp", /^card/i],
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface ConsoleLoggerRedact {
	/** Request and response header names. */
	readonly headers?: ReadonlyArray<string | RegExp> | undefined;
	/** Query parameter names. */
	readonly query?: ReadonlyArray<string | RegExp> | undefined;
	/**
	 * Keys in JSON bodies (at any depth), and field names in form bodies,
	 * of requests and responses.
	 */
	readonly body?: ReadonlyArray<string | RegExp> | undefined;
}

/**
 * The call {@link ConsoleLoggerOptions.filter} decides on.
 *
 * - `route`: the call's method and unfilled path, such as
 *   `"GET /users/:id"`.
 * - `request`: the request that was sent, after every plugin changed it.
 *   Without a response, it's the request as the call built it, before
 *   plugins ran.
 * - `response`: the response, or `undefined` when there was none.
 * - `exit`: the call's outcome.
 * - `durationMs`: how long the call took, in milliseconds.
 *
 * @example
 * ```ts
 * import type { ConsoleLoggerCall } from "@monarcode/effetch/plugins";
 *
 * const notHealthChecks = (call: ConsoleLoggerCall): boolean =>
 *   call.route !== "GET /health";
 * ```
 *
 * @since 0.1.0
 */
export interface ConsoleLoggerCall {
	/** The call's method and unfilled path, such as `"GET /users/:id"`. */
	readonly route: string;
	/** The request that was sent. */
	readonly request: HttpClientRequest.HttpClientRequest;
	/** The response, or `undefined` when there was none. */
	readonly response: HttpClientResponse.HttpClientResponse | undefined;
	/** The call's outcome. */
	readonly exit: Exit.Exit<unknown, unknown>;
	/** How long the call took, in milliseconds. */
	readonly durationMs: number;
}

/**
 * How {@link consoleLogger} colors its output.
 *
 * - `"auto"`: `"css"` where there's a `document` (browsers), else `false`.
 * - `"css"`: `%c` styles, for browser devtools and React Native DevTools.
 * - `"ansi"`: terminal escape codes, for Node, Bun and Deno.
 * - `false`: plain text.
 *
 * @example
 * ```ts
 * import type { ConsoleLoggerColor } from "@monarcode/effetch/plugins";
 *
 * const color: ConsoleLoggerColor = "ansi";
 * ```
 *
 * @since 0.1.0
 */
export type ConsoleLoggerColor = "auto" | "css" | "ansi" | false;

/**
 * Options for {@link consoleLogger}. All are optional.
 *
 * - `enabled`: `false` makes the plugin do nothing, keeping its type, so
 *   it can stay in the plugin list in production. Defaults to `true`.
 * - `detail`: `"summary"`, `"headers"` or `"full"` (the default). See
 *   {@link ConsoleLoggerDetail}.
 * - `only`: `"all"` calls (the default), or `"errors"` for failed ones
 *   only. An interrupted call isn't a failed one.
 * - `collapsed`: whether groups start collapsed. Defaults to `true`, and
 *   to `false` in React Native: Metro's terminal drops
 *   `console.groupCollapsed` and everything logged inside it. Node, Bun
 *   and Deno print collapsed groups expanded.
 * - `slow`: calls that take at least this long are flagged with `⚠` and
 *   `(slow)`. Defaults to `false`, flagging none.
 * - `maxBodyLength`: body text longer than this many characters is cut.
 *   A JSON body within it is printed as an object, for devtools to
 *   expand; a longer one as its cut text. Defaults to `10_000`.
 * - `redact`: names to redact on top of the defaults, or `false` to
 *   redact nothing. See {@link ConsoleLoggerRedact}.
 * - `filter`: prints only the calls it returns `true` for.
 * - `color`: see {@link ConsoleLoggerColor}. Defaults to `"auto"`.
 *
 * Calls can override `detail`, `only`, `collapsed`, `slow` and
 * `maxBodyLength` (see {@link ConsoleLoggerSettings}).
 *
 * @example
 * ```ts
 * import type { ConsoleLoggerOptions } from "@monarcode/effetch/plugins";
 *
 * const options: ConsoleLoggerOptions = {
 *   detail: "headers",
 *   slow: "1 second",
 *   redact: { body: ["otp"] },
 *   filter: (call) => call.route !== "GET /health",
 * };
 * ```
 *
 * @since 0.1.0
 */
export interface ConsoleLoggerOptions {
	/** `false` makes the plugin do nothing. Defaults to `true`. */
	readonly enabled?: boolean | undefined;
	/** How much to print for each call. Defaults to `"full"`. */
	readonly detail?: ConsoleLoggerDetail | undefined;
	/** Which calls to print. Defaults to `"all"`. */
	readonly only?: "all" | "errors" | undefined;
	/**
	 * Whether groups start collapsed. Defaults to `true`, and to `false` in
	 * React Native, where Metro's terminal drops collapsed groups.
	 */
	readonly collapsed?: boolean | undefined;
	/** Flags calls that take at least this long. Defaults to `false`. */
	readonly slow?: Duration.Input | false | undefined;
	/** Body text longer than this is cut. Defaults to `10_000`. */
	readonly maxBodyLength?: number | undefined;
	/** Names to redact on top of the defaults, or `false` for none. */
	readonly redact?: ConsoleLoggerRedact | false | undefined;
	/** Prints only the calls it returns `true` for. */
	readonly filter?: ((call: ConsoleLoggerCall) => boolean) | undefined;
	/** How to color the output. Defaults to `"auto"`. */
	readonly color?: ConsoleLoggerColor | undefined;
}

/**
 * The plugin made by {@link consoleLogger}. Calls can skip it
 * (`plugins: { consoleLogger: false }`) or override its
 * {@link ConsoleLoggerSettings}.
 *
 * @example
 * ```ts
 * import {
 *   consoleLogger,
 *   type ConsoleLoggerPlugin,
 * } from "@monarcode/effetch/plugins";
 *
 * const log: ConsoleLoggerPlugin = consoleLogger({ detail: "summary" });
 * ```
 *
 * @since 0.1.0
 */
export type ConsoleLoggerPlugin = Plugin<
	"consoleLogger",
	never,
	never,
	ConsoleLoggerSettings
>;

/** Matches names, ignoring case, `-` and `_` for strings. */
type Matcher = (name: string) => boolean;

/** The fixed parts of a logger: what {@link consoleLogger} was given. */
interface Config {
	readonly color: "css" | "ansi" | false;
	/** `undefined` when nothing is redacted. */
	readonly redact:
		| {
				readonly headers: ReadonlyArray<string | RegExp>;
				readonly query: Matcher;
				readonly body: Matcher;
		  }
		| undefined;
	readonly filter: ((call: ConsoleLoggerCall) => boolean) | undefined;
}

const redactedText = "<redacted>";

/**
 * Names of credentials, matched ignoring case, `-` and `_` (so `"apiKey"`
 * also matches `api_key` and `API-KEY`). Exact names rather than patterns
 * such as `/token/`, which would hide fields like `total_tokens`.
 */
const credentials: ReadonlyArray<string | RegExp> = [
	"token",
	"accessToken",
	"refreshToken",
	"idToken",
	"authToken",
	"apiToken",
	"sessionToken",
	"csrfToken",
	"xsrfToken",
	"secret",
	"clientSecret",
	"apiSecret",
	"apiKey",
	"privateKey",
	/password/i,
];

/**
 * Header names redacted on top of Effect's `Headers.CurrentRedactedNames`
 * (`authorization`, `cookie`, `set-cookie` and `x-api-key` by default).
 */
const defaultHeaders: ReadonlyArray<string | RegExp> = [
	"proxy-authorization",
	"x-auth-token",
	"x-access-token",
	"x-refresh-token",
	"x-session-token",
	"x-csrf-token",
	"x-xsrf-token",
	"x-client-secret",
	"x-amz-security-token",
];

const defaultQuery: ReadonlyArray<string | RegExp> = [
	...credentials,
	"key",
	"sig",
	"signature",
	"X-Amz-Signature",
	"X-Amz-Credential",
	"X-Amz-Security-Token",
	"X-Goog-Signature",
	"X-Goog-Credential",
	"AWSAccessKeyId",
];

const defaultBody: ReadonlyArray<string | RegExp> = credentials;

const normalize = (name: string): string =>
	name.toLowerCase().replace(/[-_]/g, "");

const matcher = (patterns: ReadonlyArray<string | RegExp>): Matcher => {
	const names = new Set<string>();
	const regexps: Array<RegExp> = [];
	for (const pattern of patterns) {
		if (Predicate.isString(pattern)) {
			names.add(normalize(pattern));
		} else {
			regexps.push(pattern);
		}
	}
	return (name) =>
		names.has(normalize(name)) ||
		regexps.some((pattern) => name.search(pattern) !== -1);
};

const noMatch: Matcher = () => false;

// --- Formatting -------------------------------------------------------------

type Tone = "plain" | "bold" | "dim" | "green" | "cyan" | "yellow" | "red";

interface Segment {
	readonly text: string;
	readonly tone: Tone;
}

const segment = (text: string, tone: Tone = "plain"): Segment => ({
	text,
	tone,
});

const css: Record<Tone, string> = {
	plain: "",
	bold: "font-weight: bold",
	dim: "color: #888",
	green: "color: #2e9d4f",
	cyan: "color: #2b8cbe",
	yellow: "color: #c47f00",
	red: "color: #d93025",
};

const ansi: Record<Tone, readonly [string, string]> = {
	plain: ["", ""],
	bold: ["\u001b[1m", "\u001b[22m"],
	dim: ["\u001b[2m", "\u001b[22m"],
	green: ["\u001b[32m", "\u001b[39m"],
	cyan: ["\u001b[36m", "\u001b[39m"],
	yellow: ["\u001b[33m", "\u001b[39m"],
	red: ["\u001b[31m", "\u001b[39m"],
};

/**
 * `text` safe to use as a console format string: a `%` that would start a
 * substitution, such as `%d` in a path, is doubled.
 */
const literal = (text: string): string =>
	/%[sdifoOcj%]/.test(text) ? text.replace(/%/g, "%%") : text;

/** The console arguments that print `segments` in `color`. */
const render = (
	segments: ReadonlyArray<Segment>,
	color: Config["color"],
): Array<unknown> => {
	if (color === "css") {
		return [
			segments.map((part) => `%c${literal(part.text)}`).join(""),
			...segments.map((part) => css[part.tone]),
		];
	}
	return [
		segments
			.map((part) => {
				const text = literal(part.text);
				if (color === false) {
					return text;
				}
				const [open, close] = ansi[part.tone];
				return open + text + close;
			})
			.join(""),
	];
};

const statusTexts: Readonly<Record<number, string>> = {
	200: "OK",
	201: "Created",
	202: "Accepted",
	204: "No Content",
	206: "Partial Content",
	301: "Moved Permanently",
	302: "Found",
	303: "See Other",
	304: "Not Modified",
	307: "Temporary Redirect",
	308: "Permanent Redirect",
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	406: "Not Acceptable",
	408: "Request Timeout",
	409: "Conflict",
	410: "Gone",
	412: "Precondition Failed",
	413: "Content Too Large",
	415: "Unsupported Media Type",
	422: "Unprocessable Content",
	423: "Locked",
	428: "Precondition Required",
	429: "Too Many Requests",
	500: "Internal Server Error",
	501: "Not Implemented",
	502: "Bad Gateway",
	503: "Service Unavailable",
	504: "Gateway Timeout",
};

const statusTone = (status: number): Tone =>
	status < 300
		? "green"
		: status < 400
			? "cyan"
			: status < 500
				? "yellow"
				: "red";

const formatDuration = (ms: number): string =>
	ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

const formatBytes = (bytes: number): string =>
	bytes < 1000
		? `${bytes} B`
		: bytes < 1_000_000
			? `${(bytes / 1000).toFixed(1)} kB`
			: `${(bytes / 1_000_000).toFixed(1)} MB`;

/** `text` on one line, cut to `max` characters. */
const oneLine = (text: string, max = 160): string => {
	const line = text.replace(/\s+/g, " ").trim();
	return line.length > max ? `${line.slice(0, max)}…` : line;
};

/** `text` cut to `max` characters, saying how many were left out. */
const cut = (text: string, max: number): string =>
	text.length > max
		? `${text.slice(0, max)}… (${text.length - max} more characters)`
		: text;

// --- Outcome ----------------------------------------------------------------

type Outcome =
	| { readonly _tag: "Success" }
	| { readonly _tag: "Interrupted" }
	| {
			readonly _tag: "Failure";
			readonly error: unknown;
			readonly defect: boolean;
	  };

const outcomeOf = (exit: Exit.Exit<unknown, unknown>): Outcome => {
	if (Exit.isSuccess(exit)) {
		return { _tag: "Success" };
	}
	if (Cause.hasInterruptsOnly(exit.cause)) {
		return { _tag: "Interrupted" };
	}
	return {
		_tag: "Failure",
		error: Cause.squash(exit.cause),
		defect: !Cause.hasFails(exit.cause),
	};
};

const nameOf = (error: unknown): string | undefined =>
	Predicate.hasProperty(error, "_tag") && Predicate.isString(error._tag)
		? error._tag
		: error instanceof Error
			? error.name
			: undefined;

const messageOf = (error: unknown): string =>
	Predicate.isString(error)
		? error
		: Predicate.hasProperty(error, "message") &&
			  Predicate.isString(error.message)
			? error.message
			: "";

/**
 * A short description of `error` for the summary line: its tag or name,
 * and its message without the `"<method> <url>: "` that effetch's own
 * errors start with. An `HttpError` is its tag alone, as the line shows
 * the status, and a `NetworkError` shows its cause's message.
 */
const describeError = (error: unknown, method: string): string => {
	const name = nameOf(error);
	if (name === "HttpError") {
		return name;
	}
	const source =
		name === "NetworkError" && Predicate.hasProperty(error, "cause")
			? error.cause
			: error;
	const prefix = new RegExp(`^${method} \\S+: `);
	const message = oneLine(messageOf(source).replace(prefix, ""));
	if (name === undefined) {
		return message === "" ? "unknown error" : message;
	}
	return message === "" || message === name ? name : `${name}: ${message}`;
};

// --- Request ----------------------------------------------------------------

/** The `user:password@` part of an absolute URL, after its scheme. */
const userinfo = /^([a-z][a-z\d+.-]*:\/\/)[^/?#]*@/i;

/** Decodes a query key, or returns it as it is when it isn't valid. */
const decodeKey = (key: string): string => {
	try {
		return decodeURIComponent(key.replace(/\+/g, " "));
	} catch {
		return key;
	}
};

/**
 * The request's full URL: its `url`, query string and hash, with redacted
 * query values replaced. Built with string operations, not `new URL()`.
 */
const fullUrl = (
	request: HttpClientRequest.HttpClientRequest,
	redact: Matcher,
): string => {
	const hashAt = request.url.indexOf("#");
	const beforeHash =
		hashAt === -1 ? request.url : request.url.slice(0, hashAt);
	const queryAt = beforeHash.indexOf("?");
	const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
	const parts =
		queryAt === -1
			? []
			: beforeHash
					.slice(queryAt + 1)
					.split("&")
					.filter((part) => part !== "");
	for (const [key, value] of request.urlParams.params) {
		// A `Redacted` value (Effect 4.1) isn't a string.
		const shown: unknown = value;
		parts.push(
			`${encodeURIComponent(key)}=${
				Predicate.isString(shown) ? encodeURIComponent(shown) : redactedText
			}`,
		);
	}
	const query = parts.map((part) => {
		const equals = part.indexOf("=");
		const key = equals === -1 ? part : part.slice(0, equals);
		return redact(decodeKey(key)) ? `${key}=${redactedText}` : part;
	});
	const origin =
		redact === noMatch
			? path
			: path.replace(
					userinfo,
					(_, scheme: string) => `${scheme}${redactedText}@`,
				);
	const hash =
		Option.getOrUndefined(request.hash) ??
		(hashAt === -1 ? undefined : request.url.slice(hashAt + 1));
	return (
		origin +
		(query.length === 0 ? "" : `?${query.join("&")}`) +
		(hash === undefined || hash === "" ? "" : `#${hash}`)
	);
};

const headersObject = (
	headers: Headers.Headers,
	redact: Matcher,
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(headers).map(([name, value]) => [
			name,
			redact(name) ? redactedText : value,
		]),
	);

/** `value` with the values of matching keys replaced, at any depth. */
const redactValue = (value: unknown, redact: Matcher, depth = 0): unknown => {
	if (depth > 64) {
		// Too deep to check, so not shown.
		return "<…>";
	}
	if (Array.isArray(value)) {
		return value.map((item) => redactValue(item, redact, depth + 1));
	}
	if (Predicate.isObject(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				redact(key) ? redactedText : redactValue(item, redact, depth + 1),
			]),
		);
	}
	return value;
};

/** The media type of a `content-type`, lowercased, without parameters. */
const mediaTypeOf = (contentType: string | undefined): string =>
	(contentType ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";

const isJson = (mediaType: string): boolean =>
	mediaType === "application/json" || mediaType.endsWith("+json");

const isForm = (mediaType: string): boolean =>
	mediaType === "application/x-www-form-urlencoded";

/**
 * `true` for bodies worth reading as text. Event streams are left out:
 * they may never end.
 */
const isText = (mediaType: string): boolean =>
	(mediaType.startsWith("text/") && mediaType !== "text/event-stream") ||
	isJson(mediaType) ||
	isForm(mediaType) ||
	mediaType === "application/xml" ||
	mediaType.endsWith("+xml");

/** Form fields as an object: a field given more than once is a list. */
const fieldsObject = (
	fields: Iterable<readonly [string, unknown]>,
	redact: Matcher,
): Record<string, unknown> => {
	const grouped = new Map<string, Array<unknown>>();
	for (const [name, value] of fields) {
		const shown = redact(name) ? redactedText : value;
		const values = grouped.get(name);
		if (values === undefined) {
			grouped.set(name, [shown]);
		} else {
			values.push(shown);
		}
	}
	return Object.fromEntries(
		Array.from(grouped, ([name, values]) => [
			name,
			values.length === 1 ? values[0] : values,
		]),
	);
};

const parseForm = (text: string): Array<readonly [string, string]> =>
	text
		.split("&")
		.filter((part) => part !== "")
		.map((part) => {
			const equals = part.indexOf("=");
			return equals === -1
				? [decodeKey(part), ""]
				: [
						decodeKey(part.slice(0, equals)),
						decodeKey(part.slice(equals + 1)),
					];
		});

/**
 * A text body as it's printed: JSON and form bodies as objects (redacted)
 * when their text fits in `max`, anything else as its text, cut to `max`.
 */
const showText = (
	text: string,
	mediaType: string,
	max: number,
	redact: Matcher,
): unknown => {
	let value: unknown;
	if (isJson(mediaType)) {
		try {
			value = redactValue(JSON.parse(text), redact);
		} catch {
			return cut(text, max);
		}
	} else if (isForm(mediaType)) {
		value = fieldsObject(parseForm(text), redact);
	} else {
		return cut(text, max);
	}
	const json = JSON.stringify(value) ?? "";
	return json.length > max ? cut(json, max) : value;
};

/**
 * Bodies larger than this many bytes (or 4 × `maxBodyLength`, if larger)
 * aren't decoded and parsed just to print the start of them.
 */
const parseLimit = (max: number): number => Math.max(1_000_000, max * 4);

/** A `Blob` or `File`, described by its name, size and type. */
const describeBlob = (blob: unknown): string => {
	const name =
		Predicate.hasProperty(blob, "name") && Predicate.isString(blob.name)
			? blob.name
			: "blob";
	const size =
		Predicate.hasProperty(blob, "size") && typeof blob.size === "number"
			? formatBytes(blob.size)
			: undefined;
	const type =
		Predicate.hasProperty(blob, "type") &&
		Predicate.isString(blob.type) &&
		blob.type !== ""
			? blob.type
			: undefined;
	return `<${[name, size, type].filter(Predicate.isNotUndefined).join(", ")}>`;
};

const isBlob = (value: unknown): boolean =>
	typeof Blob !== "undefined" && value instanceof Blob;

const describeObject = (value: unknown): string =>
	isBlob(value)
		? describeBlob(value)
		: `<${
				Predicate.isObjectKeyword(value)
					? (Object.getPrototypeOf(value)?.constructor?.name ?? "object")
					: typeof value
			}>`;

const describeBinary = (mediaType: string, bytes: number | undefined): string =>
	`<${[mediaType === "" ? "binary" : mediaType, bytes === undefined ? undefined : formatBytes(bytes)].filter(Predicate.isNotUndefined).join(", ")}>`;

/** The request body as it's printed, or `undefined` for none. */
const showRequestBody = (
	body: HttpBody.HttpBody,
	max: number,
	redact: Matcher,
): unknown => {
	switch (body._tag) {
		case "Empty":
			return undefined;
		case "Uint8Array": {
			const mediaType = mediaTypeOf(body.contentType);
			if (
				!isText(mediaType) ||
				typeof TextDecoder === "undefined" ||
				body.contentLength > parseLimit(max)
			) {
				return describeBinary(mediaType, body.contentLength);
			}
			return showText(
				body.text ?? new TextDecoder().decode(body.body),
				mediaType,
				max,
				redact,
			);
		}
		case "Raw":
			return Predicate.isString(body.body) &&
				body.body.length <= parseLimit(max)
				? showText(body.body, mediaTypeOf(body.contentType), max, redact)
				: describeObject(body.body);
		case "FormData": {
			const { formData } = body;
			if (!Predicate.isFunction(formData.forEach)) {
				return "<FormData>";
			}
			const fields: Array<readonly [string, unknown]> = [];
			formData.forEach((value, name) => {
				fields.push([
					name,
					Predicate.isString(value) ? value : describeBlob(value),
				]);
			});
			return fieldsObject(fields, redact);
		}
		case "Stream":
			return `<stream${body.contentType === "" ? "" : `, ${body.contentType}`}>`;
	}
};

// --- Response ---------------------------------------------------------------

interface ResponseBody {
	/** The body as it's printed, or `undefined` to print none. */
	readonly shown: unknown;
	/** The body's size in bytes, when it was read. */
	readonly bytes: number | undefined;
}

const contentLengthOf = (
	response: HttpClientResponse.HttpClientResponse,
): number | undefined => {
	const header = response.headers["content-length"]?.trim();
	const length =
		header === undefined || !/^\d+$/.test(header)
			? Number.NaN
			: Number(header);
	return Number.isSafeInteger(length) ? length : undefined;
};

/**
 * Reads the response body to print it. The body is only read when it's
 * text and the call didn't return the response itself (a call without
 * `output`, whose caller may stream it). Effect caches it, so effetch
 * reading it before, or the caller after, is unaffected.
 */
const readResponseBody = (
	response: HttpClientResponse.HttpClientResponse,
	exit: Exit.Exit<unknown, unknown>,
	max: number,
	redact: Matcher,
): Effect.Effect<ResponseBody> => {
	if (
		response.request.method === "HEAD" ||
		response.status === 204 ||
		response.status === 205 ||
		response.status === 304 ||
		contentLengthOf(response) === 0
	) {
		return Effect.succeed({ shown: undefined, bytes: undefined });
	}
	if (Exit.isSuccess(exit) && exit.value === response) {
		return Effect.succeed({
			shown: "<not read: the call returns the response>",
			bytes: undefined,
		});
	}
	// Reading may wait for a body the call stopped downloading, and the hook
	// can't be interrupted.
	if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) {
		return Effect.succeed({
			shown: "<not read: the call was interrupted>",
			bytes: undefined,
		});
	}
	const mediaType = mediaTypeOf(response.headers["content-type"]);
	if (
		(mediaType !== "" && !isText(mediaType)) ||
		typeof TextDecoder === "undefined"
	) {
		return Effect.succeed({
			shown: describeBinary(mediaType, contentLengthOf(response)),
			bytes: undefined,
		});
	}
	const length = contentLengthOf(response);
	if (length !== undefined && length > parseLimit(max)) {
		return Effect.succeed({
			shown: describeBinary(mediaType, length),
			bytes: undefined,
		});
	}
	return response.arrayBuffer.pipe(
		Effect.map((buffer): ResponseBody => {
			if (buffer.byteLength > parseLimit(max)) {
				return {
					shown: describeBinary(mediaType, buffer.byteLength),
					bytes: buffer.byteLength,
				};
			}
			const text = new TextDecoder().decode(buffer);
			return {
				shown:
					text === "" ? undefined : showText(text, mediaType, max, redact),
				bytes: buffer.byteLength,
			};
		}),
		Effect.catchCause(() =>
			Effect.succeed<ResponseBody>({
				shown: "<the body couldn't be read>",
				bytes: undefined,
			}),
		),
	);
};

// --- Errors -----------------------------------------------------------------

/** What redaction applies to one call. */
interface Redaction {
	readonly headers: Matcher;
	readonly query: Matcher;
	readonly body: Matcher;
}

/**
 * A failure as it's printed. With redaction on, a plain copy of its fields
 * (with its tag and message), redacted like a body: errors can carry body
 * data. An `HttpError`'s `text` and a `DecodeError`'s `issue` are left
 * out, as the response body line shows that data, redacted.
 */
const showFailure = (
	error: unknown,
	redaction: Redaction | undefined,
): unknown => {
	if (redaction === undefined || !Predicate.isObject(error)) {
		return error;
	}
	const name = nameOf(error);
	const left =
		name === "HttpError"
			? "text"
			: name === "DecodeError"
				? "issue"
				: undefined;
	const fields: Array<readonly [string, unknown]> = [];
	for (const [key, value] of Object.entries(error)) {
		if (key === left || key === "_tag") {
			continue;
		}
		fields.push([
			key,
			redaction.body(key)
				? redactedText
				: Headers.isHeaders(value)
					? headersObject(value, redaction.headers)
					: value instanceof Error
						? value
						: redactValue(value, redaction.body),
		]);
	}
	return Object.fromEntries([
		...(name === undefined ? [] : [["_tag", name] as const]),
		["message", messageOf(error)],
		...fields,
	]);
};

// --- Printing ---------------------------------------------------------------

const labelWidth = "response headers".length;

const detailLine = (
	label: string,
	value: unknown,
	color: Config["color"],
): Array<unknown> => [
	...render([segment(label.padEnd(labelWidth), "dim")], color),
	value,
];

const summaryOf = (
	route: string,
	response: HttpClientResponse.HttpClientResponse | undefined,
	outcome: Outcome,
	durationMs: number,
	bytes: number | undefined,
	slow: boolean,
	method: string,
): Array<Segment> => {
	const parts: Array<Segment> = [];
	const gap = segment("  ");
	if (outcome._tag === "Failure") {
		parts.push(segment("✗ ", "red"));
	} else if (outcome._tag === "Interrupted") {
		parts.push(segment("⊘ ", "dim"));
	} else if (slow) {
		parts.push(segment("⚠ ", "yellow"));
	}
	parts.push(segment(route, "bold"));
	if (response !== undefined) {
		const text = statusTexts[response.status];
		parts.push(
			gap,
			segment(
				text === undefined
					? `${response.status}`
					: `${response.status} ${text}`,
				statusTone(response.status),
			),
		);
	}
	parts.push(gap, segment(formatDuration(durationMs), "dim"));
	if (bytes !== undefined) {
		parts.push(gap, segment(formatBytes(bytes), "dim"));
	}
	if (outcome._tag === "Failure") {
		const description = describeError(outcome.error, method);
		parts.push(
			gap,
			segment(
				outcome.defect ? `→ defect: ${description}` : `→ ${description}`,
				"red",
			),
		);
	} else if (outcome._tag === "Interrupted") {
		parts.push(gap, segment("interrupted", "dim"));
	}
	if (slow) {
		parts.push(gap, segment("(slow)", "yellow"));
	}
	return parts;
};

const logCall = (
	exit: Exit.Exit<unknown, unknown>,
	ctx: PluginExitContext<ConsoleLoggerSettings>,
	config: Config,
): Effect.Effect<void> =>
	Effect.gen(function* () {
		const settings = ctx.options;
		const outcome = outcomeOf(exit);
		if (settings.only === "errors" && outcome._tag !== "Failure") {
			return;
		}
		const { response, route, durationMs } = ctx;
		const request = response?.request ?? ctx.request;
		if (
			config.filter !== undefined &&
			!config.filter({ route, request, response, exit, durationMs })
		) {
			return;
		}
		const redaction: Redaction | undefined =
			config.redact === undefined
				? undefined
				: {
						headers: matcher([
							...(yield* Effect.service(Headers.CurrentRedactedNames)),
							...config.redact.headers,
						]),
						query: config.redact.query,
						body: config.redact.body,
					};
		const bodyRedact = redaction?.body ?? noMatch;
		const headerRedact = redaction?.headers ?? noMatch;
		const body =
			settings.detail === "full" && response !== undefined
				? yield* readResponseBody(
						response,
						exit,
						settings.maxBodyLength,
						bodyRedact,
					)
				: undefined;
		const slow =
			settings.slow !== false &&
			Option.match(Duration.fromInput(settings.slow), {
				// An invalid per-call `slow` flags nothing.
				onNone: () => false,
				onSome: (threshold) => durationMs >= Duration.toMillis(threshold),
			});
		const summary = render(
			summaryOf(
				route,
				response,
				outcome,
				durationMs,
				response === undefined
					? undefined
					: (contentLengthOf(response) ?? body?.bytes),
				slow,
				request.method,
			),
			config.color,
		);
		const lines: Array<Array<unknown>> = [];
		if (settings.detail !== "summary") {
			lines.push(
				render(
					[
						segment(request.method, "bold"),
						segment(" "),
						segment(fullUrl(request, redaction?.query ?? noMatch)),
					],
					config.color,
				),
				detailLine(
					"request headers",
					headersObject(request.headers, headerRedact),
					config.color,
				),
			);
			if (settings.detail === "full") {
				const shown = showRequestBody(
					request.body,
					settings.maxBodyLength,
					bodyRedact,
				);
				if (shown !== undefined) {
					lines.push(detailLine("request body", shown, config.color));
				}
			}
			if (response !== undefined) {
				lines.push(
					detailLine(
						"response headers",
						headersObject(response.headers, headerRedact),
						config.color,
					),
				);
			}
			if (body?.shown !== undefined) {
				lines.push(detailLine("response body", body.shown, config.color));
			}
			if (outcome._tag === "Failure") {
				lines.push(
					outcome.defect
						? detailLine("defect", outcome.error, config.color)
						: detailLine(
								"error",
								showFailure(outcome.error, redaction),
								config.color,
							),
				);
			}
		}
		yield* Console.consoleWith((console) =>
			Effect.sync(() => {
				if (lines.length === 0) {
					console.log(...summary);
					return;
				}
				if (settings.collapsed) {
					console.groupCollapsed(...summary);
				} else {
					console.group(...summary);
				}
				try {
					for (const line of lines) {
						console.log(...line);
					}
				} finally {
					console.groupEnd();
				}
			}),
		);
	});

/**
 * `true` in React Native, which sets `navigator.product` to
 * `"ReactNative"`. Browsers, Node, Bun and Deno don't.
 */
const isReactNative = (): boolean => {
	const navigator: unknown = Reflect.get(globalThis, "navigator");
	return (
		Predicate.hasProperty(navigator, "product") &&
		navigator.product === "ReactNative"
	);
};

const resolveColor = (color: ConsoleLoggerColor): Config["color"] =>
	color === "auto" ? ("document" in globalThis ? "css" : false) : color;

/**
 * Prints each call to the console while you develop: one line per call,
 * opening a group with its URL, headers, bodies and error.
 *
 * ```text
 * ▸ GET /todos/:id  200 OK  35 ms  1.2 kB
 * ▸ ✗ POST /users/:id/roles  400 Bad Request  120 ms  → InvalidRole: No such role
 * ▸ ✗ GET /todos  3.0 s  → NetworkError: Failed to fetch
 * ▸ ⚠ GET /reports/:id  200 OK  2.4 s  (slow)
 *
 * ▾ ✗ POST /users/:id/roles  400 Bad Request  120 ms  → InvalidRole: No such role
 *     POST https://api.example.com/users/7/roles
 *     request headers  { accept: "application/json", authorization: "<redacted>" }
 *     request body     { role: "owner" }
 *     response headers { "content-type": "application/json" }
 *     response body    { code: "INVALID_ROLE", message: "No such role" }
 *     error            InvalidRole { code: "INVALID_ROLE", message: "No such role" }
 * ```
 *
 * It logs each call once it's over, with its final outcome: the error a
 * call fails with after `statusErrors` and decoding, or `interrupted`.
 * Values are logged as objects, for devtools to expand. Everything goes
 * through Effect's `Console` with `console.log` and groups, never
 * `console.error`, which React Native turns into an error screen.
 *
 * What's redacted, shown as `<redacted>` (names match ignoring case, `-`
 * and `_`):
 *
 * - headers: Effect's `Headers.CurrentRedactedNames` (`authorization`,
 *   `cookie`, `set-cookie`, `x-api-key`), `proxy-authorization`,
 *   `x-auth-token`, `x-access-token`, `x-refresh-token`,
 *   `x-session-token`, `x-csrf-token`, `x-xsrf-token`, `x-client-secret`
 *   and `x-amz-security-token`;
 * - JSON and form body keys, at any depth: `token`, `accessToken`,
 *   `refreshToken`, `idToken`, `authToken`, `apiToken`, `sessionToken`,
 *   `csrfToken`, `xsrfToken`, `secret`, `clientSecret`, `apiSecret`,
 *   `apiKey`, `privateKey`, and any name containing `password`;
 * - query parameters: the same names, `key`, `sig`, `signature`, and the
 *   signed-URL ones (`X-Amz-Signature`, `X-Amz-Credential`,
 *   `X-Amz-Security-Token`, `X-Goog-Signature`, `X-Goog-Credential`,
 *   `AWSAccessKeyId`); query values passed as `Redacted`; and credentials
 *   in the URL (`https://user:password@…`).
 *
 * Exact names rather than patterns, so fields such as `total_tokens`
 * stay visible. Add names with `redact`, or turn redaction off with
 * `redact: false`. Plain-text bodies are printed as they are.
 *
 * A call's error is printed as a copy of its fields, redacted like a body,
 * as errors can carry body data. An `HttpError`'s `text` and a
 * `DecodeError`'s `issue` are left out: the response body line shows them.
 * Defects are printed as they are, with their stack.
 *
 * A response body is read only when it's text (JSON, `text/*` other than
 * event streams, XML or a form) of at most 1 MB (or 4 × `maxBodyLength`),
 * and never when the call returns the response itself, which its caller
 * may stream, or was interrupted. Effect caches the body, so reading it
 * doesn't affect decoding.
 *
 * It runs from the `onExit` hook, so it sees the whole call wherever it
 * sits in the plugin list: retries are one entry, and `duration` includes
 * them. When a plugin fails on a response (such as a 401), that response
 * is shown. Without a response, the request shown is the one the call
 * built, before plugins (such as `bearer`) changed it.
 *
 * Throws if `slow` isn't a duration. A call's own `slow` that isn't one
 * flags nothing.
 *
 * @example
 * ```ts
 * import * as Fetch from "@monarcode/effetch";
 * import { consoleLogger } from "@monarcode/effetch/plugins";
 *
 * declare const isDevelopment: boolean;
 *
 * const makeApi = Fetch.make({
 *   baseUrl: "https://api.example.com",
 *   plugins: [
 *     consoleLogger({
 *       enabled: isDevelopment,
 *       slow: "1 second",
 *       redact: { body: ["otp"] },
 *     }),
 *   ],
 * });
 *
 * // Per call:
 * // api.get("/export", { plugins: { consoleLogger: { detail: "summary" } } })
 * // api.get("/health", { plugins: { consoleLogger: false } })
 * ```
 *
 * @since 0.1.0
 */
export const consoleLogger = (
	options: ConsoleLoggerOptions = {},
): ConsoleLoggerPlugin => {
	const defaults: ConsoleLoggerSettings = {
		detail: options.detail ?? "full",
		only: options.only ?? "all",
		// Metro's terminal drops collapsed groups and what's inside them.
		collapsed: options.collapsed ?? !isReactNative(),
		slow: options.slow ?? false,
		maxBodyLength: options.maxBodyLength ?? 10_000,
	};
	if (
		defaults.slow !== false &&
		Option.isNone(Duration.fromInput(defaults.slow))
	) {
		throw new Error(
			`consoleLogger: slow must be a duration or false, got ${String(defaults.slow)}`,
		);
	}
	if (options.enabled === false) {
		return plugin({ name: "consoleLogger", defaults });
	}
	const redact = options.redact;
	const config: Config = {
		color: resolveColor(options.color ?? "auto"),
		redact:
			redact === false
				? undefined
				: {
						headers: [...defaultHeaders, ...(redact?.headers ?? [])],
						query: matcher([...defaultQuery, ...(redact?.query ?? [])]),
						body: matcher([...defaultBody, ...(redact?.body ?? [])]),
					},
		filter: options.filter,
	};
	return plugin({
		name: "consoleLogger",
		defaults,
		onExit: (exit, ctx) => logCall(exit, ctx, config),
	});
};
