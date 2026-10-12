#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
smoke="$root/.smoke"
consumer="$smoke/consumer"

cd "$root"
rm -rf "$smoke"
mkdir -p "$smoke"

echo "› Building"
pnpm run build >/dev/null

echo "› Packing"
pnpm --config.ignore-scripts=true pack --pack-destination "$smoke" >/dev/null
tarballs=("$smoke"/monarcode-effetch-*.tgz)
if [ "${#tarballs[@]}" -ne 1 ] || [ ! -f "${tarballs[0]}" ]; then
	echo "✗ Expected exactly one tarball in $smoke" >&2
	exit 1
fi
tarball="${tarballs[0]}"

echo "› Checking tarball contents"
contents="$(tar -tzf "$tarball")"
for required in \
	package/package.json \
	package/dist/index.js \
	package/dist/index.d.ts \
	package/dist/plugins/index.js \
	package/dist/plugins/index.d.ts; do
	if ! grep -qx "$required" <<<"$contents"; then
		echo "✗ Missing from tarball: $required" >&2
		exit 1
	fi
done
forbidden="$(grep -E '^package/src/|\.map$|\.test\.|\.test-d\.' <<<"$contents" || true)"
if [ -n "$forbidden" ]; then
	echo "✗ Unexpected files in tarball:" >&2
	echo "$forbidden" >&2
	exit 1
fi

effect_version="$(node -p 'require("./package.json").devDependencies.effect')"
typescript_version="$(node -p 'require("./package.json").devDependencies.typescript')"

echo "› Installing tarball into consumer (effect@$effect_version, typescript@$typescript_version)"
mkdir -p "$consumer"
cd "$consumer"
cat >package.json <<'JSON'
{ "name": "effetch-smoke-consumer", "private": true, "type": "module" }
JSON
npm install --silent --no-audit --no-fund --no-package-lock \
	"$tarball" "effect@$effect_version" "typescript@$typescript_version"

cat >consumer.ts <<'TS'
import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";
import * as Fetch from "@monarcode/effetch";
import {
	bearer,
	type BearerPlugin,
	logger,
	retry,
	TimeoutError,
	timeout,
} from "@monarcode/effetch/plugins";

const orgId: string = "acme";
type OrgUser = `/orgs/${typeof orgId}/users/:id`;

const params: Fetch.PathParams<OrgUser> = { id: 1 };

const overrides: Fetch.Plugin.Overrides<
	[Fetch.Plugin<"retry", never, never, { times: number }>]
> = { retry: { times: 0 } };

// @ts-expect-error missing the id path param
const missing: Fetch.PathParams<OrgUser> = {};
// @ts-expect-error no plugin called "retyr"
const typo: Fetch.Plugin.Overrides<[Fetch.Plugin<"retry">]> = { retyr: false };
void [missing, typo];

if (params.id !== 1 || overrides.retry === false) {
	throw new Error("Unexpected values");
}

const error = new Fetch.HttpError({
	method: "GET",
	url: "/me",
	status: 401,
	headers: Headers.fromInput({ authorization: "Bearer secret" }),
	text: "",
	body: undefined,
});
if (!Fetch.isFetchError(error) || JSON.stringify(error).includes("secret")) {
	throw new Error("HttpError is not a redacted FetchError");
}
const timedOut = new TimeoutError({ method: "GET", url: "/x", duration: "1s" });
if (timedOut._tag !== "TimeoutError" || Fetch.isFetchError(timedOut)) {
	throw new Error("TimeoutError from @monarcode/effetch/plugins is wrong");
}

const Todo = Schema.Struct({ id: Schema.Number, title: Schema.String });

const requestId = Fetch.plugin({
	name: "requestId",
	defaults: { id: "default" },
	onRequest: (request, ctx) =>
		Effect.succeed(
			HttpClientRequest.setHeader(request, "x-request-id", ctx.options.id),
		),
});

const seen: Array<string> = [];
const mock = HttpClient.make((request, url) => {
	seen.push(
		`${request.method} ${url.href} ${request.headers["x-request-id"]} ${request.headers["authorization"]}`,
	);
	return Effect.succeed(
		HttpClientResponse.fromWeb(
			request,
			new Response(JSON.stringify({ id: 1, title: "Write docs" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		),
	);
});

const program = Effect.gen(function* () {
	const api = yield* Fetch.make({
		baseUrl: "https://api.test",
		plugins: [
			logger(),
			retry(),
			timeout({ duration: "5 seconds" }),
			requestId,
			bearer({ token: () => "smoke-token" }),
		],
	});
	return yield* api.get("/todos/:id", {
		params: { id: 1 },
		query: { expand: "owner" },
		output: Todo,
		plugins: { requestId: { id: "smoke" } },
	});
}).pipe(Effect.provideService(HttpClient.HttpClient, mock));

const todo = await Effect.runPromise(program);
const typed: { readonly id: number; readonly title: string } = todo;
if (typed.id !== 1 || typed.title !== "Write docs") {
	throw new Error(`Unexpected todo: ${JSON.stringify(todo)}`);
}
if (
	seen.join() !==
	"GET https://api.test/todos/1?expand=owner smoke Bearer smoke-token"
) {
	throw new Error(`Unexpected request: ${seen.join()}`);
}

const rejected = (
	api: Fetch.Client<readonly [typeof requestId, BearerPlugin]>,
) => {
	// @ts-expect-error the :id path param is required
	api.get("/todos/:id");
	// @ts-expect-error get takes no body
	api.get("/todos", { body: {} });
	// @ts-expect-error no plugin is called "requestID"
	api.get("/todos", { plugins: { requestID: false } });
	// @ts-expect-error bearer can only be skipped
	api.get("/todos", { plugins: { bearer: { scheme: "Token" } } });
};
void rejected;

console.log("smoke: ok");
TS

common_options='
		"target": "ES2022",
		"lib": ["ES2022", "DOM", "ESNext.Disposable"],
		"strict": true,
		"noEmit": true,
		"skipLibCheck": false,
		"allowImportingTsExtensions": true'

cat >tsconfig.nodenext.json <<JSON
{
	"compilerOptions": {$common_options,
		"module": "NodeNext",
		"moduleResolution": "NodeNext"
	},
	"files": ["consumer.ts"]
}
JSON

cat >tsconfig.bundler.json <<JSON
{
	"compilerOptions": {$common_options,
		"module": "ESNext",
		"moduleResolution": "Bundler"
	},
	"files": ["consumer.ts"]
}
JSON

echo "› Typechecking consumer (NodeNext)"
./node_modules/.bin/tsc -p tsconfig.nodenext.json

echo "› Typechecking consumer (Bundler)"
./node_modules/.bin/tsc -p tsconfig.bundler.json

echo "› Running consumer"
node consumer.ts

echo "› Checking the editor experience (definitions, hovers, completions)"
cp "$root/scripts/editor-check.mjs" .
node editor-check.mjs

echo "✓ Smoke test passed"
