/**
 * A typed fake backend for tests: an `HttpClient` layer that answers
 * requests with handlers made from your endpoints, and records what it
 * received. Start with `FetchTest.layer`, `FetchTest.respond` and
 * `FetchTest.fail`.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Fetch from "@monarcode/effetch";
 * import { FetchTest } from "@monarcode/effetch/test";
 *
 * const getTodo = Fetch.endpoint("GET /todos/:id");
 *
 * export const Backend = FetchTest.layer([
 *   FetchTest.respond(getTodo, ({ params }) => Effect.succeed({ id: params.id })),
 * ]);
 * ```
 *
 * @since 0.1.0
 */
export * as FetchTest from "./FetchTest.js";
