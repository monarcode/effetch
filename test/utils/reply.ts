import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

export interface ReplyOptions {
	readonly status?: number | undefined;
	readonly headers?: Readonly<Record<string, string>> | undefined;
}

/** A canned response body and status, turned into a response by `respond`. */
export interface Reply {
	readonly status: number;
	readonly headers: globalThis.Headers;
	readonly body: string | null;
}

// `Headers.set` is case-insensitive, so `Content-Type` replaces the default.
const make = (
	body: string | null,
	contentType: string | undefined,
	options: ReplyOptions,
): Reply => {
	const headers = new Headers();
	if (contentType !== undefined) {
		headers.set("content-type", contentType);
	}
	for (const [name, value] of Object.entries(options.headers ?? {})) {
		headers.set(name, value);
	}
	return { status: options.status ?? 200, headers, body };
};

export const reply = {
	json: (value: unknown, options: ReplyOptions = {}): Reply =>
		make(JSON.stringify(value), "application/json", options),
	text: (text: string, options: ReplyOptions = {}): Reply =>
		make(text, "text/plain", options),
	empty: (status = 204, options: Omit<ReplyOptions, "status"> = {}): Reply =>
		make(null, undefined, { ...options, status }),
};

/** An `HttpClientResponse` to `request` (a GET to `url` by default). */
export const respond = (
	next: Reply,
	request: HttpClientRequest.HttpClientRequest | string = "https://api.test/",
): HttpClientResponse.HttpClientResponse =>
	HttpClientResponse.fromWeb(
		typeof request === "string" ? HttpClientRequest.get(request) : request,
		new Response(next.body, { status: next.status, headers: next.headers }),
	);
