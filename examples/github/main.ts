import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";

import { GitHub, GitHubApi, openIssues } from "./github.ts";

// Shows a repository and its newest open issues:
//
//   pnpm example github                 # Effect-TS/effect
//   pnpm example github facebook/react
//
// Set GITHUB_TOKEN to raise the rate limit from 60 requests an hour.

const [owner = "", repo = ""] = (process.argv[2] ?? "Effect-TS/effect").split(
	"/",
);

const showRepo = Effect.gen(function* () {
	const github = yield* GitHubApi;

	const details = yield* github.repo({ params: { owner, repo } });
	yield* Console.log(`${details.full_name}: ${details.description ?? ""}`);
	yield* Console.log(
		`★ ${details.stargazers_count}, ${details.open_issues_count} open issues and pull requests, last push ${details.pushed_at.toDateString()}\n`,
	);

	// Two pages of ten, so you can see it follow the Link header.
	const issues = yield* openIssues(owner, repo, { perPage: 10, pages: 2 });
	for (const issue of issues) {
		yield* Console.log(
			`#${issue.number} ${issue.title} (${issue.user?.login ?? "ghost"}, ${issue.comments} comments)`,
		);
	}
}).pipe(
	// The errors this program has an answer for. Any other one, such as a
	// NetworkError, ends the run with the error.
	Effect.catchTags({
		RepoNotFound: () =>
			Console.error(
				`No repository ${owner}/${repo}. If it's private, set GITHUB_TOKEN.`,
			),
		RateLimited: (error) =>
			Console.error(
				`${error.message}\nSet GITHUB_TOKEN to make more requests.`,
			),
	}),
);

const GitHubLive = GitHubApi.layer.pipe(
	Layer.provide(GitHub.layer),
	Layer.provide(FetchHttpClient.layer),
);

Effect.runPromise(showRepo.pipe(Effect.provide(GitHubLive)));
