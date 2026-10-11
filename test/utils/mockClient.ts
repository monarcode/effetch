import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";

import { type Reply, respond } from "./reply.js";

/** What the mock client saw for one request. */
export interface RecordedRequest {
	readonly method: string;
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string | undefined;
	readonly signal: AbortSignal;
}

export interface TransportFailure {
	readonly _tag: "TransportFailure";
	readonly cause: unknown;
}

export interface Hang {
	readonly _tag: "Hang";
}

/** What the mock client does with one request. */
export type Step = Reply | TransportFailure | Hang;

/** The request never gets a response, like a network failure. */
export const failure = (
	cause: unknown = new TypeError("fetch failed"),
): TransportFailure => ({ _tag: "TransportFailure", cause });

/** The request never finishes, until it is interrupted. */
export const hang: Hang = { _tag: "Hang" };

/**
 * The steps to take, in order, with the last one repeating, or a function
 * choosing a step per request.
 */
export type Script = ReadonlyArray<Step> | ((request: RecordedRequest) => Step);

export interface MockClient {
	readonly layer: Layer.Layer<HttpClient.HttpClient>;
	readonly requests: ReadonlyArray<RecordedRequest>;
}

const decoder = new TextDecoder();

const bodyText = (request: HttpClientRequest.HttpClientRequest) => {
	const { body } = request;
	switch (body._tag) {
		case "Uint8Array":
			return decoder.decode(body.body);
		case "FormData":
			return "[FormData]";
		case "Raw":
			return String(body.body);
		case "Stream":
			return "[Stream]";
		case "Empty":
			return undefined;
	}
};

/** An `HttpClient` that records its requests and answers from a script. */
export const makeMockClient = (script: Script): MockClient => {
	const requests: Array<RecordedRequest> = [];
	const client = HttpClient.make((request, url, signal) => {
		const recorded: RecordedRequest = {
			method: request.method,
			url: url.href,
			headers: { ...request.headers },
			body: bodyText(request),
			signal,
		};
		const attempt = requests.length;
		requests.push(recorded);
		const step =
			typeof script === "function"
				? script(recorded)
				: script[Math.min(attempt, script.length - 1)];
		if (step === undefined) {
			return Effect.die(new Error("The mock client has an empty script"));
		}
		if ("_tag" in step) {
			return step._tag === "Hang"
				? Effect.never
				: Effect.fail(
						new HttpClientError.HttpClientError({
							reason: new HttpClientError.TransportError({
								request,
								cause: step.cause,
							}),
						}),
					);
		}
		return Effect.succeed(respond(step, request));
	});
	return { layer: Layer.succeed(HttpClient.HttpClient, client), requests };
};
