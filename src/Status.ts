import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Option from "effect/Option";

import { HttpError } from "./Errors.js";

/**
 * The error {@link catchStatus}'s handler gets: an `HttpError` whose
 * `status` is narrowed to the statuses `S` it was given. Its `body` is
 * `unknown`: to read it typed by the `error` schema, use
 * `Effect.catchTag("HttpError", …)`.
 *
 * @example
 * ```ts
 * import type { Fetch } from "@monarcode/effetch";
 *
 * const describe = (error: Fetch.CaughtStatus<[401, 403]>) =>
 *   error.status === 401 ? "signed out" : "not allowed";
 * ```
 *
 * @since 0.1.0
 */
export type CaughtStatus<S extends number | ReadonlyArray<number>> =
	HttpError & {
		readonly status: S extends ReadonlyArray<infer N> ? N : S;
	};

/**
 * Handles an `HttpError` with one of the given statuses, for one call:
 * `f` gets the error, and the call continues with what `f` returns.
 * Errors with other statuses, and every other error, pass through.
 *
 * - `status` is one status, such as `404`, or a list, such as
 *   `[401, 403]`. The handler's error has its `status` narrowed to them
 *   (see {@link CaughtStatus}).
 * - `HttpError` stays in the error type, since other statuses can still
 *   fail. `f`'s own errors are added.
 * - It works on any Effect whose errors include `HttpError`: calls,
 *   endpoints, and Effects built on them.
 *
 * For a `404` that means "not found", {@link optional} gives an `Option`
 * instead. Use `statusErrors` when a status means the same domain error
 * for every caller. A status that `statusErrors` maps never reaches
 * `catchStatus`: the call fails with the mapped error, not an
 * `HttpError`.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 *
 * const todoOrNull = (api: Fetch.Client, id: number) =>
 *   api
 *     .get("/todos/:id", { params: { id }, output: Todo })
 *     .pipe(Fetch.catchStatus([404, 410], () => Effect.succeed(null)));
 *
 * // Or data-first:
 * const signedIn = (api: Fetch.Client) =>
 *   Fetch.catchStatus(api.get("/me"), 401, (error) =>
 *     Effect.succeed(`Signed out (${error.status})`),
 *   );
 * ```
 *
 * @since 0.1.0
 */
export const catchStatus: {
	<const S extends number | ReadonlyArray<number>, A2, E2, R2>(
		status: S,
		f: (error: CaughtStatus<S>) => Effect.Effect<A2, E2, R2>,
	): <A, E, R>(
		self: Effect.Effect<A, E, R>,
	) => Effect.Effect<A | A2, E | E2, R | R2>;
	<A, E, R, const S extends number | ReadonlyArray<number>, A2, E2, R2>(
		self: Effect.Effect<A, E, R>,
		status: S,
		f: (error: CaughtStatus<S>) => Effect.Effect<A2, E2, R2>,
	): Effect.Effect<A | A2, E | E2, R | R2>;
} = dual(
	3,
	<A, E, R, A2, E2, R2>(
		self: Effect.Effect<A, E, R>,
		status: number | ReadonlyArray<number>,
		f: (error: CaughtStatus<number>) => Effect.Effect<A2, E2, R2>,
	): Effect.Effect<A | A2, E | E2, R | R2> => {
		const statuses: ReadonlyArray<number> =
			typeof status === "number" ? [status] : status;
		return Effect.catchIf(
			self,
			(error) =>
				error instanceof HttpError && statuses.includes(error.status),
			(error) => f(error as CaughtStatus<number>),
		);
	},
);

/**
 * Turns a `404` into `Option.none()`, and a success into `Option.some`, for
 * one call: the call succeeds with an `Option` of its value. Other errors,
 * `HttpError`s with other statuses included, pass through.
 *
 * It's {@link catchStatus}`(404, …)` for the common case of a resource that may not
 * exist. As there, a `404` that `statusErrors` maps fails with the mapped
 * error, and doesn't give `Option.none()`.
 *
 * @example
 * ```ts
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import * as Schema from "effect/Schema";
 * import { Fetch } from "@monarcode/effetch";
 *
 * const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
 *
 * const findTodo = (api: Fetch.Client, id: number) =>
 *   Effect.gen(function* () {
 *     const todo = yield* api
 *       .get("/todos/:id", { params: { id }, output: Todo })
 *       .pipe(Fetch.optional);
 *     //    ^? Option<{ readonly id: number; readonly title: string }>
 *     return Option.getOrElse(
 *       Option.map(todo, (found) => found.title),
 *       () => "No such todo",
 *     );
 *   });
 * ```
 *
 * @since 0.1.0
 */
export const optional = <A, E, R>(
	self: Effect.Effect<A, E, R>,
): Effect.Effect<Option.Option<A>, E, R> =>
	catchStatus(Effect.map(self, Option.some), 404, () => Effect.succeedNone);
