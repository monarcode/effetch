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
	package/README.md \
	package/CHANGELOG.md \
	package/LICENSE \
	package/dist/index.js \
	package/dist/index.d.ts \
	package/dist/Fetch.js \
	package/dist/Fetch.d.ts \
	package/dist/plugins/index.js \
	package/dist/plugins/index.d.ts \
	package/dist/test/index.js \
	package/dist/test/index.d.ts \
	package/dist/test/FetchTest.js \
	package/dist/test/FetchTest.d.ts; do
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
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Fetch } from "@monarcode/effetch";
import {
	bearer,
	type BearerPlugin,
	consoleLogger,
	logger,
	retry,
	TimeoutError,
	timeout,
} from "@monarcode/effetch/plugins";
import { FetchTest } from "@monarcode/effetch/test";

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

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

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
			consoleLogger({ color: false, detail: "summary" }),
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
}).pipe(
	Effect.provideService(HttpClient.HttpClient, mock),
	Effect.provideService(
		Console.Console,
		Object.assign(Object.create(console), {
			log: (...args: ReadonlyArray<unknown>) => printed.push(...args),
		}),
	),
);

const printed: Array<unknown> = [];
const todo = await Effect.runPromise(program);
if (!/^GET \/todos\/:id {2}200 OK {2}\d+ ms$/.test(printed.join())) {
	throw new Error(`Unexpected console output: ${printed.join()}`);
}
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
	// @ts-expect-error the method is misspelled
	api.endpoint("GTE /todos");
	// @ts-expect-error the :id path param is required
	api.endpoint("GET /todos/:id")({});
	// @ts-expect-error GET endpoints take no input
	api.endpoint("GET /todos", { input: Todo });
	// @ts-expect-error the body is required with an input
	api.endpoint("POST /todos", { input: Todo })();
	// @ts-expect-error the method is misspelled
	Fetch.endpoint("GTE /todos");
	// @ts-expect-error plugin overrides are given when binding
	Fetch.endpoint("GET /todos", { plugins: { bearer: false } });
	// @ts-expect-error no plugin is called "requestID"
	api.bind(Fetch.endpoint("GET /todos"), { plugins: { requestID: false } });
	// @ts-expect-error the :id path param is required
	api.bind(Fetch.endpoint("GET /todos/:id"))({});
};
void rejected;

const routes: Array<string | undefined> = [];
const routeSeen = Fetch.plugin({
	name: "routeSeen",
	onRequest: (request, ctx) =>
		Effect.sync(() => {
			routes.push(ctx.route);
			return request;
		}),
});

const endpointProgram = Effect.gen(function* () {
	const api = yield* Fetch.make({
		baseUrl: "https://api.test",
		plugins: [requestId, routeSeen],
	});
	const getTodo = api.endpoint("GET /todos/:id", {
		output: Todo,
		plugins: { requestId: { id: "endpoint" } },
	});
	if (
		getTodo.route !== "GET /todos/:id" ||
		getTodo.method !== "GET" ||
		getTodo.path !== "/todos/:id"
	) {
		throw new Error("Unexpected endpoint route, method or path");
	}
	if (
		getTodo.output !== Todo ||
		getTodo.error !== Schema.Unknown ||
		getTodo.input !== undefined
	) {
		throw new Error("Unexpected endpoint output, error or input");
	}
	return yield* getTodo({ params: { id: 2 } });
}).pipe(Effect.provideService(HttpClient.HttpClient, mock));

const viaEndpoint: { readonly id: number } = await Effect.runPromise(
	endpointProgram,
);
if (
	viaEndpoint.id !== 1 ||
	seen.at(-1) !== "GET https://api.test/todos/2 endpoint undefined" ||
	routes.join() !== "GET /todos/:id"
) {
	throw new Error(`Unexpected endpoint request: ${seen.at(-1)}`);
}

// Defined at module level, without a client, then bound.
const getTodoDefinition = Fetch.endpoint("GET /todos/:id", { output: Todo });
if (
	!Object.isFrozen(getTodoDefinition) ||
	getTodoDefinition.route !== "GET /todos/:id" ||
	getTodoDefinition.method !== "GET" ||
	getTodoDefinition.path !== "/todos/:id" ||
	getTodoDefinition.output !== Todo
) {
	throw new Error("Unexpected definition");
}

const boundProgram = Effect.gen(function* () {
	const api = yield* Fetch.make({
		baseUrl: "https://api.test",
		plugins: [requestId, routeSeen],
	});
	const getTodo = api.bind(getTodoDefinition, {
		plugins: { requestId: { id: "bound" } },
	});
	if (getTodo.route !== "GET /todos/:id" || getTodo.output !== Todo) {
		throw new Error("Unexpected bound endpoint");
	}
	return yield* getTodo({ params: { id: 3 } });
}).pipe(Effect.provideService(HttpClient.HttpClient, mock));

const viaBind: { readonly id: number } = await Effect.runPromise(boundProgram);
if (
	viaBind.id !== 1 ||
	seen.at(-1) !== "GET https://api.test/todos/3 bound undefined" ||
	routes.join() !== "GET /todos/:id,GET /todos/:id"
) {
	throw new Error(`Unexpected bound request: ${seen.at(-1)}`);
}

// An error response turned into the app's own error by statusErrors.
class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
	message: Schema.String,
}) {}

const notFound = HttpClient.make((request) =>
	Effect.succeed(
		HttpClientResponse.fromWeb(
			request,
			new Response(JSON.stringify({ message: "No todo 9" }), {
				status: 404,
				headers: { "content-type": "application/json" },
			}),
		),
	),
);

const getMissing = Fetch.endpoint("GET /todos/:id", {
	output: Todo,
	statusErrors: { 404: TodoNotFound },
});
if (getMissing.statusErrors[404] !== TodoNotFound) {
	throw new Error("Unexpected definition statusErrors");
}

const statusProgram = Effect.gen(function* () {
	const api = yield* Fetch.make({ baseUrl: "https://api.test" });
	const bound = api.bind(getMissing);
	if (bound.statusErrors[404]?.[0] !== TodoNotFound) {
		throw new Error("Unexpected endpoint statusErrors");
	}
	return yield* bound({ params: { id: 9 } }).pipe(
		Effect.catchTag("TodoNotFound", (error) => Effect.succeed(error.message)),
	);
}).pipe(Effect.provideService(HttpClient.HttpClient, notFound));

const missingTodo: string | { readonly id: number } =
	await Effect.runPromise(statusProgram);
if (missingTodo !== "No todo 9") {
	throw new Error(`Unexpected statusErrors result: ${JSON.stringify(missingTodo)}`);
}

// A client as a service class: its config is readable without a layer.
class Api extends Fetch.Service<Api>()("smoke/Api", {
	baseUrl: "https://api.test",
	statusErrors: { 404: TodoNotFound },
}) {}
if (
	!Fetch.isService(Api) ||
	!Object.isFrozen(Api.config) ||
	Api.config.statusErrors?.[404] !== TodoNotFound
) {
	throw new Error("Unexpected Fetch.Service class");
}

const serviceProgram = Effect.gen(function* () {
	const api = yield* Api;
	return yield* api.get("/todos/:id", { params: { id: 9 }, output: Todo });
}).pipe(
	Effect.catchTag("TodoNotFound", (error) => Effect.succeed(error.message)),
	Effect.provide(
		Api.layer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient)(notFound))),
	),
);

const viaService: string | { readonly id: number } =
	await Effect.runPromise(serviceProgram);
if (viaService !== "No todo 9") {
	throw new Error(`Unexpected Fetch.Service result: ${JSON.stringify(viaService)}`);
}

// A module's endpoints as a service class, on top of the client's.
class TodoApi extends Fetch.Endpoints<TodoApi>()("smoke/TodoApi", Api, {
	get: Fetch.endpoint("GET /todos/:id", { output: Todo }),
	missing: [getMissing, { headers: { "x-op": "missing" } }],
}) {}
if (!Object.isFrozen(TodoApi.definitions)) {
	throw new Error("Unexpected Fetch.Endpoints definitions");
}

const endpointsProgram = Effect.gen(function* () {
	const todos = yield* TodoApi;
	return yield* todos.missing({ params: { id: 9 } });
}).pipe(
	Effect.catchTag("TodoNotFound", (error) => Effect.succeed(error.message)),
	Effect.provide(
		TodoApi.layer.pipe(
			Layer.provide(Api.layer),
			Layer.provide(Layer.succeed(HttpClient.HttpClient)(notFound)),
		),
	),
);

const viaEndpoints: string | { readonly id: number } =
	await Effect.runPromise(endpointsProgram);
if (viaEndpoints !== "No todo 9") {
	throw new Error(`Unexpected Fetch.Endpoints result: ${JSON.stringify(viaEndpoints)}`);
}

// A typed fake backend from the endpoints, under the service classes.
const Dated = Schema.Struct({ id: Schema.Finite, due: Schema.Date });
const getDated = Fetch.endpoint("GET /dated/:id", { output: Dated });
const Backend = FetchTest.layer([
	FetchTest.respond(getDated, ({ params }) =>
		Effect.succeed({ id: Number(params.id), due: new Date(0) }),
	),
	FetchTest.fail(TodoApi.definitions.missing[0], 404, new TodoNotFound({ message: "No todo 9" })),
]);
if (Object.keys(FetchTest).sort().join() !== "Recorder,fail,layer,reply,requests,respond") {
	throw new Error(`Unexpected FetchTest exports: ${Object.keys(FetchTest).join()}`);
}

const fakeProgram = Effect.gen(function* () {
	const api = yield* Api;
	const todos = yield* TodoApi;
	const dated = yield* api.bind(getDated)({ params: { id: 4 } });
	const missing = yield* todos.missing({ params: { id: 9 } }).pipe(
		Effect.catchTag("TodoNotFound", (error) => Effect.succeed(error.message)),
	);
	const sent = yield* FetchTest.requests;
	return { dated, missing, urls: sent.map((request) => request.url) };
}).pipe(
	Effect.provide(
		TodoApi.layer.pipe(
			Layer.provideMerge(Api.layer),
			Layer.provideMerge(Backend),
		),
	),
);

const viaFake = await Effect.runPromise(fakeProgram);
const fakeDated: { readonly id: number; readonly due: Date } = viaFake.dated;
if (
	fakeDated.id !== 4 ||
	!(fakeDated.due instanceof Date) ||
	viaFake.missing !== "No todo 9" ||
	viaFake.urls.join() !== "https://api.test/dated/4,https://api.test/todos/9"
) {
	throw new Error(`Unexpected FetchTest result: ${JSON.stringify(viaFake)}`);
}

// Streams and pages, answered by FetchTest.
const Step = Schema.Struct({ percent: Schema.Finite });
const steps = Fetch.endpoint("GET /jobs/:id/events", { output: Step, stream: "sse" });
const rows = Fetch.endpoint("GET /rows", { output: Step, stream: "ndjson" });
const pageOf = Fetch.endpoint("GET /pages", {
	query: Schema.Struct({ page: Schema.Finite }),
	output: Schema.Array(Step),
});
const streamed = await Effect.runPromise(
	Effect.gen(function* () {
		const api = yield* Fetch.make({ baseUrl: "https://api.test" });
		const events = yield* Stream.runCollect(api.bind(steps)({ params: { id: 1 } }));
		const lines = yield* Stream.runCollect(api.ndjson("/rows", { output: Step }));
		const pages = yield* Stream.runCollect(
			Fetch.paginate(api.bind(pageOf), {
				start: 1,
				request: (page) => ({ query: { page } }),
				next: (items, page) => (items.length === 0 ? Option.none() : Option.some(page + 1)),
			}),
		);
		return { events: [...events], lines: [...lines], pages: [...pages] };
	}).pipe(
		Effect.provide(
			FetchTest.layer([
				FetchTest.respond(steps, ({ params }) =>
					Effect.succeed([{ id: params.id, data: { percent: 100 } }]),
				),
				FetchTest.respond(rows, () => Effect.succeed([{ percent: 1 }, { percent: 2 }])),
				FetchTest.respond(pageOf, ({ query }) =>
					Effect.succeed(query.page === 1 ? [{ percent: 1 }] : []),
				),
			]),
		),
	),
);
const firstEvent: Fetch.SseEvent<{ readonly percent: number }> | undefined = streamed.events[0];
if (
	JSON.stringify(streamed) !==
	JSON.stringify({
		events: [{ event: "message", id: "1", data: { percent: 100 } }],
		lines: [{ percent: 1 }, { percent: 2 }],
		pages: [[{ percent: 1 }], []],
	}) ||
	firstEvent?.id !== "1"
) {
	throw new Error(`Unexpected stream result: ${JSON.stringify(streamed)}`);
}

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

echo "› Emitting declarations from a consumer (NodeNext)"
# Types reached through another module, such as a client's errors, must be
# nameable in the consumer's own .d.ts files.
mkdir -p declarations
cat >declarations/api.ts <<'TS'
import * as Effect from "effect/Effect";
import { Fetch } from "@monarcode/effetch";
import { FetchTest } from "@monarcode/effetch/test";

export class Api extends Fetch.Service<Api>()("smoke/Api", {
	baseUrl: "https://api.test",
}) {}
export const client = Fetch.make({ baseUrl: "https://api.test" });
export const Backend = FetchTest.layer([]);
export const ok = Effect.void;
TS
cat >declarations/use.ts <<'TS'
import * as Effect from "effect/Effect";
import { Api, Backend, client } from "./api.js";

export const call = Effect.gen(function* () {
	const api = yield* Api;
	return yield* api.get("/todos");
});
export const sameClient = client;
export const backend = Backend;
TS
cat >declarations/tsconfig.json <<JSON
{
	"compilerOptions": {
		"target": "ES2022",
		"lib": ["ES2022", "DOM"],
		"strict": true,
		"skipLibCheck": false,
		"declaration": true,
		"emitDeclarationOnly": true,
		"outDir": "out",
		"module": "NodeNext",
		"moduleResolution": "NodeNext"
	},
	"files": ["api.ts", "use.ts"]
}
JSON
./node_modules/.bin/tsc -p declarations/tsconfig.json

echo "› Bundling a consumer that only uses Fetch.make"
cat >shake.js <<'JS'
import { Fetch } from "@monarcode/effetch";
console.log(Fetch.make);
JS
cat >shake.config.mjs <<'JS'
export default {
	input: "shake.js",
	external: [/^effect(\/|$)/],
	platform: "neutral",
	output: { file: "shake.out.js", format: "esm" },
};
JS
"$root/node_modules/.bin/rolldown" -c shake.config.mjs >/dev/null
for unused in Paginate Endpoints Service Status Input; do
	if grep -q "dist/$unused.js" shake.out.js; then
		echo "✗ Fetch.make alone bundles dist/$unused.js: the Fetch namespace isn't tree-shaken" >&2
		exit 1
	fi
done

echo "› Running consumer"
node consumer.ts

echo "› Checking the editor experience (definitions, hovers, completions)"
cp "$root/scripts/editor-check.mjs" .
node editor-check.mjs

echo "✓ Smoke test passed"
