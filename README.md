<h1>
  <img
    src="https://github.com/monarcode/effetch/raw/main/banner.png"
    alt="effetch: schema-driven HTTP calls on Effect v4's HttpClient, typed end to end"
    width="100%"
  />
</h1>

[![npm](https://img.shields.io/npm/v/@monarcode/effetch)](https://www.npmjs.com/package/@monarcode/effetch)
[![CI](https://github.com/monarcode/effetch/actions/workflows/ci.yml/badge.svg)](https://github.com/monarcode/effetch/actions/workflows/ci.yml)

Typed, schema-driven HTTP calls on [Effect](https://effect.website) v4's
`HttpClient`: path parameters checked against the path, object queries,
decoded responses, typed error bodies and plugins.

```ts
import * as Schema from "effect/Schema";

import type * as Fetch from "@monarcode/effetch";

declare const api: Fetch.Client;

const Todo = Schema.Struct({ id: Schema.Number, title: Schema.String });

const todo = api.get("/todos/:id", { params: { id: 1 }, output: Todo });
// Effect<{ readonly id: number; readonly title: string },
//        NetworkError | HttpError | DecodeError>
```

> **Alpha.** effetch is in early alpha (`0.1.0-alpha.N`). The API may change
> between releases.

## Contents

- [Why](#why)
- [Install](#install)
- [Quick start](#quick-start)
- [Making a client](#making-a-client)
- [Calling](#calling)
- [Errors](#errors)
- [Plugins](#plugins)
- [Testing](#testing)
- [Browsers](#browsers)
- [React Native](#react-native)
- [Limitations](#limitations)
- [API](#api)
- [Development](#development)

## Why

Effect gives you two ways to call HTTP APIs:

- `HttpClient` is low level. You build each request, check the status and
  decode the body yourself.
- `HttpApi` and `HttpApiClient` are contract first. You describe the whole
  API up front and share it with the server, which is ideal when you own
  both sides.

effetch sits in between, for calling backends you don't own, one call at a
time. You get:

- path parameters inferred from the path: `"/users/:id"` requires
  `params: { id }`;
- queries from plain objects, with arrays and `undefined` handled;
- responses decoded with a `Schema`, and error bodies decoded with another;
- three tagged errors to `catchTag` on, plus your plugins' own;
- Effect-native plugins for auth, retries, timeouts and logging, with typed
  per-call overrides.

It has no platform-specific code, and targets browsers, React Native,
Node 20+, Bun and Deno.

## Install

```bash
pnpm add @monarcode/effetch effect
```

With Expo:

```bash
npx expo install effect
pnpm add @monarcode/effetch
```

- `effect` 4.x is a peer dependency.
- The package is ESM only.
- TypeScript 5.4 or newer. With `skipLibCheck: false`, Effect's own
  declarations need TypeScript 5.7 or newer.

## Quick start

```ts
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";

const Todo = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  completed: Schema.Boolean,
});

const program = Effect.gen(function* () {
  const api = yield* Fetch.make({
    baseUrl: "https://jsonplaceholder.typicode.com",
  });
  const todo = yield* api.get("/todos/:id", {
    params: { id: 1 },
    output: Todo,
  });
  console.log(todo.title);
});

await Effect.runPromise(program.pipe(Effect.provide(FetchHttpClient.layer)));
```

`Fetch.make` is an Effect that needs an `HttpClient`. Here
`FetchHttpClient.layer` provides one built on the global `fetch`. Any other
`HttpClient` works too, such as Node's or a mock in tests.

## Making a client

```ts
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { bearer, logger, retry, timeout } from "@monarcode/effetch/plugins";

const ApiError = Schema.Struct({ code: Schema.String, message: Schema.String });

const session: { accessToken?: string } = {};

const make = Fetch.make({
  baseUrl: Config.String("API_URL"),
  headers: { "x-client": "web" },
  error: ApiError,
  plugins: [
    logger(),
    retry(),
    timeout({ duration: "10 seconds" }),
    bearer({ token: () => session.accessToken }),
  ],
});

export class Api extends Context.Service<Api, Effect.Success<typeof make>>()(
  "Api",
) {}

export const ApiLive = Layer.effect(Api)(make).pipe(
  Layer.provide(FetchHttpClient.layer),
);
```

| Option    | Description                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl` | Prepended to every path that isn't an absolute `http(s)://` URL. A string, or an Effect run once when the client is made (a `Config` works). It can't contain a query string or a fragment. |
| `headers` | Sent with every request. A call's header of the same name wins. `content-type` and `content-length` are ignored here: they come from each body.                                             |
| `error`   | The default schema for non-2xx response bodies (see [Errors](#errors)).                                                                                                                     |
| `plugins` | See [Plugins](#plugins). The first one is the outermost.                                                                                                                                    |

The client holds on to the `HttpClient`, the `baseUrl` and the services its
plugins need. Its calls need nothing from the environment, apart from the
services of their own schemas.

## Calling

```ts
import type * as HttpMethod from "effect/http/HttpMethod";
import * as Schema from "effect/Schema";

import type * as Fetch from "@monarcode/effetch";

declare const api: Fetch.Client;

const Todo = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  done: Schema.Boolean,
  due: Schema.Date,
});
const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });

export const list = api.get("/todos", {
  query: { page: 1, tags: ["work", "home"], search: undefined },
  output: Schema.Array(Todo),
});
// GET /todos?page=1&tags=work&tags=home

export const create = api.post("/todos", {
  input: NewTodo,
  body: { title: "Write docs", due: new Date() },
  output: Todo,
});

export const complete = api.patch("/todos/:id", {
  params: { id: 1 },
  body: { done: true },
  output: Todo,
});

export const remove = api.del("/todos/:id", { params: { id: 1 } });
// No output: succeeds with the raw HttpClientResponse.

export const upload = (file: Blob) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/uploads", { body: form });
};

export const send = (method: HttpMethod.HttpMethod, path: string) =>
  api.request(method, path);
```

Methods: `get`, `head` and `options` take no body. `post`, `put`, `patch`,
`del` (because `delete` is a reserved word) and `request(method, path,
options)` do.

| Option    | Description                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `params`  | Values for the path's `:params`. Required, with exactly those names, when the path has any; not allowed otherwise. Values are URI-encoded.                                             |
| `query`   | An object of query parameters. Arrays repeat the key, and `null` and `undefined` are dropped.                                                                                          |
| `headers` | Headers for this call. They win over the client's and over the body's `content-type`.                                                                                                  |
| `body`    | Sent by its type: `HttpBody`, string, `ArrayBuffer` and typed arrays, `Blob`/`File`, `FormData` and `URLSearchParams` as they are, anything else as JSON.                              |
| `input`   | A schema that `body` is encoded with before it's sent as JSON (a `Date` becomes an ISO string). `body` is then typed by the schema.                                                    |
| `output`  | A schema the 2xx JSON body is decoded with. The call then sends `Accept: application/json` (unless you set `accept`). Without it, the call succeeds with the raw `HttpClientResponse`. |
| `error`   | A schema for non-2xx bodies, replacing the client's.                                                                                                                                   |
| `plugins` | Per-call plugin overrides (see [Per-call overrides](#per-call-overrides)).                                                                                                             |

An empty 2xx body (204, `HEAD`) decodes as JSON `null`: use `Schema.Void` for
endpoints that return nothing.

`client.httpClient` is the configured `HttpClient` underneath: base URL,
default headers and plugins, but no status check and no decoding. Use it for
anything the methods don't cover, such as streaming a response.

## Errors

| Error                   | When                                                                               | Fields                                               |
| ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `NetworkError`          | No response: offline, DNS failure, connection refused, CORS rejection.             | `method`, `url`, `cause`                             |
| `HttpError`             | A response outside 200–299 (3xx included).                                         | `method`, `url`, `status`, `headers`, `text`, `body` |
| `DecodeError`           | A 2xx body that isn't JSON or doesn't match `output`. Only on calls with `output`. | `method`, `url`, `status`, `issue`, `message`        |
| `TimeoutError` (plugin) | The `timeout` plugin's limit passed before the response arrived.                   | `method`, `url`, `duration`                          |

- `url` never includes the query string, so tokens in queries stay out of
  logs.
- `HttpError.headers` are Effect `Headers`: `authorization`, `set-cookie` and
  other sensitive headers print as `<redacted>`.
- `HttpError.text` is the raw body. `body` is the body decoded with the
  `error` schema, `undefined` if it didn't match, or the parsed JSON when
  there's no schema. Reading it never fails the call.

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type * as Fetch from "@monarcode/effetch";

declare const api: Fetch.Client;

const Todo = Schema.Struct({ id: Schema.Number, title: Schema.String });
const ApiError = Schema.Struct({ code: Schema.String });

export const todo = (id: number) =>
  api.get("/todos/:id", { params: { id }, output: Todo, error: ApiError }).pipe(
    Effect.catchTag("HttpError", (error) =>
      error.status === 404
        ? Effect.succeed(undefined)
        : Effect.fail(error.body?.code ?? `HTTP ${error.status}`),
    ),
    Effect.catchTag("NetworkError", () => Effect.fail("You're offline")),
    Effect.catchTag("DecodeError", (error) => Effect.fail(error.message)),
  );
```

`Fetch.FetchError` is the union of the three, `Fetch.isFetchError` tells them
apart from other values, and `Fetch.HttpError.With<B>` is an `HttpError`
whose `body` is typed as `B`.

Mistakes in the calling code are defects (the Effect dies) rather than typed
errors: a missing path parameter, a body that can't be encoded, a body on a
`GET` or `HEAD` request, a `baseUrl` with a query string, two plugins with
the same name, and a relative URL without a `baseUrl` outside browsers.

## Plugins

### Built-in plugins

```ts
import * as Effect from "effect/Effect";

import * as Fetch from "@monarcode/effetch";
import { bearer, logger, retry, timeout } from "@monarcode/effetch/plugins";

declare const readToken: () => Promise<string | null>;

export const make = Fetch.make({
  baseUrl: "https://api.example.com",
  plugins: [
    logger({ level: "Info" }),
    retry({ times: 2 }),
    timeout({ duration: "10 seconds" }),
    bearer({ token: () => readToken() }),
  ],
});

export const withEffectToken = bearer({ token: Effect.succeed("token") });
```

| Plugin                                              | What it does                                                                                                                                                                                                                                                                                        | Per call                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `bearer({ token, scheme? })`                        | Sends `Authorization: Bearer <token>`. The token is a string, a function of the request (sync or async), or an Effect, read for every request. `null`, `undefined` and `""` send no header, and an existing `Authorization` header is kept.                                                         | `false`                 |
| `logger({ level? })`                                | Logs one entry per call at Debug (or Info): `GET <url> 200 (35ms)`, or `failed` with the cause. Never logs headers or query strings.                                                                                                                                                                | `false`                 |
| `retry({ times?, schedule?, methods?, statuses? })` | Retries network errors and 408, 429, 500, 502, 503 and 504, 2 times by default, with jittered exponential backoff from 200ms. Only idempotent methods (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`) by default, so a `POST` is never sent twice. When retries run out, the last response is returned. | `false`, `{ times }`    |
| `timeout({ duration })`                             | Fails with `TimeoutError` and aborts the request when the response headers don't arrive in time. Downloading the body isn't covered.                                                                                                                                                                | `false`, `{ duration }` |

- **Order.** The first plugin is the outermost. The order above is the one
  to use: `logger` sees the whole call, and each retry gets its own timeout
  and asks for the token again. A timed-out attempt isn't retried.
- **Token errors.** A token function that throws, or whose promise rejects,
  makes the call die. Pass an Effect to fail with a typed error instead: its
  error and services become the client's, and `make` asks for the services.

### Per-call overrides

Any plugin can be skipped for one call with `false`, and plugins with options
take a partial of them. Names and option types are checked:

```ts
import * as Effect from "effect/Effect";

import * as Fetch from "@monarcode/effetch";
import { bearer, retry, timeout } from "@monarcode/effetch/plugins";

export const program = Effect.gen(function* () {
  const api = yield* Fetch.make({
    baseUrl: "https://api.example.com",
    plugins: [
      retry(),
      timeout({ duration: "10 seconds" }),
      bearer({ token: "token" }),
    ],
  });

  yield* api.post("/auth/login", {
    body: { user: "ada" },
    plugins: { bearer: false },
  });

  yield* api.get("/reports/export", {
    plugins: { timeout: { duration: "2 minutes" }, retry: { times: 0 } },
  });
});
```

### Writing a plugin

`Fetch.plugin` defines a plugin and infers its name, errors, services and
options from the hooks:

| Hook                        | Runs                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `onRequest(request, ctx)`   | Before the request is sent, in array order. Returns the request to send, or fails. It sees the full URL and the client's headers.            |
| `onResponse(response, ctx)` | On every response, non-2xx included, in reverse order. Returns the response, or fails. The status check and decoding come after all plugins. |
| `onError(error, ctx)`       | After a call fails or dies, in array order. It can't change the outcome.                                                                     |
| `wrap(client, options)`     | Wraps the plugins after it and the network, for retries, timeouts and the like. It can add errors but can't remove them.                     |

`ctx.options` is the plugin's `defaults` merged with the call's override, so
a plugin needs `defaults` to have options. `ctx.request` is the request: in
`onResponse`, the one this plugin passed on; in `onError`, the one the call
built.

The classic example turns a `401` into a typed `SessionExpired`, after
signing out:

```ts
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import * as Fetch from "@monarcode/effetch";

export class SessionExpired extends Data.TaggedError("SessionExpired")<{}> {}

export class Session extends Context.Service<
  Session,
  {
    readonly accessToken: Effect.Effect<string | undefined>;
    readonly signOut: Effect.Effect<void>;
  }
>()("Session") {}

export const auth = Fetch.plugin({
  name: "auth",
  onRequest: (request) =>
    Effect.gen(function* () {
      const session = yield* Session;
      const token = yield* session.accessToken;
      return token === undefined
        ? request
        : HttpClientRequest.bearerToken(request, token);
    }),
  onResponse: (response) =>
    Effect.gen(function* () {
      if (response.status !== 401) {
        return response;
      }
      const session = yield* Session;
      yield* session.signOut;
      return yield* new SessionExpired();
    }),
});

// make now needs Session; calls fail with SessionExpired too.
export const make = Fetch.make({
  baseUrl: "https://api.example.com",
  plugins: [auth],
});
```

A `wrap` that adds its own error, with an option calls can override:

```ts
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";

import * as Fetch from "@monarcode/effetch";

export class TooSlow extends Data.TaggedError("TooSlow")<{
  readonly url: string;
}> {}

export const deadline = Fetch.plugin({
  name: "deadline",
  defaults: { millis: 5000 },
  wrap: (client, options) =>
    HttpClient.transform(client, (response, request) =>
      Effect.gen(function* () {
        const { millis } = yield* options;
        return yield* Effect.timeoutOrElse(response, {
          duration: millis,
          orElse: () => Effect.fail(new TooSlow({ url: request.url })),
        });
      }),
    ),
});
```

- Services a plugin needs are required by `make`, once. Calls don't need
  them. Services provided around a call win over those `make` saw.
- Plugin names must be unique.
- Write `wrap` bodies with `Effect.gen`. A ternary that returns two different
  Effects can't be typed.
- Pass plugin lists inline or let TypeScript infer them. Annotating a list as
  `Fetch.Plugin.Any[]` erases the plugins' types.

[`examples/`](examples) has complete programs with built-in and custom
plugins.

## Testing

`make` needs an `HttpClient`, so tests give it a fake one:

```ts
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";

const Todo = Schema.Struct({ id: Schema.Number, title: Schema.String });

const sent: Array<string> = [];

const TestHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request, url) => {
    sent.push(`${request.method} ${url.href}`);
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        Response.json({ id: 1, title: "Write docs" }),
      ),
    );
  }),
);

const program = Effect.gen(function* () {
  const api = yield* Fetch.make({ baseUrl: "https://api.test" });
  return yield* api.get("/todos/:id", { params: { id: 1 }, output: Todo });
});

const todo = await Effect.runPromise(
  program.pipe(Effect.provide(TestHttpClient)),
);
// todo: { id: 1, title: "Write docs" }; sent: ["GET https://api.test/todos/1"]
```

## Browsers

Effect's `HttpClient` adds `traceparent` and `b3` tracing headers to every
request. Cross-origin calls to APIs that don't allow those headers then fail
the CORS preflight. Turn propagation off where the client is made, and it
applies to all its calls:

```ts
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";

import * as Fetch from "@monarcode/effetch";

const make = Fetch.make({ baseUrl: "https://api.example.com" });

export class Api extends Context.Service<Api, Effect.Success<typeof make>>()(
  "Api",
) {}

export const ApiLive = Layer.effect(Api)(
  make.pipe(Effect.provideService(HttpClient.TracerPropagationEnabled, false)),
).pipe(Layer.provide(FetchHttpClient.layer));
```

In a browser, a relative path without a `baseUrl` is resolved against the
page's URL.

## React Native

- effetch doesn't use `URL` itself. Effect's `HttpClient` does, including
  `searchParams`. Expo provides a standard `URL`. In a React Native app
  without Expo, install a polyfill such as `react-native-url-polyfill`.
- effetch and Effect use package `exports` (`effect/http/HttpClient`,
  `@monarcode/effetch/plugins`). Metro resolves them by default from React
  Native 0.79 (Expo SDK 53). On older versions, set
  `resolver.unstable_enablePackageExports = true` in `metro.config.js`.
- `FetchHttpClient.layer` uses the global `fetch`.

## Limitations

- A path parameter is a whole segment: `/files/:name.json` has one parameter
  called `name.json`.
- No query schemas or optional path parameters yet, and no endpoint
  definitions: each call passes its own schemas.
- Paths shouldn't contain `?` or `#`. Pass query parameters with `query`.
- `timeout` and the logged duration cover the time until the response
  headers arrive, not downloading the body.
- Two plugins with the same name are only caught when the client is made.

## API

`@monarcode/effetch`:

- `make`, `ClientConfig`, `Client`: making a client and its methods.
- `NetworkError`, `HttpError` (and `HttpError.With`), `DecodeError`,
  `FetchError`, `isFetchError`: [errors](#errors).
- `plugin`, `Plugin` (and the `Plugin.*` helper types), `PluginContext`:
  [writing plugins](#writing-a-plugin).
- Option and result types, for wrapping the client in your own functions:
  `RequestOptions`, `NoBodyRequestOptions`, `BaseOptions`, `BodyOptions`,
  `ParamsOption`, `QueryInput`, `QueryValue`, `AnySchema`, `Args`,
  `Success`, `CallError`, `CallServices`, `CallEffect`, `NoBodyMethod`,
  `BodyMethod`, `RequestMethod`, `PathParamNames`, `PathParams`,
  `PathParamValue`.

`@monarcode/effetch/plugins`:

- `bearer`, `BearerOptions`, `BearerPlugin`, `TokenSource`, `TokenValue`.
- `logger`, `LoggerOptions`, `LoggerPlugin`.
- `retry`, `RetryOptions`, `RetryPlugin`.
- `timeout`, `TimeoutOptions`, `TimeoutPlugin`, `TimeoutError`.

Every export is documented, with an example, in the type declarations your
editor shows.

## Development

You need Node 24 and pnpm 10.12.1 (`corepack enable` picks the pinned
version).

```bash
pnpm install
pnpm run check
```

| Script                | What it does                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run build`      | Builds `dist/` (ESM and `.d.ts`) with tsdown.                                                                                           |
| `pnpm test`           | Runs the tests and type tests with Vitest.                                                                                              |
| `pnpm run typecheck`  | Typechecks `src`, `test` and `examples`.                                                                                                |
| `pnpm run lint`       | Lints with oxlint (`lint:effect` runs the Effect language service).                                                                     |
| `pnpm run format`     | Formats with oxfmt (`format:check` only checks).                                                                                        |
| `pnpm run check:docs` | Checks every public export has a description, `@example` and `@since`, and compiles every example in the JSDoc and this README.         |
| `pnpm run smoke`      | Packs the package, installs it in a fresh project, typechecks and runs a consumer, and checks go-to-definition, hovers and completions. |
| `pnpm run check`      | All of the above, plus publint and attw. CI runs it on every push to `main` and every pull request.                                     |

The pre-commit hook runs `lint` and `format:check`. Releases are described in
[RELEASING.md](RELEASING.md).

## License

[MIT](LICENSE)
