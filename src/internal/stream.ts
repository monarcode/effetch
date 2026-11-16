import * as Effect from "effect/Effect";
import * as Sse from "effect/encoding/Sse";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { DecodeError } from "../Errors.js";
import type { AnySchema } from "../Options.js";
import type { SseEvent, StreamFormat } from "../Streams.js";
import { decodeJson } from "./json.js";
import { messageOf } from "./message.js";
import { bodyFormat } from "./output.js";
import type { RuntimeOptions } from "./request.js";
import { type BodyFailures, bodyFailures, decodeText } from "./response.js";

/** The `Accept` header a stream sends, unless one is set. */
export const streamAccept = (format: StreamFormat): string =>
	format === "sse" ? "text/event-stream" : "application/x-ndjson";

/** `true` for the stream formats. */
export const isStreamFormat = (u: unknown): u is StreamFormat =>
	u === "sse" || u === "ndjson";

/**
 * Checks what can't be streamed, and throws: a `responseMode`, or a
 * `Fetch.bytes()` output. `where` names the call or the definition.
 */
export const checkStreamOptions = (
	where: string,
	options: {
		readonly output?: AnySchema | undefined;
		readonly responseMode?: unknown;
	},
): void => {
	if (options.responseMode !== undefined) {
		throw new Error(
			`${where}: responseMode can't be used with a stream, which gives the body's values`,
		);
	}
	if (options.output !== undefined && bodyFormat(options.output) === "bytes") {
		throw new Error(
			`${where}: Fetch.bytes() can't decode a stream's values: use Fetch.text(), or a schema for JSON`,
		);
	}
};

/** The `failure` maker of one response (see `bodyFailures`). */
type Failure = BodyFailures["failure"];

/**
 * Decodes one value's text with `output`, as a body of the same format is
 * decoded (see `decodeOutput`): as JSON, or as text with `Fetch.text()`.
 * Without `output`, `raw` gives the value. `what` names the value in the
 * error message, such as `"Line 3"`.
 */
const decodeValue = (
	text: string,
	output: AnySchema | undefined,
	raw: (text: string) => Effect.Effect<unknown, DecodeError>,
	failure: Failure,
	what: string,
): Effect.Effect<unknown, DecodeError, unknown> => {
	if (output === undefined) {
		return raw(text);
	}
	const mismatch = (error: Schema.SchemaError) =>
		failure(
			error.issue,
			`${what} doesn't match the output schema: ${error.message}`,
		);
	return bodyFormat(output) === "json"
		? Effect.flatMap(parseJson(text, failure, what), (json) =>
				Effect.mapError(decodeJson(output)(json), mismatch),
			)
		: decodeText(output, text, failure, what, mismatch);
};

/** `text` parsed as JSON, or a `DecodeError` naming `what`. */
const parseJson = (
	text: string,
	failure: Failure,
	what: string,
): Effect.Effect<unknown, DecodeError> =>
	Effect.try({
		try: () => JSON.parse(text) as unknown,
		catch: (cause) =>
			failure(cause, `${what} isn't valid JSON: ${messageOf(cause)}`),
	});

/**
 * The response body as text, read as it arrives. A response that HTTP
 * gives no body (`204 No Content`, `205 Reset Content`) gives no text.
 * Fails with a `DecodeError` when the runtime has no `TextDecoder`, or the
 * body can't be read to the end.
 */
const textOf = (
	response: HttpClientResponse.HttpClientResponse,
	{ failure, unreadable }: BodyFailures,
): Stream.Stream<string, DecodeError> => {
	if (noBody(response)) {
		return Stream.empty;
	}
	if (typeof TextDecoder === "undefined") {
		return Stream.fail(
			failure(
				new Error("TextDecoder is not defined"),
				"Failed to read the response body: reading a stream needs TextDecoder, which this runtime doesn't have",
			),
		);
	}
	return response.stream.pipe(
		Stream.mapError(unreadable),
		Stream.decodeText(),
	);
};

/** `true` for the statuses whose responses have no body: 204 and 205. */
const noBody = (response: HttpClientResponse.HttpClientResponse): boolean =>
	response.status === 204 || response.status === 205;

/** The media type of the response's `Content-Type`, or `undefined`. */
const mediaType = (
	response: HttpClientResponse.HttpClientResponse,
): string | undefined => {
	const type = response.headers["content-type"]?.split(";")[0]?.trim();
	return type === undefined || type === "" ? undefined : type.toLowerCase();
};

/**
 * The events of a Server-Sent Events body, with their `data` decoded with
 * `output`, one at a time: the events before one that doesn't decode are
 * given first.
 *
 * Parsed with Effect's `Sse.makeParser`, which follows the WHATWG rules:
 * CRLF, CR or LF line ends, comment lines ignored, multi-line `data`
 * joined with `\n`, an `id` that carries over to the events after it, and
 * an event without `data` dropped. A last event without the blank line
 * that ends it is dropped too. `retry:` lines are ignored: the stream
 * doesn't reconnect.
 *
 * Fails with a `DecodeError` on an event over 10 MiB, and on a response
 * whose `Content-Type` is set to another type than `text/event-stream`,
 * such as a login page.
 */
const sseEvents = (
	response: HttpClientResponse.HttpClientResponse,
	output: AnySchema | undefined,
): Stream.Stream<SseEvent<unknown>, DecodeError, unknown> =>
	Stream.suspend(() => {
		const failures = bodyFailures(response);
		const { failure } = failures;
		const type = mediaType(response);
		if (
			type !== undefined &&
			type !== "text/event-stream" &&
			!noBody(response)
		) {
			return Stream.fail(
				failure(
					new Error(`Unexpected content type: ${type}`),
					`The response isn't an event stream: its content type is ${type}, not text/event-stream`,
				),
			);
		}
		let parsed: Array<Sse.Event> = [];
		const parser = Sse.makeParser((event) => {
			if (event._tag === "Event") {
				parsed.push(event);
			}
		});
		let count = 0;
		return textOf(response, failures).pipe(
			// The chunk's events, then its parse error.
			Stream.flatMap((chunk) => {
				const error = parser.feed(chunk);
				const events = Stream.fromIterable(parsed);
				parsed = [];
				return error === undefined
					? events
					: Stream.concat(
							events,
							Stream.fail(failure(error, error.message)),
						);
			}),
			Stream.mapEffect((event) => {
				count += 1;
				return Effect.map(
					decodeValue(
						event.data,
						output,
						Effect.succeed,
						failure,
						`The data of event ${count}`,
					),
					(data): SseEvent<unknown> => ({
						event: event.event,
						id: event.id,
						data,
					}),
				);
			}),
		);
	});

/**
 * The values of a newline-delimited JSON body, one per line, decoded with
 * `output`. Blank lines are skipped; the last line needs no line end.
 */
const ndjsonValues = (
	response: HttpClientResponse.HttpClientResponse,
	output: AnySchema | undefined,
): Stream.Stream<unknown, DecodeError, unknown> =>
	Stream.suspend(() => {
		const failures = bodyFailures(response);
		const { failure } = failures;
		let line = 0;
		return textOf(response, failures).pipe(
			Stream.splitLines,
			Stream.map((text) => {
				line += 1;
				return { text, line };
			}),
			Stream.filter(({ text }) => text.trim() !== ""),
			Stream.mapEffect(({ text, line }) =>
				decodeValue(
					text,
					output,
					(value) => parseJson(value, failure, `Line ${line}`),
					failure,
					`Line ${line}`,
				),
			),
		);
	});

/**
 * Sends a call with `send`, then gives its body as a stream in `format`.
 * The call runs as any other (plugins, retries and timeouts, errors by
 * status) up to the response's headers, and its body isn't read: the
 * stream reads it, as it arrives. Interrupting the stream, or its end,
 * aborts the request.
 *
 * Dies when the options can't be streamed (see `checkStreamOptions`).
 */
export const openStream = (
	format: StreamFormat,
	where: string,
	send: (options: RuntimeOptions) => Effect.Effect<unknown, unknown, unknown>,
	options: RuntimeOptions,
): Stream.Stream<unknown, unknown, unknown> =>
	Stream.unwrap(
		Effect.suspend(() => {
			try {
				checkStreamOptions(where, options);
			} catch (error) {
				return Effect.die(error);
			}
			const { output } = options;
			return Effect.map(
				send({
					...options,
					output: undefined,
					responseMode: undefined,
					accept: streamAccept(format),
				}),
				(response) => {
					const checked =
						response as HttpClientResponse.HttpClientResponse;
					return format === "sse"
						? sseEvents(checked, output)
						: ndjsonValues(checked, output);
				},
			);
		}),
	);
