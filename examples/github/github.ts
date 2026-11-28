import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { Fetch } from "@monarcode/effetch";
import { bearer, retry } from "@monarcode/effetch/plugins";

// A client for GitHub's REST API: what it sends, what its errors mean, and
// two endpoints. `main.ts` uses it, and `github.test.ts` tests it.

// --- What GitHub sends ---

export const Repo = Schema.Struct({
	full_name: Schema.String,
	description: Schema.NullOr(Schema.String),
	stargazers_count: Schema.Finite,
	open_issues_count: Schema.Finite,
	// Sent as an ISO string, decoded into a `Date`.
	pushed_at: Schema.Date,
});

export const Issue = Schema.Struct({
	number: Schema.Finite,
	title: Schema.String,
	user: Schema.NullOr(Schema.Struct({ login: Schema.String })),
	comments: Schema.Finite,
	// GitHub lists pull requests as issues too, with this field set.
	pull_request: Schema.optionalKey(Schema.Struct({ url: Schema.String })),
});

/** The body of GitHub's error responses. */
export const GitHubError = Schema.Struct({
	message: Schema.String,
	documentation_url: Schema.optionalKey(Schema.String),
});

// --- What its errors mean ---

/** A 404: no such repository, or one the token can't see. */
export class RepoNotFound extends Schema.TaggedError<RepoNotFound>()(
	"RepoNotFound",
	{ message: Schema.String },
) {}

/**
 * The rate limit is used up. GitHub answers a 403 or a 429, with a message
 * that says so. Any other 403 stays an `HttpError`.
 */
export class RateLimited extends Schema.TaggedError<RateLimited>()(
	"RateLimited",
	{ message: Schema.String.check(Schema.isIncluding("rate limit")) },
) {}

// --- The client ---

// Optional. Without a token, GitHub allows 60 requests an hour.
const token = Config.option(Config.Redacted("GITHUB_TOKEN")).pipe(
	Effect.map(
		Option.match({ onNone: () => undefined, onSome: Redacted.value }),
	),
	Effect.orElseSucceed(() => undefined),
);

/** Warns when the rate limit is nearly used up. */
const rateLimitWarning = Fetch.plugin({
	name: "rateLimitWarning",
	defaults: { below: 10 },
	onResponse: (response, ctx) => {
		const remaining = Number(response.headers["x-ratelimit-remaining"]);
		return remaining < ctx.options.below
			? Effect.as(
					Effect.logWarning(
						`GitHub: ${remaining} requests left this hour`,
					),
					response,
				)
			: Effect.succeed(response);
	},
});

export class GitHub extends Fetch.Service<GitHub>()("GitHub", {
	baseUrl: "https://api.github.com",
	headers: {
		accept: "application/vnd.github+json",
		"x-github-api-version": "2022-11-28",
	},
	defaultError: GitHubError,
	statusErrors: { 403: RateLimited, 429: RateLimited },
	plugins: [
		// A 429 for a secondary rate limit says how long to wait.
		retry({ retryAfter: { max: "30 seconds" } }),
		rateLimitWarning,
		bearer({ token }),
	],
}) {}

// --- The endpoints ---

export const getRepo = Fetch.endpoint("GET /repos/:owner/:repo", {
	output: Repo,
	statusErrors: { 404: RepoNotFound },
});

export const listIssues = Fetch.endpoint("GET /repos/:owner/:repo/issues", {
	query: Schema.Struct({
		state: Schema.Literals(["open", "closed", "all"]),
		per_page: Schema.optionalKey(Schema.Finite),
		page: Schema.optionalKey(Schema.Finite),
	}),
	output: Schema.Array(Issue),
	statusErrors: { 404: RepoNotFound },
	// The response too, for its `Link` header.
	responseMode: "decoded-and-response",
});

export class GitHubApi extends Fetch.Endpoints<GitHubApi>()(
	"GitHubApi",
	GitHub,
	{ repo: getRepo, issues: listIssues },
) {}

// --- Paging ---

/** The page number in a `Link` header's `rel="next"` URL. */
export const nextPage = (link: string | undefined): Option.Option<number> =>
	Option.fromNullishOr(
		/[?&]page=(\d+)[^>]*>;\s*rel="next"/.exec(link ?? "")?.[1],
	).pipe(Option.map(Number));

/**
 * A repository's open issues, newest first, from its first `pages` pages,
 * following the `Link` header. Pull requests are left out.
 */
export const openIssues = (
	owner: string,
	repo: string,
	{ perPage, pages }: { readonly perPage: number; readonly pages: number },
) =>
	Effect.gen(function* () {
		const github = yield* GitHubApi;
		return yield* Fetch.paginate(github.issues, {
			start: 1,
			request: (page) => ({
				params: { owner, repo },
				query: { state: "open", per_page: perPage, page },
			}),
			next: (_issues, _page, response) => nextPage(response.headers.link),
		}).pipe(
			Stream.take(pages),
			Stream.flattenIterable,
			Stream.filter((issue) => issue.pull_request === undefined),
			Stream.runCollect,
		);
	});
