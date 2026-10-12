/**
 * The parameter name in one path segment `S` (`":id"` gives `"id"`), or
 * `never`.
 */
type SegmentParam<S extends string> = S extends `:${infer N}`
	? N extends ""
		? never
		: N
	: never;

/**
 * The names of the path parameters in `P`, as a union of string literals.
 *
 * A parameter is a **whole path segment** that starts with `:`. Segments are
 * split on `/`, so `/files/:name.json` has one parameter called `name.json`,
 * and `https://host:3000/users/:id` has one parameter called `id` (`host:3000`
 * doesn't start with `:`). A lone `:` is not a parameter.
 *
 * Each segment is checked on its own, so template literal paths keep their
 * parameters: in `` `/orgs/${string}/users/:id` `` the parameter is `id`.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * type Names = Fetch.PathParamNames<"/users/:id/posts/:postId">;
 * //   ^? "id" | "postId"
 *
 * type None = Fetch.PathParamNames<"/users">;
 * //   ^? never
 * ```
 *
 * @since 0.1.0
 */
export type PathParamNames<P extends string> =
	P extends `${infer Head}/${infer Tail}`
		? SegmentParam<Head> | PathParamNames<Tail>
		: SegmentParam<P>;

/**
 * A value accepted for a path parameter. It's converted with `String()` and
 * then `encodeURIComponent`.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const id: Fetch.PathParamValue = 42;
 * ```
 *
 * @since 0.1.0
 */
export type PathParamValue = string | number;

/**
 * The `params` object for path `P`: one required key per parameter name.
 *
 * @example
 * ```ts
 * import type * as Fetch from "@monarcode/effetch";
 *
 * const params: Fetch.PathParams<"/users/:id/posts/:postId"> = {
 *   id: 1,
 *   postId: "intro",
 * };
 * ```
 *
 * @since 0.1.0
 */
export type PathParams<P extends string> = {
	readonly [K in PathParamNames<P>]: PathParamValue;
};
