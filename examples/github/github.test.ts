import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { FetchTest } from "@monarcode/effetch/test";

import {
	GitHub,
	GitHubApi,
	getRepo,
	listIssues,
	openIssues,
	RateLimited,
	RepoNotFound,
} from "./github.ts";

// The real GitHub client, with its plugins and errors, against a fake
// backend made from its endpoints. Nothing leaves the machine.

const issue = (number: number, pullRequest = false) => ({
	number,
	title: `Issue ${number}`,
	user: { login: "octocat" },
	comments: 0,
	...(pullRequest ? { pull_request: { url: `https://pr/${number}` } } : {}),
});

const Backend = FetchTest.layer([
	FetchTest.respond(getRepo, ({ params }) =>
		Effect.succeed(
			params.repo === "effect"
				? {
						full_name: `${params.owner}/effect`,
						description: null,
						stargazers_count: 10,
						open_issues_count: 3,
						pushed_at: new Date("2026-11-01T00:00:00Z"),
					}
				: params.repo === "limited"
					? FetchTest.reply(403, { message: "API rate limit exceeded" })
					: params.repo === "blocked"
						? FetchTest.reply(403, {
								message: "Repository access blocked",
							})
						: FetchTest.reply(404, { message: "Not Found" }),
		),
	),
	// Two pages. The first links to the second, as GitHub does.
	FetchTest.respond(listIssues, ({ query }) =>
		Effect.succeed(
			query.page === 1
				? FetchTest.reply(200, [issue(3), issue(2, true)], {
						headers: {
							link: '<https://api.github.com/repositories/1/issues?page=2>; rel="next"',
						},
					})
				: FetchTest.reply(200, [issue(1)]),
		),
	),
]);

/** The client on the fake backend, with `env` as its environment. */
const withEnv = (env: Record<string, string>) =>
	GitHubApi.layer.pipe(
		Layer.provide(GitHub.layer),
		Layer.provideMerge(Backend),
		Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
	);

describe("GitHub", () => {
	it.effect("decodes a repository", () =>
		Effect.gen(function* () {
			const github = yield* GitHubApi;
			const repo = yield* github.repo({
				params: { owner: "Effect-TS", repo: "effect" },
			});
			expect(repo.full_name).toBe("Effect-TS/effect");
			expect(repo.pushed_at).toBeInstanceOf(Date);
		}).pipe(Effect.provide(withEnv({}))),
	);

	it.effect("turns a 404 into RepoNotFound", () =>
		Effect.gen(function* () {
			const github = yield* GitHubApi;
			const error = yield* Effect.flip(
				github.repo({ params: { owner: "Effect-TS", repo: "nope" } }),
			);
			expect(error).toBeInstanceOf(RepoNotFound);
		}).pipe(Effect.provide(withEnv({}))),
	);

	it.effect("tells a rate limit from other 403s", () =>
		Effect.gen(function* () {
			const github = yield* GitHubApi;
			const limited = yield* Effect.flip(
				github.repo({ params: { owner: "o", repo: "limited" } }),
			);
			expect(limited).toBeInstanceOf(RateLimited);
			const blocked = yield* Effect.flip(
				github.repo({ params: { owner: "o", repo: "blocked" } }),
			);
			expect(blocked).toMatchObject({ _tag: "HttpError", status: 403 });
		}).pipe(Effect.provide(withEnv({}))),
	);

	it.effect("follows the Link header, and leaves pull requests out", () =>
		Effect.gen(function* () {
			const issues = yield* openIssues("o", "r", { perPage: 2, pages: 5 });
			expect(issues.map((issue) => issue.number)).toStrictEqual([3, 1]);
			const pages = (yield* FetchTest.requests).map(
				(sent) => sent.query.page,
			);
			expect(pages).toStrictEqual(["1", "2"]);
		}).pipe(Effect.provide(withEnv({}))),
	);

	it.effect("sends GITHUB_TOKEN when it's set, and nothing otherwise", () =>
		Effect.gen(function* () {
			const sendsToken = Effect.gen(function* () {
				const github = yield* GitHubApi;
				yield* github.repo({ params: { owner: "o", repo: "effect" } });
				const [sent] = yield* FetchTest.requests;
				return sent?.headers.authorization;
			});
			expect(
				yield* sendsToken.pipe(
					Effect.provide(withEnv({ GITHUB_TOKEN: "ghp_test" })),
				),
			).toBe("Bearer ghp_test");
			expect(yield* sendsToken.pipe(Effect.provide(withEnv({})))).toBe(
				undefined,
			);
		}),
	);
});
