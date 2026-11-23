<h1>
  <img
    src="https://github.com/monarcode/effetch/raw/main/banner.png"
    alt="Effetch: schema-driven HTTP calls on Effect v4's HttpClient, typed end to end"
    width="100%"
  />
</h1>

[![npm](https://img.shields.io/npm/v/@monarcode/effetch)](https://www.npmjs.com/package/@monarcode/effetch)
[![CI](https://github.com/monarcode/effetch/actions/workflows/ci.yml/badge.svg)](https://github.com/monarcode/effetch/actions/workflows/ci.yml)
[![bundle size, without effect](https://deno.bundlejs.com/badge?q=@monarcode/effetch&treeshake=%5B*%5D&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22effect%22%2C%22effect%2F*%22%5D%7D%7D)](https://bundlejs.com/?q=@monarcode/effetch&treeshake=%5B*%5D&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22effect%22%2C%22effect%2F*%22%5D%7D%7D)
[![types](https://img.shields.io/npm/types/@monarcode/effetch)](https://www.npmjs.com/package/@monarcode/effetch)
[![provenance](https://img.shields.io/badge/provenance-verified-brightgreen?logo=npm)](https://www.npmjs.com/package/@monarcode/effetch#provenance)
[![license](https://img.shields.io/npm/l/@monarcode/effetch)](./LICENSE)

[![Effect](https://img.shields.io/badge/Effect%204-20232a?logo=effect&logoColor=white)](https://effect.website)
[![Browsers](https://img.shields.io/badge/Browsers-20232a?logo=googlechrome&logoColor=white)](https://effetch.pages.dev/docs/platforms#browsers)
[![React Native](https://img.shields.io/badge/React%20Native-20232a?logo=react&logoColor=61dafb)](https://effetch.pages.dev/docs/platforms#react-native)
[![Expo](https://img.shields.io/badge/Expo-20232a?logo=expo&logoColor=white)](https://effetch.pages.dev/docs/platforms#react-native)
[![Node.js](https://img.shields.io/badge/Node.js%2020+-20232a?logo=nodedotjs&logoColor=5fa04e)](https://effetch.pages.dev/docs/platforms)
[![Bun](https://img.shields.io/badge/Bun-20232a?logo=bun&logoColor=fbf0df)](https://effetch.pages.dev/docs/platforms)
[![Deno](https://img.shields.io/badge/Deno-20232a?logo=deno&logoColor=white)](https://effetch.pages.dev/docs/platforms)

**Typed HTTP calls for [Effect](https://effect.website), without the
boilerplate.**

You give Effetch a path and a schema. It fills in the path, builds the
query, sends the request, checks the status and decodes the response. What
you get back is an Effect that's typed end to end, errors included, so
TypeScript tells you what a call returns and every way it can fail.

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
}) {}

export const getTodo = (id: number) =>
  Effect.gen(function* () {
    const api = yield* Api;
    return yield* api.get("/todos/:id", { params: { id }, output: Todo });
  });
// Effect<{ readonly id: number; readonly title: string },
//        NetworkError | DecodeError | HttpError.With<unknown>, Api>
```

> **Release candidate.** Effetch is close to its first stable release
> (`0.1.0-rc.N`). The API is settled: release candidates add small, opt-in
> features and fixes, and the [changelog](./CHANGELOG.md) lists anything
> that needs a change in your code.

## Documentation

The guides are at
**[effetch.pages.dev/docs](https://effetch.pages.dev/docs)**.

## Install

```bash
pnpm add @monarcode/effetch effect
```

With Expo:

```bash
npx expo install effect
pnpm add @monarcode/effetch
```

You'll need:

- `effect` 4.x, which is a peer dependency;
- an ESM project, since the package is ESM only;
- TypeScript 5.4 or newer. With `skipLibCheck: false`, Effect's own
  declarations need TypeScript 5.7 or newer.

## Quick start

This program fetches a todo from
[JSONPlaceholder](https://jsonplaceholder.typicode.com), a free fake API,
and decodes it with a schema:

```ts
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

// 1. What a todo looks like
const Todo = Schema.Struct({
  id: Schema.Finite,
  title: Schema.String,
  completed: Schema.Boolean,
});

// 2. The client, declared once for the whole app
class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://jsonplaceholder.typicode.com",
}) {}

// 3. A call
const program = Effect.gen(function* () {
  const api = yield* Api;
  const todo = yield* api.get("/todos/:id", {
    params: { id: 1 },
    output: Todo,
  });
  console.log(todo.title);
});

// 4. Run it, with the client and the HttpClient that sends the requests
const ApiLive = Api.layer.pipe(Layer.provide(FetchHttpClient.layer));

await Effect.runPromise(program.pipe(Effect.provide(ApiLive)));
```

`Api` is your client, declared once for the whole app. `api.get` fills in
`:id` from `params`, sends the request and decodes the body with `Todo`.
`Api.layer` builds the client, with the `HttpClient` that sends the
requests. [Getting started](https://effetch.pages.dev/docs/getting-started)
walks through each part.

Calling an API from a web page on another origin? Read
[Platform notes](https://effetch.pages.dev/docs/platforms) first.

## Guides

- [Clients](https://effetch.pages.dev/docs/clients): declare a client, configure it and
  provide it.
- [Calls](https://effetch.pages.dev/docs/calls): methods, parameters, bodies, uploads and
  responses.
- [Errors](https://effetch.pages.dev/docs/errors): what a call can fail with, and how to
  catch and type each error.
- [Plugins](https://effetch.pages.dev/docs/plugins): auth, retries, timeouts and logging, and
  writing your own.
- [Endpoints](https://effetch.pages.dev/docs/endpoints): save routes with their schemas and
  share them as a service.
- [Streaming responses](https://effetch.pages.dev/docs/streaming) and
  [Pagination](https://effetch.pages.dev/docs/pagination).
- [Structure an app](https://effetch.pages.dev/docs/structuring-an-app).
- [Testing](https://effetch.pages.dev/docs/testing): test calls against a fake backend made
  from your endpoints.
- [Platform notes](https://effetch.pages.dev/docs/platforms): browsers and React Native.
- [Coming from axios or ky](https://effetch.pages.dev/docs/coming-from-axios-or-ky).
- [Upgrade from 0.1.0-rc.3](https://effetch.pages.dev/docs/upgrading).
- [Reference](https://effetch.pages.dev/docs/reference): the entry points, and
  [Limitations](https://effetch.pages.dev/docs/reference/limitations).

## Examples

[`examples/`](examples) has complete programs, typechecked with the package so
they always match the current API:

- [`basic.ts`](examples/basic.ts): a client in a service, the methods, and
  handling each error.
- [`builtins.ts`](examples/builtins.ts): the built-in plugins, and changing
  them for one call.
- [`plugins.ts`](examples/plugins.ts): writing plugins, from auth with a
  service to a `wrap` with its own error.
- [`endpoints.ts`](examples/endpoints.ts): the same app as `builtins.ts`, with
  endpoints.
- [`backends.ts`](examples/backends.ts): two backends in one file, with shared
  plugins.
- [`status-errors.ts`](examples/status-errors.ts): your own errors by status,
  for every call, per endpoint and for one call.
- [`streams.ts`](examples/streams.ts): Server-Sent Events, newline-delimited
  JSON, and a list paged through by its `Link` header.
- [`testing.ts`](examples/testing.ts): tests for the `app/` todos module,
  against a fake backend made from its endpoints.
- [`app/`](examples/app): a feature-sliced app, with clients as shared
  infrastructure and each module defining its own endpoints.

Its [README](examples/README.md) walks through each one.

## Development

You need Node 24 and pnpm 10.12.1 (`corepack enable` picks the pinned
version).

```bash
pnpm install
pnpm run check
```

| Script                | What it does                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run build`      | Builds `dist/` (ESM and `.d.ts`) with tsdown.                                                                                                          |
| `pnpm test`           | Runs the tests and type tests with Vitest.                                                                                                             |
| `pnpm run typecheck`  | Typechecks `src`, `test` and `examples`.                                                                                                               |
| `pnpm run lint`       | Lints with oxlint (`lint:effect` runs the Effect language service).                                                                                    |
| `pnpm run format`     | Formats with oxfmt (`format:check` only checks).                                                                                                       |
| `pnpm run check:docs` | Checks every public export has a description, `@example` and `@since`, and compiles every example in the JSDoc, this README and the docs site's pages. |
| `pnpm run smoke`      | Packs the package, installs it in a fresh project, typechecks and runs a consumer, and checks go-to-definition, hovers and completions.                |
| `pnpm run check`      | All of the above, plus publint and attw. CI runs it on every push to `main` and every pull request.                                                    |
| `pnpm run build:site` | Prerenders the docs site in `site/` to `site/dist/client`. `check` doesn't build the site; CI does.                                                    |

To work on the docs site, run `pnpm --dir site run dev`.

The pre-commit hook runs `lint` and `format:check`.

## License

[MIT](LICENSE)
