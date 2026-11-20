/**
 * Typed, schema-driven HTTP calls on Effect's `HttpClient`. Everything is
 * under `Fetch`: start with `Fetch.Service` (or `Fetch.make`) for a
 * client, and `Fetch.endpoint` for typed calls. Plugins live in
 * `@monarcode/effetch/plugins`, and the test backend, `FetchTest`, in
 * `@monarcode/effetch/test`.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 *
 * class Api extends Fetch.Service<Api>()("Api", {
 *   baseUrl: "https://api.example.com",
 * }) {}
 *
 * export const getTodo = (id: number) =>
 *   Effect.gen(function* () {
 *     const api = yield* Api;
 *     return yield* api.get("/todos/:id", { params: { id }, output: Todo });
 *   });
 * ```
 *
 * @since 0.1.0
 */
export * as Fetch from "./Fetch.js";
