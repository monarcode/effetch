import * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";

import * as Fetch from "../../src/index.js";
import {
	type MockClient,
	makeMockClient,
	type RecordedRequest,
	type Script,
} from "./mockClient.js";

export const base = "https://api.test";

/** A client on a mock `HttpClient`, with `base` as its default `baseUrl`. */
export const setup = <
	const Ps extends ReadonlyArray<Fetch.Plugin.Any> = [],
	EB extends Fetch.AnySchema = Schema.Unknown,
	E = never,
	R = never,
>(
	script: Script,
	config: Fetch.ClientConfig<Ps, EB, E, R> = {},
) =>
	Effect.gen(function* () {
		const mock = makeMockClient(script);
		const api = yield* Fetch.make({ baseUrl: base, ...config }).pipe(
			Effect.provide(mock.layer),
		);
		return { mock, api };
	});

/** The request the mock client recorded at `index`. */
export const wire = (mock: MockClient, index = 0): RecordedRequest => {
	const recorded = mock.requests[index];
	if (recorded === undefined) {
		throw new Error(`No request recorded at ${index}`);
	}
	return recorded;
};
