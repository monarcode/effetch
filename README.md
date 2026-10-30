<h1>
  <img
    src="https://github.com/monarcode/effetch/raw/main/banner.png"
    alt="effetch: schema-driven HTTP calls on Effect v4's HttpClient, typed end to end"
    width="100%"
  />
</h1>

[![npm](https://img.shields.io/npm/v/@monarcode/effetch)](https://www.npmjs.com/package/@monarcode/effetch)
[![CI](https://github.com/monarcode/effetch/actions/workflows/ci.yml/badge.svg)](https://github.com/monarcode/effetch/actions/workflows/ci.yml)

**Typed HTTP calls for [Effect](https://effect.website), without the
boilerplate.** Give effetch a path and a schema. It fills in the path, builds
the query, checks the status and decodes the response, and hands you back an
Effect that's typed end to end, errors included.

```ts
import * as Schema from "effect/Schema";

import type * as Fetch from "@monarcode/effetch";

declare const api: Fetch.Client;

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

const todo = api.get("/todos/:id", { params: { id: 1 }, output: Todo });
// Effect<{ readonly id: number; readonly title: string },
//        NetworkError | DecodeError | HttpError.With<unknown>, never>
```

> **Release candidate.** effetch is close to its first stable release
> (`0.1.0-rc.N`). The API is frozen; only fixes and documentation changes
> until 0.1.0.

## Contents

- [Why effetch](#why-effetch)
  - [At a glance](#at-a-glance)
  - [What you get](#what-you-get)
  - [Where it fits](#where-it-fits)
- [Getting started](#getting-started)
  - [Install](#install)
  - [Your first call](#your-first-call)
- [Creating a client](#creating-a-client)
  - [Configuring a client](#configuring-a-client)
  - [Sharing it across your app](#sharing-it-across-your-app)
- [Making calls](#making-calls)
  - [Methods](#methods)
  - [Path and query parameters](#path-and-query-parameters)
  - [Sending a body](#sending-a-body)
  - [Reading the response](#reading-the-response)
  - [All call options](#all-call-options)
  - [When the methods aren't enough](#when-the-methods-arent-enough)
- [Handling errors](#handling-errors)
  - [What can go wrong](#what-can-go-wrong)
  - [Catching errors](#catching-errors)
  - [Typed error bodies](#typed-error-bodies)
  - [Safe to log](#safe-to-log)
  - [Bugs are defects](#bugs-are-defects)
- [Plugins](#plugins)
  - [Built-in plugins](#built-in-plugins)
  - [Plugin order](#plugin-order)
  - [Changing plugins for one call](#changing-plugins-for-one-call)
- [Writing plugins](#writing-plugins)
  - [Your first plugin](#your-first-plugin)
  - [Hooks](#hooks)
  - [Knowing the route](#knowing-the-route)
  - [Example: signing out on a 401](#example-signing-out-on-a-401)
  - [Example: a deadline with its own error](#example-a-deadline-with-its-own-error)
  - [Tips](#tips)
- [Endpoints](#endpoints)
  - [Defining endpoints](#defining-endpoints)
  - [Calling an endpoint](#calling-an-endpoint)
  - [Defaults and overrides](#defaults-and-overrides)
  - [Why use endpoints](#why-use-endpoints)
  - [Endpoints or methods?](#endpoints-or-methods)
- [Structuring an app](#structuring-an-app)
  - [A small app](#a-small-app)
  - [A feature-sliced app](#a-feature-sliced-app)
  - [Several backends](#several-backends)
- [Testing](#testing)
- [Platform notes](#platform-notes)
  - [Browsers](#browsers)
  - [React Native](#react-native)
- [Reference](#reference)
  - [Limitations](#limitations)
  - [API](#api)
- [Examples](#examples)
- [Development](#development)
- [License](#license)

## Why effetch

Effect gives you two ways to call an HTTP API. `HttpClient` is low level: for
every request, you build the URL, check the status and decode the body
yourself. `HttpApi` is contract first: you describe the whole API up front and
share it with the server, which is ideal when you own both sides.

Most apps sit somewhere in between. They call a backend they don't control,
such as their company's REST API or a third-party service, one call at a time.
effetch is made for that. It's a thin layer over `HttpClient` that gives each
call the types and error handling of a contract, without you having to write
one.

### At a glance

Here's the same call written with `HttpClient` alone, and with effetch:

```ts
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as HttpIncomingMessage from "effect/http/HttpIncomingMessage";
import * as Schema from "effect/Schema";

import type * as Fetch from "@monarcode/effetch";

declare const api: Fetch.Client;

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

// With HttpClient alone
export const getTodoByHand = (id: number) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(
      `https://api.example.com/todos/${encodeURIComponent(id)}`,
    );
    const ok = yield* HttpClientResponse.filterStatusOk(response);
    return yield* HttpIncomingMessage.schemaBodyJson(Todo)(ok);
  });

// With effetch
export const getTodo = (id: number) =>
  api.get("/todos/:id", { params: { id }, output: Todo });
```

Both send the same request and decode the same response. The effetch version
also:

- checks at compile time that every call passes an `id`;
- fails with `NetworkError`, `HttpError` or `DecodeError` rather than
  `HttpClientError | SchemaError`, so you can handle each case on its own;
- decodes the API's error body onto `HttpError`, with a schema you give it;
- runs the client's plugins, such as auth, retries, timeouts and logging, on
  every call.

### What you get

- **Paths that check themselves.** Write `"/users/:id"` and TypeScript asks
  for `params: { id }`. No more, no less.
- **Queries from plain objects.** `{ page: 2, tags: ["a", "b"] }` becomes
  `?page=2&tags=a&tags=b`, and `undefined` values are left out.
- **Responses you can trust.** Decode the response with a `Schema`, and the
  API's error body with another. The schemas' types become the call's types.
- **Errors you can catch by name.** Three tagged errors, `NetworkError`,
  `HttpError` and `DecodeError`, plus any your plugins add, all in the type.
- **Plugins for the repetitive parts.** Auth, retries, timeouts and logging
  are built in, and your own take a few lines. Any call can turn a plugin off
  or adjust it, and TypeScript checks the names and options.
- **Endpoints.** Save a route like `"GET /users/:id"` with its schemas once,
  then call it like a function wherever you need it.
- **Runs anywhere.** There's no platform-specific code: it targets browsers,
  React Native, Node 20+, Bun and Deno.

### Where it fits

- Use **effetch** to call REST and JSON APIs that you don't own, or don't share
  code with.
- Use Effect's **`HttpApi`** when you own both the server and the client, and
  want them to share one contract.
- Use **`HttpClient`** directly for what effetch doesn't cover, such as
  streaming. Every effetch client gives you its own when you need it.

## Getting started

### Install

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

### Your first call

Let's fetch a todo from [JSONPlaceholder](https://jsonplaceholder.typicode.com),
a free fake API:

```ts
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";

const Todo = Schema.Struct({
  id: Schema.Finite,
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

Step by step:

1. **`Todo` describes the response.** effetch decodes the body with it, so
   `todo` is typed, and checked when it arrives.
2. **`Fetch.make` creates a client** for one API. Everything its calls have in
   common, such as the base URL, lives here.
3. **`api.get` makes the call.** The `:id` in the path is filled in from
   `params`.
4. **`FetchHttpClient.layer` sends the requests.** effetch is built on
   Effect's `HttpClient`, so you choose which one to use when you run your
   program. This one uses the global `fetch`. Node's works too, and in tests
   you'd use a fake one (see [Testing](#testing)).

Calling an API from a web page on another origin? Read
[Browsers](#browsers) first.

From here, the guide builds up one step at a time: clients, calls and errors
first, then plugins and endpoints, then structuring a whole app.

## Creating a client

A client holds everything a backend's calls have in common: where the backend
lives, the headers every request needs, the shape of its errors and the
plugins every call goes through.

### Configuring a client

```ts
import * as Config from "effect/Config";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { bearer, logger, retry, timeout } from "@monarcode/effetch/plugins";

const ApiError = Schema.Struct({ code: Schema.String, message: Schema.String });

const session: { accessToken?: string } = {};

export const makeApi = Fetch.make({
  baseUrl: Config.String("API_URL"),
  headers: { "x-client": "web" },
  defaultError: ApiError,
  plugins: [
    logger(),
    retry(),
    timeout({ duration: "10 seconds" }),
    bearer({ token: () => session.accessToken }),
  ],
});
```

Every option is optional:

| Option         | What it's for                                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`      | Where the API lives. It's put in front of every path that isn't a full `http(s)://` URL. Pass a string, or an Effect that's run once when the client is made, such as a `Config`. It can't contain a query string or a fragment. |
| `headers`      | Headers sent with every request. A call's header with the same name wins. `content-type` and `content-length` are ignored here, since they come from each body.                                                                  |
| `defaultError` | A schema for the body of the API's error responses (see [Typed error bodies](#typed-error-bodies)).                                                                                                                              |
| `plugins`      | Behaviour every call goes through (see [Plugins](#plugins)).                                                                                                                                                                     |

### Sharing it across your app

`Fetch.make` returns an Effect that builds the client. Build it once, and
share it as a service:

```ts
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

const makeApi = Fetch.make({ baseUrl: "https://api.example.com" });

export class Api extends Context.Service<Api, Effect.Success<typeof makeApi>>()(
  "Api",
) {}

export const ApiLive = Layer.effect(Api)(makeApi).pipe(
  Layer.provide(FetchHttpClient.layer),
);

// Anywhere in your app
export const program = Effect.gen(function* () {
  const api = yield* Api;
  return yield* api.get("/todos/:id", { params: { id: 1 }, output: Todo });
});

// Where you run it
export const runnable = program.pipe(Effect.provide(ApiLive));
```

Two things worth knowing:

- **Your client's type is `Effect.Success<typeof makeApi>`.** It includes
  your plugins and your `defaultError`. Use it wherever you need to type a
  client, such as a function parameter. `Fetch.Client` is the type of a client
  without plugins, and yours won't fit it.
- **Calls need nothing from the environment.** The client holds on to the
  `HttpClient`, the base URL and any services its plugins need. Its calls only
  need the services of their own schemas, if any, so they run anywhere: in a
  service, in a query function, or with `Effect.runPromise`.

## Making calls

### Methods

A client has a method for each HTTP method. Each takes a path and an object of
options, and returns an Effect.

- `get`, `head` and `options` send no body.
- `post`, `put`, `patch` and `del` can send one. It's `del` because `delete`
  is a reserved word.

### Path and query parameters

```ts
import * as Schema from "effect/Schema";

import type * as Fetch from "@monarcode/effetch";

declare const api: Fetch.Client;

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

// GET /todos/1
export const one = api.get("/todos/:id", { params: { id: 1 }, output: Todo });

// GET /todos?page=1&tags=work&tags=home
export const some = api.get("/todos", {
  query: { page: 1, tags: ["work", "home"], search: undefined },
  output: Schema.Array(Todo),
});
```

Every `:name` in a path is a parameter, filled in from `params`. When a path
has parameters, `params` is required, with exactly those names, and when it
has none, `params` isn't allowed. Values are URI-encoded for you.

`query` is a plain object. Arrays repeat the key, and `null` and `undefined`
are dropped, so you can pass optional filters as they are.

### Sending a body

```ts
import * as Schema from "effect/Schema";

import type * as Fetch from "@monarcode/effetch";

declare const api: Fetch.Client;

const Todo = Schema.Struct({
  id: Schema.Finite,
  title: Schema.String,
  done: Schema.Boolean,
  due: Schema.Date,
});
const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });

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

export const upload = (file: Blob) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/uploads", { body: form });
};
```

A `body` is sent according to its type:

- an `HttpBody`, a string, an `ArrayBuffer` or typed array, a `Blob` or
  `File`, `FormData` and `URLSearchParams` are sent as they are;
- anything else is sent as JSON.

Add an `input` schema, and `body` is typed by it and encoded with it before
it's sent as JSON. In `create`, `due` is a `Date` in your code and an ISO
string on the wire.

### Reading the response

Give a call an `output` schema, and the response body is decoded with it. The
call succeeds with the decoded value, or fails with `DecodeError` if the body
doesn't match. It also sends `Accept: application/json`, unless you set an
`accept` header yourself.

Without `output`, the call succeeds with the raw `HttpClientResponse`. That's
handy when you only care that the call worked, or want to read the body
yourself:

```ts
import * as Schema from "effect/Schema";

import type * as Fetch from "@monarcode/effetch";

declare const api: Fetch.Client;

// No output: succeeds with the HttpClientResponse.
export const remove = api.del("/todos/:id", { params: { id: 1 } });

// Nothing to decode: an empty body (204, HEAD) decodes as JSON null.
export const archive = api.post("/todos/:id/archive", {
  params: { id: 1 },
  output: Schema.Void,
});
```

> **Tip:** use `Schema.Finite` rather than `Schema.Number` for numbers.
> Responses are decoded with Effect's JSON codec, where `Schema.Number` also
> decodes the strings `"NaN"`, `"Infinity"` and `"-Infinity"`, and encodes
> those values back to strings. `Schema.Finite` accepts every JSON number and
> rejects the rest.

### All call options

| Option    | What it does                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `params`  | Values for the path's `:params`. Required, with exactly those names, when the path has any; not allowed otherwise. Values are URI-encoded.                                             |
| `query`   | An object of query parameters. Arrays repeat the key, and `null` and `undefined` are dropped.                                                                                          |
| `headers` | Headers for this call. They win over the client's, and over the body's `content-type`.                                                                                                 |
| `body`    | Sent by its type: `HttpBody`, string, `ArrayBuffer` and typed arrays, `Blob`/`File`, `FormData` and `URLSearchParams` as they are, anything else as JSON.                              |
| `input`   | A schema that `body` is encoded with before it's sent as JSON. `body` is then typed by the schema.                                                                                     |
| `output`  | A schema the 2xx JSON body is decoded with. The call then sends `Accept: application/json` (unless you set `accept`). Without it, the call succeeds with the raw `HttpClientResponse`. |
| `error`   | A schema for the body of error responses, replacing the client's `defaultError`.                                                                                                       |
| `plugins` | Plugin overrides for this call (see [Changing plugins for one call](#changing-plugins-for-one-call)).                                                                                  |

### When the methods aren't enough

- **The method is only known at runtime.** `api.request` takes it as its
  first argument, before the path and the options:

  ```ts
  import type * as HttpMethod from "effect/http/HttpMethod";

  import type * as Fetch from "@monarcode/effetch";

  declare const api: Fetch.Client;

  export const send = (method: HttpMethod.HttpMethod, path: string) =>
    api.request(method, path);
  ```

- **You need something the methods don't do, such as streaming a response.**
  `api.httpClient` is the configured `HttpClient` underneath, with the base
  URL, the default headers and the plugins, but no status check and no
  decoding.

## Handling errors

### What can go wrong

A call can fail in three ways, each with its own tagged error. Plugins can add
their own, such as `timeout`'s `TimeoutError`.

| Error                   | When                                                                               | Fields                                               |
| ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `NetworkError`          | No response: offline, DNS failure, connection refused, CORS rejection.             | `method`, `url`, `cause`                             |
| `HttpError`             | A response outside 200–299 (3xx included).                                         | `method`, `url`, `status`, `headers`, `text`, `body` |
| `DecodeError`           | A 2xx body that isn't JSON or doesn't match `output`. Only on calls with `output`. | `method`, `url`, `status`, `issue`, `message`        |
| `TimeoutError` (plugin) | The `timeout` plugin's limit passed before the response arrived.                   | `method`, `url`, `duration`                          |

### Catching errors

Errors are part of each call's type, so TypeScript knows exactly which ones
are left to handle. Catch them by tag with `Effect.catchTags`:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type * as Fetch from "@monarcode/effetch";

declare const api: Fetch.Client;

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const ApiError = Schema.Struct({ code: Schema.String });

export const todo = (id: number) =>
  api.get("/todos/:id", { params: { id }, output: Todo, error: ApiError }).pipe(
    Effect.catchTags({
      HttpError: (error) =>
        error.status === 404
          ? Effect.succeed(undefined)
          : Effect.fail(error.body?.code ?? `HTTP ${error.status}`),
      NetworkError: () => Effect.fail("You're offline"),
      DecodeError: (error) => Effect.fail(error.message),
    }),
  );
```

Each handler gets the error with its fields. You don't have to handle them
all: the ones you leave out stay in the type, for code further up to handle.
For a single error, `Effect.catchTag` does the same.

`Fetch.FetchError` is the union of the three errors, and `Fetch.isFetchError`
tells them apart from other values.

### Typed error bodies

APIs usually explain an error in its body, such as
`{ "code": "not_found" }`. Give effetch a schema for it, and
`HttpError.body` is decoded and typed:

- `defaultError`, on the client, applies to every call;
- `error`, on a call or an [endpoint](#endpoints), replaces it.

`body` is the decoded body, or `undefined` if it didn't match the schema.
Without a schema, it's the parsed JSON. Reading it never fails the call, and
the raw body is always on `text`.

`Fetch.HttpError.With<B>` is the type of an `HttpError` whose `body` is `B`,
for your own function signatures.

### Safe to log

Errors are made to be logged and reported:

- `url` never includes the query string, so tokens in queries stay out of
  logs.
- `HttpError.headers` are Effect `Headers`: `authorization`, `set-cookie` and
  other sensitive headers print as `<redacted>`.

### Bugs are defects

Some mistakes are bugs in the calling code, not failures to recover from at
runtime. Those make the Effect die, as a defect, rather than fail with a typed
error:

- a missing path parameter;
- a body that can't be encoded;
- a body on a `GET` or `HEAD` request;
- a `baseUrl` with a query string;
- two plugins with the same name;
- a relative URL without a `baseUrl`, outside browsers.

## Plugins

Plugins add behaviour to every call a client makes, such as sending a token,
or trying again when the network drops. You pass them to `Fetch.make`, and any
call can turn one off or adjust it.

### Built-in plugins

```ts
import * as Effect from "effect/Effect";

import * as Fetch from "@monarcode/effetch";
import { bearer, logger, retry, timeout } from "@monarcode/effetch/plugins";

declare const readToken: () => Promise<string | null>;

export const makeApi = Fetch.make({
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
| `logger({ level? })`                                | Logs one entry per call at Debug (or Info): `GET <url> 200 (35ms)`, or `failed` with the cause, with the call's [route](#knowing-the-route) as an annotation. Never logs headers or query strings.                                                                                                  | `false`                 |
| `retry({ times?, schedule?, methods?, statuses? })` | Retries network errors and 408, 429, 500, 502, 503 and 504, 2 times by default, with jittered exponential backoff from 200ms. Only idempotent methods (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`) by default, so a `POST` is never sent twice. When retries run out, the last response is returned. | `false`, `{ times }`    |
| `timeout({ duration })`                             | Fails with `TimeoutError` and aborts the request when the response headers don't arrive in time. Downloading the body isn't covered.                                                                                                                                                                | `false`, `{ duration }` |

A `bearer` token function that throws, or whose promise rejects, makes the
call die. To fail with a typed error instead, pass an Effect: its error and
services become the client's, and `make` asks for the services.

### Plugin order

The first plugin is the outermost: it runs first on the way out, and last on
the way back. The order above is the one to use:

- `logger` sees the whole call, retries included;
- each retry gets its own timeout, and asks for the token again;
- a timed-out attempt isn't retried.

### Changing plugins for one call

Any call can skip a plugin with `false`, and plugins with options take part of
them. TypeScript checks the plugin names and the option types:

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

  // Logging in sends no token.
  yield* api.post("/auth/login", {
    body: { user: "ada" },
    plugins: { bearer: false },
  });

  // A slow export gets more time, and isn't retried.
  yield* api.get("/reports/export", {
    plugins: { timeout: { duration: "2 minutes" }, retry: { times: 0 } },
  });
});
```

## Writing plugins

When the built-in plugins don't cover what you need, write your own. The
built-in ones are written with the same API.

### Your first plugin

A plugin is a name and one or more hooks. This one pins the API version on
every request, with an option that a call can change:

```ts
import * as Effect from "effect/Effect";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import * as Fetch from "@monarcode/effetch";

export const apiVersion = Fetch.plugin({
  name: "apiVersion",
  defaults: { version: "2024-06-01" },
  onRequest: (request, ctx) =>
    Effect.succeed(
      HttpClientRequest.setHeader(request, "api-version", ctx.options.version),
    ),
});

export const program = Effect.gen(function* () {
  const api = yield* Fetch.make({
    baseUrl: "https://api.example.com",
    plugins: [apiVersion],
  });
  yield* api.get("/reports", {
    plugins: { apiVersion: { version: "2025-01-01" } },
  });
});
```

`Fetch.plugin` infers the plugin's name, options, errors and services from
what you give it, so calls can override `apiVersion` by name, and their
options are checked. `ctx.options` is the plugin's `defaults` merged with the
call's override, so a plugin needs `defaults` to take options.

### Hooks

| Hook                           | Runs                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `onRequest(request, ctx)`      | Before the request is sent, in array order. Returns the request to send, or fails. It sees the full URL and the client's headers.            |
| `onResponse(response, ctx)`    | On every response, non-2xx included, in reverse order. Returns the response, or fails. The status check and decoding come after all plugins. |
| `onError(error, ctx)`          | After a call fails or dies, in array order. It can't change the outcome.                                                                     |
| `wrap(client, options, route)` | Wraps the plugins after it and the network, for retries, timeouts and the like. It can add errors but can't remove them.                     |

`ctx.request` is the request: in `onResponse`, the one this plugin passed on;
in `onError`, the one the call built.

### Knowing the route

`ctx.route` is the call's method and path as written, before the params are
filled in: `"GET /users/:id"`, whether the call was
`api.get("/users/:id", …)` or an [endpoint](#endpoints). It's the same for
every user ID, so it's what to group logs, metrics and error reports by. It's
`undefined` for requests sent through `client.httpClient`.

A `wrap` reads it from its third argument, an Effect like `options`:

```ts
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";

import * as Fetch from "@monarcode/effetch";

declare const report: (error: unknown, route: string | undefined) => void;

export const errorReporter = Fetch.plugin({
  name: "errorReporter",
  onError: (error, ctx) => Effect.sync(() => report(error, ctx.route)),
});

export const timing = Fetch.plugin({
  name: "timing",
  wrap: (client, _options, route) =>
    HttpClient.transform(client, (response, request) =>
      Effect.gen(function* () {
        const label = (yield* route) ?? request.url;
        return yield* Effect.withLogSpan(response, label);
      }),
    ),
});
```

### Example: signing out on a 401

The classic plugin: send the session's token, and when the API answers `401`,
sign out and fail with a typed `SessionExpired`:

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

// makeApi now needs Session; calls fail with SessionExpired too.
export const makeApi = Fetch.make({
  baseUrl: "https://api.example.com",
  plugins: [auth],
});
```

### Example: a deadline with its own error

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

### Tips

- Services a plugin needs are required by `make`, once. Calls don't need
  them. Services provided around a call win over those `make` saw.
- Plugin names must be unique.
- Write `wrap` bodies with `Effect.gen`. A ternary that returns two different
  Effects can't be typed.
- Pass plugin lists inline, or let TypeScript infer them. Annotating a list as
  `Fetch.Plugin.Any[]` erases the plugins' types.

## Endpoints

Once a call is made from more than one place, you start repeating its path,
its schemas and its rules. An endpoint saves them once, and gives you a
function to call.

### Defining endpoints

`api.endpoint` takes a route, the method and the path in one string, and what
every call to it shares. It returns a function that takes the rest:

```ts
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { bearer } from "@monarcode/effetch/plugins";

declare const readToken: () => Promise<string | null>;

const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
const NewUser = Schema.Struct({ name: Schema.String });
const Credentials = Schema.Struct({
  user: Schema.String,
  password: Schema.String,
});
const Session = Schema.Struct({ token: Schema.String });

const makeApi = Effect.gen(function* () {
  const api = yield* Fetch.make({
    baseUrl: "https://api.example.com",
    plugins: [bearer({ token: () => readToken() })],
  });
  return {
    getUser: api.endpoint("GET /users/:id", { output: User }),
    listUsers: api.endpoint("GET /users", { output: Schema.Array(User) }),
    createUser: api.endpoint("POST /users", { input: NewUser, output: User }),
    login: api.endpoint("POST /auth/login", {
      input: Credentials,
      output: Session,
      plugins: { bearer: false },
    }),
  };
});

export class Api extends Context.Service<Api, Effect.Success<typeof makeApi>>()(
  "Api",
) {}

export const program = Effect.gen(function* () {
  const { getUser, listUsers, createUser } = yield* Api;
  const ada = yield* createUser({ body: { name: "Ada" } });
  const users = yield* listUsers({ query: { page: 2 } });
  const user = yield* getUser({ params: { id: ada.id } });
  return { users, user };
});
```

`getUser({ params: { id } })` sends exactly what
`api.get("/users/:id", { output: User, params: { id } })` does, and returns
the same Effect. Endpoints add no new behaviour: a call goes through the same
plugins, decoding and errors as the method it stands for, so everything above
applies to both.

The route is an uppercase method, one space, then a path that starts with `/`
or a full `http(s)://` URL. TypeScript checks it as you type: `"GTE /users"`
and `"get /users"` don't compile, and your editor suggests the methods.

### Calling an endpoint

What's fixed goes in the definition, and what changes goes in each call:

| Defined once, on the endpoint | Passed with each call     |
| ----------------------------- | ------------------------- |
| `output`, `error`, `input`    | `params`, `query`, `body` |
| `headers`, `plugins`          | `headers`, `plugins`      |

- `params` are required when the route's path has any, as with the methods.
  An endpoint that needs nothing more is called with no arguments:
  `listUsers()`.
- With an `input` schema, `body` is required and typed by it.
- `GET`, `HEAD`, `OPTIONS` and `TRACE` endpoints take no `body` and no
  `input`, and TypeScript rejects them.

### Defaults and overrides

- **Headers.** A call's headers win over the endpoint's, which win over the
  client's. Unlike the client's, an endpoint's headers can set
  `content-type`.
- **Plugins.** A call's plugin override wins over the endpoint's, and when
  both give options, they're merged. An endpoint defined with `retry: false`
  can still be retried in one call with `plugins: { retry: { times: 2 } }`.
- **Schemas** belong to the endpoint, and can't be changed per call.

Each endpoint also has `route`, `method` and `path` properties, for log labels
or cache keys. Plugins see the same route, as
[`ctx.route`](#knowing-the-route). Its `output`, `error` and `input`
properties are its schemas, for things like decoding cached data or building
test fixtures: `output` and `input` are `undefined` when the endpoint has
none, and `error` is the schema error bodies are decoded with, the
endpoint's, else the client's `defaultError`, else `Schema.Unknown`.

### Why use endpoints

An HTTP call mixes two kinds of information:

| Fixed by the API                                     | Different on every call             |
| ---------------------------------------------------- | ----------------------------------- |
| the route; the response, error and body schemas      | path params, query values, the body |
| rules for that route, such as "login sends no token" | a one-off header or plugin override |

With the methods, you write both at every call site. Three calls to
`GET /users/:id` repeat the path and the `User` schema three times, and a
mistake in one of them, such as the wrong schema or a forgotten
`bearer: false`, still compiles. An endpoint takes the first column once, when
it's defined, and only the second column when it's called. That gives you:

- **One place per route.** A path or a schema changes in one line, and the
  service that holds your endpoints lists the API you use.
- **Stricter types than a method can have.** A method only learns its HTTP
  method and its `input` at the call, so it has to accept both ways. An
  endpoint knows them up front: `body` is required when there's an `input`
  (it's optional with `api.post`), a `GET` endpoint rejects a `body` at
  compile time (`api.request("GET", …)` only dies at runtime), and the route
  is checked as you type.
- **Defaults that can't be forgotten.** An endpoint's headers and plugin
  overrides apply to every call.
- **A name instead of a URL.** Call sites read `users.get(…)`, and `route`,
  `method` and `path` are there for query keys and log labels.

An endpoint is a saved call, not a contract shared with a server. For that,
use Effect's `HttpApi`.

### Endpoints or methods?

Use an endpoint when a call:

- is made from more than one place;
- has rules every call must follow, such as an auth exception or a content
  type;
- sends a body with an `input` schema;
- belongs to a backend whose API you want listed in one place.

Use a method for one-off calls, and for calls whose method or path is only
known at runtime. Mixing them is normal: keep the client next to its
endpoints, for the calls that aren't worth one.

Avoid:

- **`api.endpoint(…)(…)` at a call site.** That's a method call written
  twice: use the method.
- **Defining endpoints in code that runs on every request.** Define them once,
  when the layer that holds them is built.
- **Spreading several groups of endpoints into one object.** When two use the
  same name, the later one silently wins. Nest them instead:
  `{ users, todos }`.

## Structuring an app

Endpoints are made from a client, so you define them wherever a client is
available: in a layer that reads it, or in a function that takes it. Where
that is depends on the size of your app.

### A small app

Keep the client in one file, and each area's endpoints in another, as a
function of the client. One service makes the client once, and calls each
function once:

```ts
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";
import { bearer } from "@monarcode/effetch/plugins";

const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
const NewUser = Schema.Struct({ name: Schema.String });
const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

// client.ts
export const makeClient = Fetch.make({
  baseUrl: "https://api.example.com",
  plugins: [bearer({ token: "token" })],
});
export type Client = Effect.Success<typeof makeClient>;

// users.ts
export const users = (api: Client) => ({
  get: api.endpoint("GET /users/:id", { output: User }),
  create: api.endpoint("POST /users", { input: NewUser, output: User }),
  login: api.endpoint("POST /auth/login", {
    output: User,
    plugins: { bearer: false },
  }),
});

// todos.ts
export const todos = (api: Client) => ({
  list: api.endpoint("GET /todos", { output: Schema.Array(Todo) }),
});

// api.ts
const makeApi = Effect.map(makeClient, (client) => ({
  client, // for one-off calls
  users: users(client),
  todos: todos(client),
}));

export class Api extends Context.Service<Api, Effect.Success<typeof makeApi>>()(
  "Api",
) {}

// anywhere
export const program = Effect.gen(function* () {
  const { users } = yield* Api;
  return yield* users.get({ params: { id: 1 } });
});
```

`Client` is the type of your client, plugins and `defaultError` included, so
the plugin overrides in `users.ts` are checked against your plugins, and
errors are typed with your `defaultError`.

### A feature-sliced app

When your app is split into feature modules, each with its own schemas, turn
it around. The client becomes shared infrastructure that knows nothing about
the modules, and each module defines its own endpoints from it, next to its
schemas:

```text
src/
├── infrastructure/http/
│   └── app-api-client.ts  the client: base URL, error body, plugins
├── modules/
│   ├── todos/
│   │   ├── contract/      schemas
│   │   ├── data/          endpoints, made from AppApiClient
│   │   ├── application/   workflows that take more than one call
│   │   └── public.ts
│   └── wallet/
└── runtime.ts             modules, on top of clients, on top of HttpClient
```

> **This layout is a personal preference,** the one effetch's author uses in
> their own apps, and effetch doesn't depend on it. Rename, merge or split the
> folders to suit your project. What carries over is that modules import the
> client, never the other way around, and that endpoints are defined once, in
> a layer.

```ts
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";

// infrastructure/http/app-api-client.ts: how to reach the backend, nothing else
const makeAppApiClient = Fetch.make({ baseUrl: Config.String("APP_API_URL") });

export class AppApiClient extends Context.Service<
  AppApiClient,
  Effect.Success<typeof makeAppApiClient>
>()("AppApiClient") {}

export const AppApiClientLive = Layer.effect(AppApiClient)(makeAppApiClient);

// modules/todos/contract/todos.ts
const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const NewTodo = Schema.Struct({ title: Schema.String });

// modules/todos/data/todo.api.ts: the module's endpoints, as its service
const makeTodoApi = AppApiClient.useSync((client) => ({
  list: client.endpoint("GET /todos", { output: Schema.Array(Todo) }),
  get: client.endpoint("GET /todos/:id", { output: Todo }),
  create: client.endpoint("POST /todos", { input: NewTodo, output: Todo }),
}));

export class TodoApi extends Context.Service<
  TodoApi,
  Effect.Success<typeof makeTodoApi>
>()("TodoApi") {}

export const TodoApiLive = Layer.effect(TodoApi)(makeTodoApi);

// runtime.ts
export const AppLayer = TodoApiLive.pipe(
  Layer.provideMerge(AppApiClientLive),
  Layer.provide(FetchHttpClient.layer),
);

// anywhere
export const program = Effect.gen(function* () {
  const todos = yield* TodoApi;
  const todo = yield* todos.create({ body: { title: "Write docs" } });
  return yield* todos.get({ params: { id: todo.id } });
});
```

This scales well as the app grows:

- **The client file stays the same size,** however many endpoints the app
  has, and it never imports a module: dependencies point from the modules to
  the infrastructure.
- **A module with 20 endpoints has 20 one-line definitions** in its own
  `data/` folder, beside its own schemas. When they serve separate concerns,
  split them into several services, each in its own file.
- **Every module's data service is its endpoints,** as `TodoApi` is here: one
  line per operation, and every type inferred, so every module's `data/`
  folder looks the same.
- **An operation that isn't one HTTP call** (it combines calls, reshapes a
  response or adds a domain error) is a workflow over those endpoints, in the
  module's `application/` folder.
- **Declare a service's interface by hand only when you need another
  implementation,** such as an offline one or a fake for UI work, and
  implement it with the endpoints.

[`examples/app`](examples/app) is a complete app in this layout, with two
modules and two backends.

### Several backends

Make one client per backend, each in its own service, with its own `baseUrl`,
`defaultError` and plugins. Each module, or each area's function, uses the
client of the backend it talks to, and one `HttpClient` layer serves them all.

- Plugins are values: one `bearer` can serve several clients.
- `ctx.route` has no host. A plugin that groups by route and is shared by
  several clients should take the backend's name, so each client gets its own
  instance.
- Catch a backend's `HttpError` next to its calls, where `body` has that
  backend's error shape.

[`examples/backends.ts`](examples/backends.ts) does this in one file, and
[`examples/app`](examples/app) across modules.

## Testing

effetch never touches the network itself: it sends every request through the
`HttpClient` you provide. In tests, provide a fake one, and check what was
sent:

```ts
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Fetch from "@monarcode/effetch";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

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

## Platform notes

### Browsers

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

const makeApi = Fetch.make({ baseUrl: "https://api.example.com" });

export class Api extends Context.Service<Api, Effect.Success<typeof makeApi>>()(
  "Api",
) {}

export const ApiLive = Layer.effect(Api)(
  makeApi.pipe(
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  ),
).pipe(Layer.provide(FetchHttpClient.layer));
```

In a browser, a relative path without a `baseUrl` is resolved against the
page's URL.

### React Native

- effetch doesn't use `URL` itself. Effect's `HttpClient` does, including
  `searchParams`. Expo provides a standard `URL`. In a React Native app
  without Expo, install a polyfill such as `react-native-url-polyfill`.
- effetch and Effect use package `exports` (`effect/http/HttpClient`,
  `@monarcode/effetch/plugins`). Metro resolves them by default from React
  Native 0.79 (Expo SDK 53). On older versions, set
  `resolver.unstable_enablePackageExports = true` in `metro.config.js`.
- `FetchHttpClient.layer` uses the global `fetch`.

## Reference

### Limitations

- A path parameter is a whole segment: `/files/:name.json` has one parameter
  called `name.json`.
- No query schemas or optional path parameters yet.
- Paths shouldn't contain `?` or `#`. Pass query parameters with `query`.
- `timeout` and the logged duration cover the time until the response
  headers arrive, not downloading the body.
- Two plugins with the same name are only caught when the client is made.

### API

`@monarcode/effetch`:

- `make`, `ClientConfig`, `Client`: [creating a client](#creating-a-client)
  and [making calls](#making-calls).
- `Endpoint`, `EndpointMethod`, `EndpointDefinition`, `EndpointOptions`,
  `EndpointBody`, `EndpointArgs`, `EndpointRoute`, `ValidRoute`,
  `RouteMethod`, `RoutePath`: [endpoints](#endpoints).
- `NetworkError`, `HttpError` (and `HttpError.With`), `DecodeError`,
  `FetchError`, `isFetchError`: [errors](#handling-errors).
- `plugin`, `Plugin` (and the `Plugin.*` helper types), `PluginContext`:
  [writing plugins](#writing-plugins).
- Option and result types, for wrapping the client in your own functions:
  `RequestOptions`, `NoBodyRequestOptions`, `BaseOptions`, `BodyOptions`,
  `ParamsOption`, `QueryInput`, `QueryOf`, `QueryValue`, `AnySchema`,
  `Args`, `Success`, `CallError`, `CallServices`, `CallEffect`,
  `NoBodyMethod`, `BodyMethod`, `RequestMethod`, `PathParamNames`,
  `PathParams`, `PathParamValue`. `CallEffect` types a function that
  returns a call; to take a call as an argument, accept any
  `Effect.Effect<A, E, R>`.

`@monarcode/effetch/plugins`:

- `bearer`, `BearerOptions`, `BearerPlugin`, `TokenSource`, `TokenValue`.
- `logger`, `LoggerOptions`, `LoggerPlugin`.
- `retry`, `RetryOptions`, `RetryPlugin`.
- `timeout`, `TimeoutOptions`, `TimeoutPlugin`, `TimeoutError`.

Every export is documented, with an example, in the type declarations your
editor shows.

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

The pre-commit hook runs `lint` and `format:check`.

## License

[MIT](LICENSE)
