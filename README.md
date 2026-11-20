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
[![Browsers](https://img.shields.io/badge/Browsers-20232a?logo=googlechrome&logoColor=white)](#browsers)
[![React Native](https://img.shields.io/badge/React%20Native-20232a?logo=react&logoColor=61dafb)](#react-native)
[![Expo](https://img.shields.io/badge/Expo-20232a?logo=expo&logoColor=white)](#react-native)
[![Node.js](https://img.shields.io/badge/Node.js%2020+-20232a?logo=nodedotjs&logoColor=5fa04e)](#platform-notes)
[![Bun](https://img.shields.io/badge/Bun-20232a?logo=bun&logoColor=fbf0df)](#platform-notes)
[![Deno](https://img.shields.io/badge/Deno-20232a?logo=deno&logoColor=white)](#platform-notes)

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

## Contents

- [Why Effetch](#why-effetch)
  - [At a glance](#at-a-glance)
  - [What you get](#what-you-get)
  - [Where it fits](#where-it-fits)
- [Getting started](#getting-started)
  - [Install](#install)
  - [Importing](#importing)
  - [Your first client](#your-first-client)
  - [How the pieces fit](#how-the-pieces-fit)
- [Setting up a client](#setting-up-a-client)
  - [Declaring a client](#declaring-a-client)
  - [Configuration](#configuration)
  - [Providing the client](#providing-the-client)
  - [A client from another](#a-client-from-another)
  - [Fetch.Service or Fetch.make?](#fetchservice-or-fetchmake)
- [Making calls](#making-calls)
  - [Methods](#methods)
  - [Path and query parameters](#path-and-query-parameters)
  - [Sending a body](#sending-a-body)
  - [Uploading files](#uploading-files)
  - [Reading the response](#reading-the-response)
  - [All call options](#all-call-options)
  - [When the methods aren't enough](#when-the-methods-arent-enough)
- [Handling errors](#handling-errors)
  - [What can go wrong](#what-can-go-wrong)
  - [Catching errors](#catching-errors)
  - [Typed error bodies](#typed-error-bodies)
  - [Errors by status](#errors-by-status)
  - [Safe to log](#safe-to-log)
  - [Bugs are defects](#bugs-are-defects)
- [Plugins](#plugins)
  - [Built-in plugins](#built-in-plugins)
  - [Refreshing a token](#refreshing-a-token)
  - [Retry-After and a time limit](#retry-after-and-a-time-limit)
  - [Console logging](#console-logging)
  - [Plugin order](#plugin-order)
  - [Changing plugins for one call](#changing-plugins-for-one-call)
- [Endpoints](#endpoints)
  - [Why endpoints](#why-endpoints)
  - [Defining endpoints](#defining-endpoints)
  - [Sharing endpoints as a service](#sharing-endpoints-as-a-service)
  - [Calling an endpoint](#calling-an-endpoint)
  - [Other ways to bind endpoints](#other-ways-to-bind-endpoints)
  - [Typed query parameters](#typed-query-parameters)
  - [Building an endpoint's URL](#building-an-endpoints-url)
  - [Defaults and overrides](#defaults-and-overrides)
  - [Endpoints or methods?](#endpoints-or-methods)
- [Streaming responses](#streaming-responses)
  - [Server-Sent Events](#server-sent-events)
  - [Newline-delimited JSON](#newline-delimited-json)
  - [Stream endpoints](#stream-endpoints)
  - [How a stream fails](#how-a-stream-fails)
  - [Stopping a stream](#stopping-a-stream)
- [Pagination](#pagination)
  - [Cursors in headers](#cursors-in-headers)
- [Writing plugins](#writing-plugins)
  - [Your first plugin](#your-first-plugin)
  - [Hooks](#hooks)
  - [Knowing the route](#knowing-the-route)
  - [Example: signing out on a 401](#example-signing-out-on-a-401)
  - [Example: a deadline with its own error](#example-a-deadline-with-its-own-error)
  - [Tips](#tips)
- [Structuring an app](#structuring-an-app)
  - [A small app](#a-small-app)
  - [A feature-sliced app](#a-feature-sliced-app)
  - [Several backends](#several-backends)
- [Testing](#testing)
  - [A fake backend from your endpoints](#a-fake-backend-from-your-endpoints)
  - [Errors and other statuses](#errors-and-other-statuses)
  - [Stream endpoints in tests](#stream-endpoints-in-tests)
  - [Checking what was sent](#checking-what-was-sent)
  - [How requests are matched](#how-requests-are-matched)
  - [A hand-written HttpClient](#a-hand-written-httpclient)
- [Platform notes](#platform-notes)
  - [Browsers](#browsers)
  - [React Native](#react-native)
- [Coming from axios or ky](#coming-from-axios-or-ky)
- [Reference](#reference)
  - [Limitations](#limitations)
  - [API](#api)
- [Examples](#examples)
- [Development](#development)
- [License](#license)

## Why Effetch

Effect gives you two ways to call an HTTP API, and they sit at opposite
ends:

- **`HttpClient` is low level.** For every request you build the URL, check
  the status and decode the body yourself.
- **`HttpApi` is contract first.** You describe the whole API up front and
  share it with the server, which is ideal when you own both sides.

Most apps sit in between. They call a backend they don't control, such as
their company's REST API or a third-party service, one call at a time.
Effetch is made for that. It's a thin layer over `HttpClient` that gives each
call the types and error handling of a contract, without you having to write
one.

### At a glance

Here's the same call written with `HttpClient` alone, and with Effetch:

```ts
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as HttpIncomingMessage from "effect/http/HttpIncomingMessage";
import * as Schema from "effect/Schema";

import type { Fetch } from "@monarcode/effetch";

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

// With Effetch
export const getTodo = (id: number) =>
  api.get("/todos/:id", { params: { id }, output: Todo });
```

Both send the same request and decode the same response. The Effetch version
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
  Turn statuses into your own errors, such as a `404` into `TodoNotFound`,
  with `statusErrors`.
- **Plugins for the repetitive parts.** Auth with token refresh, retries,
  timeouts and logging are built in, and your own take a few lines. Any call
  can turn a plugin off or adjust it, and TypeScript checks the names and
  options.
- **Endpoints.** Save a route like `"GET /users/:id"` with its schemas once,
  then call it like a function wherever you need it. Share a module's
  endpoints as a service with `Fetch.Endpoints`.
- **Streams and pages.** Read Server-Sent Events and newline-delimited JSON
  as an Effect `Stream`, and page through a list with `Fetch.paginate`.
- **Tests without a network.** `FetchTest` makes a typed fake backend from
  your endpoints, so tests run the real client with its plugins.
- **Runs anywhere.** There are no platform-specific imports or builds: it targets browsers,
  React Native, Node 20+, Bun and Deno.

### Where it fits

- Use **Effetch** to call REST and JSON APIs that you don't own, or don't
  share code with.
- Use Effect's **`HttpApi`** when you own both the server and the client,
  and want them to share one contract.
- Use **`HttpClient`** directly for what Effetch doesn't cover, such as
  WebSockets or uploads with progress. Every Effetch client gives you its
  own when you need it.

Coming from axios or ky? [This table](#coming-from-axios-or-ky) maps what
you know to Effetch.

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

### Importing

Everything in the main entry is under one export, `Fetch`. Plugins and the
test backend have their own entries:

```ts
import { Fetch } from "@monarcode/effetch";
import { bearer, retry } from "@monarcode/effetch/plugins";
import { FetchTest } from "@monarcode/effetch/test";

export const plugins = [bearer({ token: "token" }), retry()];
export const getTodo = Fetch.endpoint("GET /todos/:id");
export const Backend = FetchTest.layer([]);
```

Your editor offers to add the `Fetch` import as you type it. For types
alone, use `import type { Fetch } from "@monarcode/effetch"`.

The package also has `@monarcode/effetch/Fetch` and
`@monarcode/effetch/test/FetchTest`: the same exports, without the
namespace, as `effect/Effect` is to `import { Effect } from "effect"`.
TypeScript uses them to name Effetch's types in the `.d.ts` files it emits
for your code. In your own code, import from the main entry.

### Your first client

Let's fetch a todo from [JSONPlaceholder](https://jsonplaceholder.typicode.com),
a free fake API. This is a complete program you can run:

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

Here's what each part does:

1. **`Todo` describes the response.** Effetch decodes the body with it, so
   `todo` is typed, and checked when it arrives. If the API sends something
   else, the call fails with a `DecodeError` instead of handing you bad data.
2. **`Api` is your client.** `Fetch.Service` declares it as an Effect
   service, with everything its calls have in common: here the base URL,
   later the headers, error schemas and plugins.
3. **`api.get` makes the call.** `yield* Api` gives you the client, and the
   `:id` in the path is filled in from `params`.
4. **`Api.layer` builds the client.** It needs an `HttpClient` to send the
   requests. `FetchHttpClient.layer` uses the global `fetch`. Node's works
   too, and in tests you'd use a fake one (see [Testing](#testing)).

Calling an API from a web page on another origin? Read
[Browsers](#browsers) first.

### How the pieces fit

Everything in Effetch builds on four ideas, from the bottom up:

- **An `HttpClient`** sends requests. It's Effect's, and you choose it when
  you run your program: the global `fetch`, Node's, or a fake in tests.
- **A client** is one backend: its base URL, default headers, error schemas
  and plugins. You declare it once, with `Fetch.Service`.
- **A call** is one request: a method such as `api.get`, or an
  [endpoint](#endpoints) you saved. It returns an Effect, typed by your
  schemas, that fails with typed errors.
- **Plugins** wrap every call a client makes, for auth, retries, timeouts
  and logging.

The rest of this guide follows the same order: [setting up a
client](#setting-up-a-client), [making calls](#making-calls) and [handling
errors](#handling-errors), then [plugins](#plugins) and
[endpoints](#endpoints). After those come [streams](#streaming-responses),
[pagination](#pagination), [your own plugins](#writing-plugins), [how to
structure an app](#structuring-an-app) and [testing](#testing).

> **About the examples.** To stay short, many examples start from
> `declare const api: Fetch.Client`: a client without plugins, like the one
> `yield* Api` gives you when `Api` has none. In your app, get the client with
> `yield* Api`. To type a client in a function signature, use
> `Effect.Success<typeof Api>`, which includes your plugins and error
> schemas. Some examples also bind an endpoint inline, with `api.bind`, to
> stay short; in your app, bind endpoints once, with
> [`Fetch.Endpoints`](#sharing-endpoints-as-a-service). Every TypeScript
> example in this README is compiled with the package, so they all match the
> API.

## Setting up a client

A client holds everything a backend's calls have in common: where the
backend lives, the headers every request needs, the shape of its errors and
the plugins every call goes through. You declare it once and share it with
the rest of your app.

### Declaring a client

`Fetch.Service` declares a client as an Effect service, in one class:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
}) {}

// Anywhere in your app
export const program = Effect.gen(function* () {
  const api = yield* Api;
  return yield* api.get("/todos/:id", { params: { id: 1 }, output: Todo });
});
```

The class gives you three things:

- **`Api` is the service.** `yield* Api` gives the client, typed from the
  config.
- **`Api.layer` builds the client.** It needs an `HttpClient`, plus
  whatever the `baseUrl` Effect and the plugins need. Every layer that
  depends on it in one layer graph gets the same client.
- **`Api.config` is the config you passed**, frozen. You can read it when
  the module loads, before any layer is built, for example to get the
  `defaultError` and `statusErrors` schemas.

A few things worth knowing:

- **Your client's type is `Effect.Success<typeof Api>`.** It includes your
  plugins and your `defaultError`. Use it wherever you need to type a
  client, such as a function parameter. `Fetch.Client` is the type of a
  client without plugins, and yours won't fit it.
- **Calls need nothing from the environment.** The client holds on to the
  `HttpClient`, the base URL and any services its plugins need. Its calls
  only need the services of their own schemas, if any, so they run anywhere:
  in a service, in a query function, or with `Effect.runPromise`.
- **Give each client its own id.** Two classes with the same id are the same
  service. `Fetch.isService(value)` tells a class made by `Fetch.Service`
  apart from any other value.

### Configuration

The config takes the same options as `Fetch.make`. Here's a client with all
of them:

```ts
import * as Config from "effect/Config";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { bearer, logger, retry, timeout } from "@monarcode/effetch/plugins";

const ApiError = Schema.Struct({ code: Schema.String, message: Schema.String });

class SessionExpired extends Schema.TaggedError<SessionExpired>()(
  "SessionExpired",
  { message: Schema.String },
) {}

const session: { accessToken?: string } = {};

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: Config.String("API_URL"),
  headers: { "x-client": "web" },
  defaultError: ApiError,
  statusErrors: { 401: SessionExpired },
  plugins: [
    logger(),
    retry(),
    timeout({ duration: "10 seconds" }),
    bearer({ token: () => session.accessToken }),
  ],
}) {}
```

Every option is optional:

| Option         | What it's for                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`      | Where the API lives. It's put in front of every path that isn't a full `http(s)://` URL. Pass a string, or an Effect that's run once when the client is built, such as a `Config`. It can't contain a query string or a fragment. |
| `headers`      | Headers sent with every request. A call's header with the same name wins. `content-type` and `content-length` are ignored here, since they come from each body.                                                                   |
| `defaultError` | A schema for the body of the API's error responses (see [Typed error bodies](#typed-error-bodies)).                                                                                                                               |
| `statusErrors` | Your own errors for error responses, by status, for every call (see [Errors by status](#errors-by-status)).                                                                                                                       |
| `plugins`      | Behaviour every call goes through, outermost first (see [Plugins](#plugins)).                                                                                                                                                     |

### Providing the client

`Api.layer` needs an `HttpClient`. Provide one where you run your program,
usually next to the other layers of your app:

```ts
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";

import { Fetch } from "@monarcode/effetch";

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
}) {}

export const ApiLive = Api.layer.pipe(Layer.provide(FetchHttpClient.layer));

export const program = Effect.gen(function* () {
  const api = yield* Api;
  return yield* api.get("/health");
});

export const runnable = program.pipe(Effect.provide(ApiLive));
```

Keeping the `HttpClient` out of `Api.layer` is what lets tests swap in a
fake one. If you'd rather have `Api.layer` provide it too, override it in
the class:

```ts
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";

import { Fetch } from "@monarcode/effetch";

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
}) {
  static override readonly layer = super.layer.pipe(
    Layer.provide(FetchHttpClient.layer),
  );
}
```

An override can need less than the original layer, but not more, and can't
add an error.

> **Caution:** the override builds the real `HttpClient` into `Api.layer`,
> so a test can no longer swap in a fake one: `FetchTest.layer` provided
> under it is ignored, and requests go to the network. If you test with
> `Api.layer`, keep it as it is and export a separate `ApiLive`, as in the
> first example.

### A client from another

For the same client with a different base URL, such as a second API
version, or with one more header, spread the first class's `config` into a
second class. It keeps the plugins, `defaultError` and `statusErrors`, so
its client has the same type:

```ts
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { retry } from "@monarcode/effetch/plugins";

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com/v1",
  defaultError: Schema.Struct({ code: Schema.String }),
  plugins: [retry()],
}) {}

export class ApiV2 extends Fetch.Service<ApiV2>()("ApiV2", {
  ...Api.config,
  baseUrl: "https://api.example.com/v2",
}) {}
```

`Api.config.headers` is replaced, not merged, when you set `headers`: spread
it too, as in `headers: { ...Api.config.headers, "x-client": "web" }`.

### Fetch.Service or Fetch.make?

`Fetch.make` is the function underneath `Fetch.Service`: it takes the same
config and returns an Effect that builds the client. Use the class by
default, and reach for `Fetch.make` when the class doesn't fit:

| Situation                                                                               | Use             |
| --------------------------------------------------------------------------------------- | --------------- |
| An app, with the client shared as a service                                             | `Fetch.Service` |
| A config known when the module loads (a `baseUrl` Effect such as `Config` is fine)      | `Fetch.Service` |
| Endpoints shared as a service with [`Fetch.Endpoints`](#sharing-endpoints-as-a-service) | `Fetch.Service` |
| A script, a one-off program, or a quick test                                            | `Fetch.make`    |
| A config that comes from an Effect, such as headers read from a service                 | `Fetch.make`    |
| A client made inside your own service's layer, or one per tenant at runtime             | `Fetch.make`    |

In a script, use `Fetch.make` inline:

```ts
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import { Fetch } from "@monarcode/effetch";

const program = Effect.gen(function* () {
  const api = yield* Fetch.make({ baseUrl: "https://api.example.com" });
  return yield* api.get("/health");
});

await Effect.runPromise(program.pipe(Effect.provide(FetchHttpClient.layer)));
```

When the config itself comes from an Effect, call `Fetch.make` inside that
Effect and declare the service by hand:

```ts
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Fetch } from "@monarcode/effetch";

class Tenant extends Context.Service<Tenant, { readonly id: string }>()(
  "Tenant",
) {}

const makeApi = Effect.gen(function* () {
  const tenant = yield* Tenant;
  return yield* Fetch.make({
    baseUrl: "https://api.example.com",
    headers: { "x-tenant": tenant.id },
  });
});

export class Api extends Context.Service<Api, Effect.Success<typeof makeApi>>()(
  "Api",
) {}

export const ApiLive = Layer.effect(Api)(makeApi);
```

Both give you the same client, with the same calls and the same types.

## Making calls

With a client in hand, every call is one method: the path, an object of
options, and an Effect back.

### Methods

A client has a method for each HTTP method:

- `get`, `head` and `options` send no body.
- `post`, `put`, `patch` and `del` can send one. It's `del` because `delete`
  is a reserved word.

### Path and query parameters

```ts
import * as Schema from "effect/Schema";

import type { Fetch } from "@monarcode/effetch";

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
are dropped, so you can pass optional filters as they are. With Effect 4.1 or
later, a value can also be `Redacted`, such as `Redacted.make(apiKey)`: it's
sent as its value, and Effect keeps it out of its own logs and traces.

To type an endpoint's query and send values such as dates, give the endpoint
a schema for it. See [Typed query parameters](#typed-query-parameters).

### Sending a body

```ts
import * as Schema from "effect/Schema";

import type { Fetch } from "@monarcode/effetch";

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
string on the wire. To send a typed body as a form instead, such as a file
upload, see [Uploading files](#uploading-files).

### Uploading files

To upload files, wrap the `input` schema in `Fetch.multipart`. The body is
typed and checked by the schema, as for JSON, then sent as
`multipart/form-data`. Use `Fetch.UploadFile` for a file field:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

const Document = Schema.Struct({ id: Schema.String });

export const uploadDocument = Fetch.endpoint("POST /documents", {
  input: Fetch.multipart(
    Schema.Struct({
      file: Fetch.UploadFile,
      kind: Schema.Literals(["PASSPORT", "DRIVERS_LICENSE"]),
      pages: Schema.optional(Schema.Finite),
    }),
  ),
  output: Document,
});

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
}) {}

class DocumentApi extends Fetch.Endpoints<DocumentApi>()("DocumentApi", Api, {
  upload: uploadDocument,
}) {}

// In a browser, `file` comes from an <input type="file">.
export const upload = (file: File) =>
  Effect.gen(function* () {
    const documents = yield* DocumentApi;
    return yield* documents.upload({ body: { file, kind: "PASSPORT" } });
  });
```

`Fetch.UploadFile` takes the files each platform can send:

- in browsers, Node, Bun and Deno, a `Blob` or `File`;
- in React Native, the `{ uri, name, type }` object its pickers give, typed
  `Fetch.NativeFile`. `uri` and `name` are required: a server only treats a
  part as a file when it has a file name. `type` is optional, and a file
  without one is sent as `application/octet-stream`.

In React Native, send a `NativeFile`, not a `Blob`: React Native's `fetch`
reads a form's files from disk by `uri`, and can't send a `Blob` in a form.

```ts
import type { Fetch } from "@monarcode/effetch";

// From expo-image-picker, for example
declare const asset: {
  readonly uri: string;
  readonly fileName?: string | null;
  readonly mimeType?: string;
};

export const photo: Fetch.NativeFile = {
  uri: asset.uri,
  name: asset.fileName ?? "photo.jpg",
  type: asset.mimeType,
};
```

Use `Fetch.UploadFile` rather than `Schema.File`. `Schema.File` only takes a
`File`, not the `{ uri, name, type }` objects React Native's pickers give,
and `FetchTest` can't read it back from a form.

How the schema's fields become form parts:

- strings as they are; numbers, booleans and bigints as strings; a `Date` as
  its ISO string;
- a file as a file part;
- a list as one part per item, under the same name;
- `null` and `undefined` left out.

A form can't hold a nested object or a list of lists, so TypeScript rejects
most schemas that have one, and a value that has one makes the call die. To
send one, encode it to a string in the schema, such as
`meta: Schema.fromJsonString(Meta)`.

<details>
<summary><strong>Details: headers, errors and where it works</strong></summary>

- The request sets no `Content-Type`, so the platform adds the multipart
  boundary. A `content-type` header from the call, the endpoint or the client
  is removed, for any `FormData` body.
- The request sets no `Content-Type` before your plugins run. A plugin's
  `onRequest` that sets one replaces the boundary, so leave it out for forms.
- A body that doesn't match the schema, or a value a form can't hold, makes
  the call die with an `Invalid request body:` defect, as for JSON (see
  [Bugs are defects](#bugs-are-defects)). So does a `{ uri, name, type }` file
  outside React Native, where `FormData` would send `"[object Object]"`, or
  in a field that isn't a `Fetch.UploadFile`.
- `Fetch.UploadFile` in an `input` schema without `Fetch.multipart` makes the
  call die too: a file has no JSON form.
- It works wherever `input` does: on methods such as `api.post`, on endpoints,
  and in `api.sse` and `api.ndjson`.
- `Fetch.multipart` returns the schema, marked. Add checks or annotations to
  it as you like. A schema built around it, such as with `Schema.NullOr`, is
  sent as JSON again.
- A field's encoded value must be a string, number, boolean, bigint, `Date`,
  file, `null` or `undefined`, or a list of them. A schema such as
  `Schema.DateTimeUtc` or `Schema.URL`, which encodes to an object, needs a
  string form first, such as `Schema.DateTimeUtcFromString`.
- [`FetchTest`](#testing) reads the form back into the body a handler gets,
  decoded with the schema, with files as `File`s. In Node, test with a
  `Blob` or `File`, since a `{ uri, name, type }` file only works in React
  Native.
- A form loses some of what the schema encodes, so `FetchTest` reads it back
  as best it can:
  - A `null` or `undefined` field and an empty list are left out. Such a
    field comes back missing when it's optional. When it's required, it
    comes back as `null` if it takes `null`, then as `[]` if it's a list,
    then as `undefined`.
  - Every part is a string. In a field that takes `null`, the string
    `"null"` comes back as `null`, and in
    `Schema.Union([Schema.String, Schema.Finite])` the string `"12"` comes
    back as the number `12`.

To check a file's size, add a check to `Fetch.UploadFile`. A
`NativeFile` has no size until it's read, so the check only looks at a
`Blob`:

```ts
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

export const SmallFile = Fetch.UploadFile.check(
  Schema.makeFilter(
    (file) => !(file instanceof Blob) || file.size < 10_000_000,
    { expected: "a file under 10 MB" },
  ),
);
```

- A `FormData` you build yourself still works as a `body` without `input`.

</details>

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

import type { Fetch } from "@monarcode/effetch";

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

#### Text and bytes

`output` reads the body as JSON. For other bodies, wrap the schema:

- `Fetch.text()` reads the body as a string, as it was sent.
- `Fetch.text(schema)` reads a single value, such as a count or a status: it
  trims the text, then decodes it with a schema whose encoded side is a
  string, such as `Schema.NumberFromString`.
- `Fetch.bytes()` reads the body as a `Uint8Array`, a copy of the body, for
  images, PDFs and other binary bodies.

The call sends a matching `Accept` header: `text/*, */*;q=0.1` for text, and
`*/*` for bytes, unless you set one.

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

declare const api: Fetch.Client;

export const program = Effect.gen(function* () {
  const csv = yield* api.get("/export.csv", { output: Fetch.text() });
  const count = yield* api.get("/todos/count", {
    output: Fetch.text(Schema.NumberFromString),
  });
  const pdf = yield* api.get("/invoices/:id", {
    params: { id: 7 },
    output: Fetch.bytes(),
  });
  // In a browser, Node, Bun or Deno. React Native's Blob doesn't take arrays.
  return { csv, count, pdf: new Blob([pdf], { type: "application/pdf" }) };
});
```

They work wherever `output` does, endpoints included.

- An empty body is `""` for `Fetch.text()` and a `Uint8Array` of length 0 for
  `Fetch.bytes()`. For `Fetch.text(schema)`, it fails with `DecodeError`, as
  for JSON.
- A body that can't be read, or doesn't match the schema, fails with
  `DecodeError`.
- Error responses are still read as JSON for `error` and `statusErrors`.
- Pass the schema they return to `output` as it is. A schema built around it,
  such as with `Schema.NullOr`, is read as JSON again.

#### The body and the response

To read the status or headers next to the decoded body, such as a total count
or an `ETag`, set `responseMode: "decoded-and-response"`. The call succeeds
with a pair:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { Fetch } from "@monarcode/effetch";

declare const api: Fetch.Client;

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

export const page = Effect.gen(function* () {
  const [todos, response] = yield* api.get("/todos", {
    query: { page: 1 },
    output: Schema.Array(Todo),
    responseMode: "decoded-and-response",
  });
  return { todos, total: Number(response.headers["x-total-count"]) };
});
```

- It's allowed on calls, on endpoint definitions, and on each call of an
  endpoint, where the call's own mode wins.
- Without `output`, both items are the response.
- The body has already been read: use the decoded value.
- The default, `"decoded"`, gives the decoded body alone.

### All call options

| Option         | What it does                                                                                                                                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `params`       | Values for the path's `:params`. Required, with exactly those names, when the path has any; not allowed otherwise. Values are URI-encoded.                                                                                                                                                                        |
| `query`        | An object of query parameters. Arrays repeat the key, and `null` and `undefined` are dropped.                                                                                                                                                                                                                     |
| `headers`      | Headers for this call. They win over the client's, and over the body's `content-type`.                                                                                                                                                                                                                            |
| `body`         | Sent by its type: `HttpBody`, string, `ArrayBuffer` and typed arrays, `Blob`/`File`, `FormData` and `URLSearchParams` as they are, anything else as JSON.                                                                                                                                                         |
| `input`        | A schema `body` is encoded with. `body` is then typed by it. Sent as JSON, or as `multipart/form-data` when wrapped in `Fetch.multipart` (see [Uploading files](#uploading-files)).                                                                                                                               |
| `output`       | A schema the 2xx body is decoded with: read as JSON, or as text with `Fetch.text()` and bytes with `Fetch.bytes()`. The call then sends a matching `Accept` header (unless you set `accept`). Without it, the call succeeds with the raw `HttpClientResponse`. See [Reading the response](#reading-the-response). |
| `responseMode` | `"decoded-and-response"` makes the call succeed with `[value, response]`, to read the status and headers too. Defaults to `"decoded"`, the value alone.                                                                                                                                                           |
| `error`        | A schema for the body of error responses, replacing the client's `defaultError`.                                                                                                                                                                                                                                  |
| `statusErrors` | Your own errors for error responses, by status. See [Errors by status](#errors-by-status).                                                                                                                                                                                                                        |
| `plugins`      | Plugin overrides for this call (see [Changing plugins for one call](#changing-plugins-for-one-call)).                                                                                                                                                                                                             |

### When the methods aren't enough

- **The method is only known at runtime.** `api.request` takes it as its
  first argument, before the path and the options:

  ```ts
  import type * as HttpMethod from "effect/http/HttpMethod";

  import type { Fetch } from "@monarcode/effetch";

  declare const api: Fetch.Client;

  export const send = (method: HttpMethod.HttpMethod, path: string) =>
    api.request(method, path);
  ```

- **The response is a stream of events or lines.** Use `api.sse` or
  `api.ndjson` (see [Streaming responses](#streaming-responses)).

- **You need something the methods don't do.**
  `api.httpClient` is the configured `HttpClient` underneath, with the base
  URL, the default headers and the plugins, but no status check and no
  decoding.

## Handling errors

Every call's type lists the ways it can fail, so TypeScript knows which
errors you've handled and which are left. This section covers what those
errors are, how to catch them, and how to turn the API's error responses into
errors of your own.

### What can go wrong

A call can fail in three ways, each with its own tagged error. Plugins can add
their own, such as `timeout`'s `TimeoutError`, and
[`statusErrors`](#errors-by-status) can turn an `HttpError` into one of your
own.

| Error                   | When                                                                               | Fields                                               |
| ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `NetworkError`          | No response: offline, DNS failure, connection refused, CORS rejection.             | `method`, `url`, `cause`                             |
| `HttpError`             | A response outside 200–299 (3xx included).                                         | `method`, `url`, `status`, `headers`, `text`, `body` |
| `DecodeError`           | A 2xx body that isn't JSON or doesn't match `output`. Only on calls with `output`. | `method`, `url`, `status`, `issue`, `message`        |
| `TimeoutError` (plugin) | The `timeout` plugin's limit passed before the response arrived.                   | `method`, `url`, `duration`                          |

### Catching errors

Catch errors by tag with `Effect.catchTags`:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { Fetch } from "@monarcode/effetch";

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

#### Catching a status

To handle one or more statuses, use `Fetch.catchStatus`. For the common "a
404 means there's nothing there", `Fetch.optional` succeeds with
`Option.none()` on a 404 and `Option.some(value)` otherwise:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

declare const api: Fetch.Client;

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

// Option<Todo>: none for a 404.
export const findTodo = (id: number) =>
  api.get("/todos/:id", { params: { id }, output: Todo }).pipe(Fetch.optional);

// "signed out" for a 401 or a 403.
export const me = api
  .get("/me")
  .pipe(
    Fetch.catchStatus([401, 403], (error) =>
      Effect.succeed(`signed out (${error.status})`),
    ),
  );
```

- The handler gets the `HttpError`, with `status` narrowed to the statuses you
  gave, and what it returns joins the call's type.
- `HttpError` stays in the error type, since other statuses still fail with
  it.
- Both work on endpoint calls too, and `catchStatus` also takes the effect
  first: `Fetch.catchStatus(effect, 404, handler)`.
- A status that [`statusErrors`](#errors-by-status) maps fails with your
  error, not an `HttpError`, so `catchStatus` and `optional` never see it.
  Catch your error by its tag instead.
- The handler's `error.body` is `unknown`. For the typed body of an `error`
  schema, use `Effect.catchTag("HttpError", …)`.

### Typed error bodies

APIs usually explain an error in its body, such as
`{ "code": "not_found" }`. Give Effetch a schema for it, and
`HttpError.body` is decoded and typed:

- `defaultError`, on the client, applies to every call;
- `error`, on a call or an [endpoint](#endpoints), replaces it.

`body` is the decoded body, or `undefined` if it didn't match the schema.
Without a schema, it's the parsed JSON. Reading it never fails the call, and
the raw body is always on `text`.

`Fetch.HttpError.With<B>` is the type of an `HttpError` whose `body` is `B`,
for your own function signatures.

### Errors by status

Often a status, or a status with a given body, means a specific error in
your app: a 404 from `GET /todos/:id` is "todo not found", a 400 with
`"code": "INVALID_ROLE"` is "invalid role", a 401 from anywhere is "session
expired". `statusErrors` maps statuses to your own error schemas, and the
call fails with your error instead of an `HttpError`.

You can give a map in three places, and they add up:

- on the client, for every call, such as a `401` from anywhere;
- on an [endpoint](#endpoints), for every call to it, which is where most of
  them live;
- on a single call.

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
  message: Schema.String,
}) {}

class InvalidRole extends Schema.TaggedError<InvalidRole>()("InvalidRole", {
  code: Schema.Literal("INVALID_ROLE"),
  message: Schema.String,
}) {}

class RoleTaken extends Schema.TaggedError<RoleTaken>()("RoleTaken", {
  code: Schema.Literal("ROLE_TAKEN"),
  message: Schema.String,
}) {}

class SessionExpired extends Schema.TaggedError<SessionExpired>()(
  "SessionExpired",
  { message: Schema.String },
) {}

const ApiError = Schema.Struct({ code: Schema.String });
const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const User = Schema.Struct({ id: Schema.Finite, role: Schema.String });

// For every call
export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  defaultError: ApiError,
  statusErrors: { 401: SessionExpired },
}) {}

// For every call to an endpoint (see Endpoints)
export const getTodo = Fetch.endpoint("GET /todos/:id", {
  output: Todo,
  statusErrors: { 404: TodoNotFound },
});

export const program = Effect.gen(function* () {
  const api = yield* Api;
  const todo = yield* api
    .bind(getTodo)({ params: { id: 1 } })
    .pipe(Effect.catchTag("TodoNotFound", () => Effect.succeed(undefined)));

  // For one call
  const user = yield* api
    .post("/users/:id/roles", {
      params: { id: 1 },
      input: Schema.Struct({ role: Schema.String }),
      body: { role: "owner" },
      output: User,
      statusErrors: { 400: [InvalidRole, RoleTaken] }, // tried in order
    })
    .pipe(
      Effect.catchTags({
        InvalidRole: (error) => Effect.fail(error.message),
        RoleTaken: (error) => Effect.fail(error.message),
      }),
    );
  return { todo, user };
});
```

Before the `catchTags`, the role call fails with
`InvalidRole | RoleTaken | SessionExpired | HttpError.With<{ readonly code: string }> | NetworkError | DecodeError`.
`HttpError` stays: a response can always fail to match.

How a non-2xx response is resolved:

1. If the body is empty or isn't JSON, it's an `HttpError`.
2. Otherwise the schemas listed for its status are tried in order: the
   call's, then the endpoint's, then the client's. The first one that
   decodes the body is the error.
3. If none does, it's the `HttpError` you'd get without `statusErrors`, its
   `body` decoded with `error` or `defaultError`.

| Response                                         | Fails with                   |
| ------------------------------------------------ | ---------------------------- |
| 400 `{ "code": "INVALID_ROLE", "message": "…" }` | `InvalidRole`                |
| 400 `{ "code": "ROLE_TAKEN", "message": "…" }`   | `RoleTaken`                  |
| 400 `{ "code": "MISSING_FIELD" }`                | `HttpError` with `body.code` |
| 400 with an empty or non-JSON body               | `HttpError`                  |
| 401 from any endpoint                            | `SessionExpired`             |
| 500                                              | `HttpError`                  |

<details>
<summary><strong>Details: tags, renamed fields, unions and types</strong></summary>

- **The `_tag`.** Backends don't send one, so when a schema has a literal
  `_tag`, as `Schema.TaggedError` classes do, Effetch adds it to the body
  before decoding. A body that has its own `_tag` is decoded as it is.
- **Renamed fields.** To read `error_code` into `code`, use
  `Schema.encodeKeys`:
  `InvalidRole.pipe(Schema.encodeKeys({ code: "error_code" }))`.
- **Lists, not unions.** A `Schema.Union` is decoded as it is, without a
  `_tag`: list its members instead.
- **2xx entries never apply**, since a 2xx is decoded with `output`.
- Plugins see the response before any of this, so `retry` still retries by
  status. `onError` receives your error, and `api.httpClient` stays raw.
- Maps are copied when they're given, so changing one afterwards changes
  nothing. `api.statusErrors` and a `Fetch.endpoint` definition's
  `statusErrors` are those copies, frozen; an endpoint's `statusErrors`
  joins its own with the client's, each status listing its schemas in the
  order they're tried.
- `Fetch.StatusError<M>` is the union of the errors in a map `M`, and
  `Fetch.StatusErrorSchema<M>` the union of its schemas, for your own
  function signatures.
- A client's type includes its map: `Fetch.Client<Ps, EB, SE>`. A client
  with a map can't be passed where a plain `Fetch.Client` is expected,
  since that would hide its errors.

</details>

[`examples/status-errors.ts`](examples/status-errors.ts) puts all of this in
one program, and [`examples/app`](examples/app) uses it across modules.

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
- a query that doesn't match an endpoint's `query` schema;
- a body on a `GET` or `HEAD` request;
- a `baseUrl` with a query string;
- two plugins with the same name;
- a relative URL without a `baseUrl`, outside browsers.

## Plugins

Most APIs need the same things on every call: a token, retries when the
network drops, a time limit, a log line. Plugins add that behaviour to every
call a client makes. You list them in the client's config, and any call can
turn one off or adjust it.

### Built-in plugins

The built-in plugins come from `@monarcode/effetch/plugins`:

```ts
import * as Effect from "effect/Effect";

import { Fetch } from "@monarcode/effetch";
import { bearer, logger, retry, timeout } from "@monarcode/effetch/plugins";

declare const readToken: () => Promise<string | null>;

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [
    logger({ level: "Info" }),
    retry({ times: 2 }),
    timeout({ duration: "10 seconds" }),
    bearer({ token: () => readToken() }),
  ],
}) {}

export const withEffectToken = bearer({ token: Effect.succeed("token") });
```

| Plugin                                                                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                         | Per call                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `bearer({ token, scheme?, refresh? })`                                    | Sends `Authorization: Bearer <token>`. The token is a string, a function of the request (sync or async), or an Effect, read for every request. `null`, `undefined` and `""` send no header, and an existing `Authorization` header is kept. With `refresh`, a `401` gets a new token and the request is sent again, once. See [Refreshing a token](#refreshing-a-token).                                                                             | `false`                                              |
| `logger({ level? })`                                                      | Logs one entry per call at Debug (or Info): `GET <url> 200 (35ms)`, or `failed` with the cause, with the call's [route](#knowing-the-route) as an annotation. Never logs headers or query strings.                                                                                                                                                                                                                                                   | `false`                                              |
| `consoleLogger(options?)`                                                 | Prints each call to the console while you develop: a line with the route, status, duration and outcome, opening a group with the full URL, headers, bodies and error. Sensitive headers, query parameters and body keys are redacted. See [Console logging](#console-logging).                                                                                                                                                                       | `false`, its settings                                |
| `retry({ times?, schedule?, methods?, statuses?, retryAfter?, budget? })` | Retries network errors and 408, 429, 500, 502, 503 and 504, 2 times by default, with jittered exponential backoff from 200ms. Only idempotent methods (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`) by default, so a `POST` is never sent twice. When retries run out, the last response is returned. `retryAfter` waits as `Retry-After` asks, and `budget` limits the whole call. See [Retry-After and a time limit](#retry-after-and-a-time-limit). | `false`, `{ times }`, and `{ budget }` with a budget |
| `timeout({ duration })`                                                   | Fails with `TimeoutError` and aborts the request when the response headers don't arrive in time. Downloading the body isn't covered.                                                                                                                                                                                                                                                                                                                 | `false`, `{ duration }`                              |

A `bearer` token function that throws, or whose promise rejects, makes the
call die. To fail with a typed error instead, pass an Effect: its error and
services become the client's, and the client's layer (or `Fetch.make`) asks
for the services.

Time limits apply per attempt or to the whole call:

- **Per attempt:** `timeout`, placed after `retry` as above. Each attempt
  gets the full duration, and a timed-out attempt isn't retried.
- **For the whole call:** `retry({ budget })`, every attempt and wait
  included. For one call, or on a client without `retry`, wrap the call in
  `Effect.timeout`.

See [Retry-After and a time limit](#retry-after-and-a-time-limit) for both
together.

### Refreshing a token

To renew an expired access token without failing the call, give `bearer` a
`refresh`. When a request that `bearer` signed gets a `401`, it asks
`refresh` for a new token, then sends the request again with it:

```ts
import { Fetch } from "@monarcode/effetch";
import { bearer } from "@monarcode/effetch/plugins";

declare const tokens: {
  readonly access: () => string | undefined;
  readonly renew: () => Promise<string | undefined>;
};

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [
    bearer({ token: () => tokens.access(), refresh: () => tokens.renew() }),
  ],
}) {}
```

The new token is used for that request only. Store it where `token` reads it,
so later requests send it too. To sign out instead, see
[Example: signing out on a 401](#example-signing-out-on-a-401).

<details>
<summary><strong>Details: how refreshing behaves</strong></summary>

- `refresh` is a function of the refused request, as it was sent, sync or
  async, or an Effect. Like `token`, an Effect's error and services become
  the client's.
- Calls refused with the same token share one refresh, so the token is
  renewed once, and they all get its token or its error. Calls refused with
  different tokens, such as other users' on a server, get their own.
- A call that times out or is interrupted while it waits doesn't cancel the
  refresh for the others.
- The request is sent again once. If the new token is refused too, the call
  ends with that `401`.
- When `refresh` gives `null`, `undefined` or `""`, such as when the session
  has ended, the call ends with the `401`, and nothing more is sent.
- A request with its own `Authorization` header, sent without a token, or
  with a stream body, which can't be sent twice, isn't refreshed. Neither is
  a call that skips `bearer`.
- Make the refresh call itself skip `bearer`: `plugins: { bearer: false }`.
  Calls made inside an Effect `refresh` never refresh, but a function that
  runs the client with `Effect.runPromise` can't be told apart: a `401` to
  it would wait for the refresh it's part of.
- Every method is sent again, a `POST` included: a `401` means the server
  didn't act on the request.

</details>

### Retry-After and a time limit

`retry` has two options for servers that are overloaded or slow:

- `retryAfter`: when a retried response has a `Retry-After` header, wait as
  long as it asks (`Retry-After: 120`, or an HTTP date) in place of the
  schedule's delay. `true` waits up to 1 minute, and `{ max }` up to `max`.
  It's off by default, so a server can't make calls wait.
- `budget`: how long the whole call may take, every attempt and wait
  included. No retry is made when its wait would end at or after the budget:
  the call ends with its last response or `NetworkError`. When the budget runs
  out during an attempt, the attempt is aborted, and the call fails with
  `TimeoutError`. Calls can override it.

For "10 seconds per attempt, 30 seconds in all", use both `timeout` and a
budget:

```ts
import { Fetch } from "@monarcode/effetch";
import { retry, timeout } from "@monarcode/effetch/plugins";

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [
    retry({ times: 5, retryAfter: true, budget: "30 seconds" }),
    timeout({ duration: "10 seconds" }),
  ],
}) {}

// Per call: api.get("/report", { plugins: { retry: { budget: "2 minutes" } } })
```

### Console logging

`logger` writes one structured entry per call for production logs, and leaves
headers, query strings and bodies out. `consoleLogger` is for development: it
prints everything about a call to the console, as a group devtools can
expand.

```ts
import { Fetch } from "@monarcode/effetch";
import { consoleLogger } from "@monarcode/effetch/plugins";

declare const isDevelopment: boolean;

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [
    consoleLogger({
      enabled: isDevelopment,
      slow: "1 second",
      redact: { body: ["otp"] },
    }),
  ],
}) {}
```

Each call prints a line, which opens a group with the details:

```text
▸ GET /todos/:id  200 OK  35 ms  1.2 kB
▸ ✗ GET /todos  3.0 s  → NetworkError: Failed to fetch
▸ ⚠ GET /reports/:id  200 OK  2.4 s  (slow)
▾ ✗ POST /users/:id/roles  400 Bad Request  120 ms  → InvalidRole: No such role
    POST https://api.example.com/users/7/roles
    request headers  { accept: "application/json", authorization: "<redacted>" }
    request body     { role: "owner" }
    response headers { "content-type": "application/json" }
    response body    { code: "INVALID_ROLE", message: "No such role" }
    error            InvalidRole { code: "INVALID_ROLE", message: "No such role" }
```

It prints each call once it's over, with the error it ended with, after
[`statusErrors`](#errors-by-status) and decoding. Values are printed as
objects, so devtools can expand them.

| Option          | Default  | What it does                                                                                                                                               |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`       | `true`   | `false` prints nothing, and keeps the plugin's type, so it can stay in the list in production.                                                             |
| `detail`        | `"full"` | `"summary"` prints the line alone; `"headers"` adds the URL, headers and error; `"full"` adds the bodies.                                                  |
| `only`          | `"all"`  | `"errors"` prints failed calls only.                                                                                                                       |
| `collapsed`     | `true`   | Whether groups start collapsed. `false` by default in React Native, where Metro's terminal drops collapsed groups. Node, Bun and Deno print them expanded. |
| `slow`          | `false`  | A duration, such as `"1 second"`: slower calls are flagged.                                                                                                |
| `maxBodyLength` | `10_000` | Body text longer than this is cut. JSON within it is printed as an object.                                                                                 |
| `redact`        |          | `{ headers, query, body }`: more names to redact, as strings (ignoring case, `-` and `_`) or regular expressions. `false` redacts nothing.                 |
| `filter`        |          | `(call) => boolean`: prints only the calls it accepts. `call` has the `route`, the `request`, the `response`, the `exit` and the `durationMs`.             |
| `color`         | `"auto"` | `"css"` (browser devtools), `"ansi"` (terminals), or `false`. `"auto"` uses `"css"` where there's a `document`, else plain text.                           |

Calls can change `detail`, `only`, `collapsed`, `slow` and `maxBodyLength`, or
skip it with `false`:

```ts
import * as Effect from "effect/Effect";

import { Fetch } from "@monarcode/effetch";
import { consoleLogger } from "@monarcode/effetch/plugins";

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [consoleLogger()],
}) {}

export const program = Effect.gen(function* () {
  const api = yield* Api;
  yield* api.get("/reports/export", {
    plugins: { consoleLogger: { detail: "summary" } },
  });
  yield* api.get("/health", { plugins: { consoleLogger: false } });
});
```

<details>
<summary><strong>Details: what it redacts</strong></summary>

It replaces these with `<redacted>`, matching names ignoring case, `-` and
`_`:

- headers in Effect's `Headers.CurrentRedactedNames` (`authorization`,
  `cookie`, `set-cookie`, `x-api-key`), `proxy-authorization`,
  `x-auth-token`, `x-access-token`, `x-refresh-token`, `x-session-token`,
  `x-csrf-token`, `x-xsrf-token`, `x-client-secret` and
  `x-amz-security-token`;
- keys in JSON and form bodies, at any depth: `token`, `accessToken`,
  `refreshToken`, `idToken`, `authToken`, `apiToken`, `sessionToken`,
  `csrfToken`, `xsrfToken`, `secret`, `clientSecret`, `apiSecret`,
  `apiKey`, `privateKey`, and any name containing `password`;
- query parameters with the same names, `key`, `sig`, `signature` and the
  signed-URL ones (`X-Amz-Signature`, `X-Goog-Signature`, …), values passed
  as `Redacted`, and credentials in the URL (`https://user:password@…`).

They're exact names rather than patterns, so fields such as `total_tokens`
stay visible. Plain-text bodies are printed as they are. A call's error is
printed as a copy of its fields, redacted like a body, without an
`HttpError`'s `text` or a `DecodeError`'s `issue`, which the response body
line shows. Defects are printed as they are.

</details>

<details>
<summary><strong>Details: bodies, platforms and timing</strong></summary>

- It only reads a response body that's text: JSON, `text/*` other than event
  streams, XML or a form, up to 1 MB. Effetch has read it already to check
  the status or decode it, and Effect caches it. A call without `output`
  returns the response itself, so its body isn't read, and stays yours to
  stream. Neither is an interrupted call's.
- It writes through Effect's `Console`, so you can provide another one, with
  `console.log` and groups only. React Native turns `console.error` into an
  error screen.
- In React Native, groups start expanded: Metro's terminal silently drops
  `console.groupCollapsed` and everything logged inside it. React Native is
  detected by `navigator.product`, which it sets to `"ReactNative"`.
- It runs when the call is over, so where it sits in the plugin list doesn't
  matter: a retried call is one entry, and its duration covers every
  attempt. The size comes from `content-length`, or from the body when it's
  read.
- When a plugin fails on a response, such as an auth plugin on a 401, that
  response is shown with the plugin's error.
- `slow` that isn't a duration throws when the plugin is made.
- The request shown is the one that was sent, after plugins such as `bearer`
  changed it. When no response came back, it's the one the call built,
  before plugins ran.

</details>

### Plugin order

The first plugin is the outermost: it runs first on the way out, and last on
the way back. The order in [Built-in plugins](#built-in-plugins) is the one
to use:

- `logger` sees the whole call, retries included (`consoleLogger` sees the
  whole call wherever it is);
- each retry gets its own timeout, and asks for the token again;
- a timed-out attempt isn't retried;
- `retry`'s `budget` covers every attempt and wait, while `timeout` covers
  one attempt;
- a `401` that `bearer` refreshes is sent again inside the same attempt, so
  it shares that attempt's timeout.

### Changing plugins for one call

Any call can skip a plugin with `false`, and plugins with options take part of
them. TypeScript checks the plugin names and the option types:

```ts
import * as Effect from "effect/Effect";

import { Fetch } from "@monarcode/effetch";
import { bearer, retry, timeout } from "@monarcode/effetch/plugins";

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [
    retry(),
    timeout({ duration: "10 seconds" }),
    bearer({ token: "token" }),
  ],
}) {}

export const program = Effect.gen(function* () {
  const api = yield* Api;

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

To write your own plugins, see [Writing plugins](#writing-plugins).

## Endpoints

So far, most calls have spelled out their path and schemas where they're
made. That's fine for a call made once. Once a call is made from several places, you
start repeating its path, its schemas and its rules, and a mistake in one copy
still compiles. An endpoint saves them once, and gives you a function to call.

### Why endpoints

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

Endpoints add no new behaviour: a call goes through the same plugins,
decoding and errors as the method it stands for, so everything in the
sections before this one applies to both. An endpoint is a saved call, not a
contract shared with a server. For that, use Effect's `HttpApi`.

### Defining endpoints

`Fetch.endpoint` takes a route, the method and the path in one string, and
what every call to it shares. It needs no client, so you can define endpoints
next to their schemas:

```ts
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
const NewUser = Schema.Struct({ name: Schema.String });

export const getUser = Fetch.endpoint("GET /users/:id", { output: User });
export const listUsers = Fetch.endpoint("GET /users", {
  output: Schema.Array(User),
});
export const createUser = Fetch.endpoint("POST /users", {
  input: NewUser,
  output: User,
});

getUser.route; // "GET /users/:id"
getUser.output; // User
```

The route is an uppercase method, one space, then a path that starts with `/`
or a full `http(s)://` URL. TypeScript checks it as you type: `"GTE /users"`
and `"get /users"` don't compile, and your editor suggests the methods.
`Fetch.endpoint` also throws on a malformed route, so a bad one fails as soon
as its module is imported.

A definition is plain data: it holds the route, the schemas and the defaults,
but it can't make a call until it's bound to a client.

### Sharing endpoints as a service

`Fetch.Endpoints` binds a record of definitions to a client and shares them as
a service, the way `Fetch.Service` does for the client. It takes the
service's id, the client's service and the record:

```ts
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { bearer } from "@monarcode/effetch/plugins";

declare const readToken: () => Promise<string | null>;

const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
const NewUser = Schema.Struct({ name: Schema.String });
const Credentials = Schema.Struct({
  user: Schema.String,
  password: Schema.String,
});
const Session = Schema.Struct({ token: Schema.String });

const getUser = Fetch.endpoint("GET /users/:id", { output: User });
const listUsers = Fetch.endpoint("GET /users", { output: Schema.Array(User) });
const createUser = Fetch.endpoint("POST /users", {
  input: NewUser,
  output: User,
});
const login = Fetch.endpoint("POST /auth/login", {
  input: Credentials,
  output: Session,
});

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [bearer({ token: () => readToken() })],
}) {}

export class UserApi extends Fetch.Endpoints<UserApi>()("UserApi", Api, {
  get: getUser,
  list: listUsers,
  create: createUser,
  // A [definition, options] pair: logging in sends no token.
  login: [login, { plugins: { bearer: false } }],
}) {}

export const program = Effect.gen(function* () {
  const users = yield* UserApi;
  const ada = yield* users.create({ body: { name: "Ada" } });
  const page = yield* users.list({ query: { page: 2 } });
  const user = yield* users.get({ params: { id: ada.id } });
  return { page, user };
});

export const AppLayer = UserApi.layer.pipe(
  Layer.provideMerge(Api.layer),
  Layer.provide(FetchHttpClient.layer),
);
```

Like `Fetch.Service`, the class gives you three things:

- **`UserApi` is the service.** `yield* UserApi` gives the endpoints, each
  typed with the client's plugins, `defaultError` and `statusErrors`.
- **`UserApi.layer` binds them** to the client once, when it's built. It
  needs the client's service, here `Api`. The client can also be a service
  you wrote by hand.
- **`UserApi.definitions` is the record you passed**, frozen. You can read
  it when the module loads.

`Layer.provideMerge` keeps `Api` in the layer's output, so code can still
`yield* Api` for one-off calls.

Since a definition doesn't know its client:

- **Plugin overrides are given when binding,** as in the `login` pair above,
  where they're checked against the client's plugins. A definition takes no
  `plugins`.
- **A definition without an `error` schema** uses the `defaultError` of the
  client it's bound to.
- **Headers can be given in both.** The binding's win over the definition's.

### Calling an endpoint

What's fixed goes in the definition, and what changes goes in each call:

| Defined once, on the endpoint                       | Passed with each call     |
| --------------------------------------------------- | ------------------------- |
| `output`, `error`, `input`, `query`, `statusErrors` | `params`, `query`, `body` |
| `headers`, `responseMode`, `stream`                 | `headers`, `responseMode` |
| `plugins` (when binding)                            | `plugins`                 |

- `users.get({ params: { id } })` sends exactly what
  `api.get("/users/:id", { output: User, params: { id } })` does, and
  returns the same Effect.
- `params` are required when the route's path has any, as with the methods.
  An endpoint that needs nothing more is called with no arguments:
  `users.list()`.
- With an `input` schema, `body` is required and typed by it.
- `GET`, `HEAD`, `OPTIONS` and `TRACE` endpoints take no `body` and no
  `input`, and TypeScript rejects them.
- With a `query` schema, `query` is typed by it, and required when the
  schema has required fields. See
  [Typed query parameters](#typed-query-parameters).

### Other ways to bind endpoints

`Fetch.Endpoints` is built on two client methods, which you can also use
directly, such as inside your own service's layer:

- **`api.bind(definition, options?)`** binds one definition. `options` are
  the binding's `headers` and `plugins` overrides.
- **`api.bindAll(record)`** binds a record of definitions, each under its own
  name. An entry can also be a `[definition, options]` pair, with the options
  `api.bind` takes. Each endpoint has the type `api.bind` gives it.

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { bearer } from "@monarcode/effetch/plugins";

const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
const Session = Schema.Struct({ token: Schema.String });

const getUser = Fetch.endpoint("GET /users/:id", { output: User });
const login = Fetch.endpoint("POST /auth/login", { output: Session });

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [bearer({ token: "token" })],
}) {}

export const endpoints = Effect.gen(function* () {
  const api = yield* Api;
  return {
    getUser: api.bind(getUser),
    login: api.bind(login, { plugins: { bearer: false } }),
  };
});

export const sameEndpoints = Effect.gen(function* () {
  const api = yield* Api;
  return api.bindAll({
    getUser,
    login: [login, { plugins: { bearer: false } }],
  });
});
```

**`api.endpoint(route, definition)`** defines and binds in one step, where
you already have the client. Its definition can take `plugins` directly,
since it knows the client's plugins:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { bearer } from "@monarcode/effetch/plugins";

const Session = Schema.Struct({ token: Schema.String });

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [bearer({ token: "token" })],
}) {}

export const endpoints = Effect.gen(function* () {
  const api = yield* Api;
  return {
    login: api.endpoint("POST /auth/login", {
      output: Session,
      plugins: { bearer: false },
    }),
  };
});
```

`api.bind(Fetch.endpoint(route, definition))` is the endpoint
`api.endpoint(route, definition)` makes, with the same type and the same
calls. Prefer `Fetch.endpoint` when:

- endpoints should be listed next to their schemas, in a file with no client
  (see [a feature-sliced app](#a-feature-sliced-app));
- one definition serves several clients, such as staging and production;
- a tool works from your endpoints, and needs their routes and schemas
  without a client, as [`FetchTest`](#testing) does.

### Typed query parameters

Give an endpoint a `query` schema, usually a `Schema.Struct`, and each call's
`query` is typed by it and encoded with it before it's sent. A `Schema.Class`
works too, called with an instance:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

const TodoFilters = Schema.Struct({
  done: Schema.optional(Schema.Boolean),
  since: Schema.optional(Schema.Date),
  pageSize: Schema.optional(Schema.Finite),
}).pipe(Schema.encodeKeys({ pageSize: "page_size" }));

export const listTodos = Fetch.endpoint("GET /todos", {
  query: TodoFilters,
  output: Schema.Array(Todo),
});

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
}) {}

export const program = Effect.gen(function* () {
  const api = yield* Api;
  const list = api.bind(listTodos);
  // GET /todos?done=false&since=2026-01-01T00%3A00%3A00.000Z&page_size=20
  return yield* list({
    query: { done: false, since: new Date("2026-01-01"), pageSize: 20 },
  });
});
```

- Each field is encoded to a string: a `Date` to its ISO string, a boolean to
  `"true"` or `"false"`, a number to its digits. An array repeats the key.
- Rename keys with `Schema.encodeKeys`, as above.
- A field you leave out isn't sent, but a `null` is sent as the string
  `"null"`, so prefer optional fields to nullable ones.
- A `Schema.Redacted` field is sent as its value and, with Effect 4.1 or
  later, stays redacted in Effect's logs and traces.
- A query that doesn't match the schema, or a field that encodes to an
  object, is a bug, not an error to handle: the call dies before anything is
  sent. See [Bugs are defects](#bugs-are-defects).
- A schema with a field that has no string encoding, such as
  `Schema.instanceOf(Uint8Array)`, throws when the endpoint is defined.

The schema is the endpoint's `query` property. `client.bind`,
`client.bindAll` and `Fetch.Endpoints` keep it, and `api.endpoint` takes one
too.

### Building an endpoint's URL

`endpoint.url(options)` returns the URL a call with the same `params` and
`query` would go to, as a string, for a link, an `<img>` source, or a cache
key:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

const getFile = Fetch.endpoint("GET /files/:name", {
  query: Schema.Struct({ download: Schema.optional(Schema.Boolean) }),
});

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
}) {}

// "/files/report.pdf?download=true"
export const path = getFile.url({
  params: { name: "report.pdf" },
  query: { download: true },
});

export const link = Effect.gen(function* () {
  const api = yield* Api;
  // "https://api.example.com/files/report.pdf?download=true"
  return api.bind(getFile).url({
    params: { name: "report.pdf" },
    query: { download: true },
  });
});
```

- On a bound endpoint, the URL starts with the client's `baseUrl`.
- On a definition from `Fetch.endpoint`, which has no client, it's the path
  alone, unless the route is a full URL. That makes it a stable cache key
  for one backend, whichever client calls it.
- The URL is built before plugins run, so anything a plugin adds, such as a
  token in the query, isn't in it.
- `url` throws when a path parameter is missing or the query doesn't match
  the schema, as a call would die. It encodes the query synchronously, so on
  an endpoint whose query schema needs services to encode, calling it doesn't
  compile.

### Defaults and overrides

- **Headers.** A call's headers win over the endpoint's, which win over the
  client's. A bound endpoint's headers are the binding's over the
  definition's. Unlike the client's, an endpoint's headers can set
  `content-type`.
- **Plugins.** A call's plugin override wins over the endpoint's (given when
  binding, or to `api.endpoint`), and when both give options, they're
  merged. An endpoint bound with `retry: false` can still be retried in one
  call with `plugins: { retry: { times: 2 } }`.
- **Schemas** belong to the endpoint, and can't be changed per call.

Each endpoint also has `route`, `method` and `path` properties, for log labels
or cache keys. Plugins see the same route, as
[`ctx.route`](#knowing-the-route). Its `output`, `error` and `input`
properties are its schemas, for things like decoding cached data or building
test fixtures: `output` and `input` are `undefined` when the endpoint has
none, and `error` is the schema error bodies are decoded with, the
endpoint's, else the client's `defaultError`, else `Schema.Unknown`.

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
- **Making or binding endpoints in code that runs on every request.** Do it
  once, when the layer that holds them is built, as `Fetch.Endpoints` does.
- **Passing a bound endpoint's plugin overrides at every call.** A definition
  can't hold them, since it doesn't know the client's plugins: give them once,
  when binding, as in `api.bind(login, { plugins: { bearer: false } })`.
- **Spreading several groups of endpoints into one object.** When two use the
  same name, the later one silently wins. Nest them instead:
  `{ users, todos }`, or give each group its own `Fetch.Endpoints` class.

## Streaming responses

Some APIs send their answer a piece at a time: progress feeds,
notifications, exports, the answers of language models. `api.sse` and
`api.ndjson` give such a body as an Effect `Stream`, one value at a time,
as it arrives.

### Server-Sent Events

`api.sse` reads a `text/event-stream` body. Each value is an event, with
its `event` name (`"message"` when the server sends none), its `id`, and its
`data`, decoded with `output`:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import type { Fetch } from "@monarcode/effetch";

declare const api: Fetch.Client;

const JobEvent = Schema.Struct({ percent: Schema.Finite });

export const followJob = (id: number) =>
  api.sse("/jobs/:id/events", { params: { id }, output: JobEvent }).pipe(
    Stream.takeUntil((event) => event.data.percent === 100),
    Stream.runForEach((event) => Effect.log(`${event.data.percent}%`)),
  );
```

- `output` decodes each event's `data` as JSON. Without it, or with
  `Fetch.text()`, `data` is the text as it was sent.
- `method` defaults to `"GET"`. APIs that stream the answer to a request
  take `"POST"` and a `body`:

  ```ts
  import * as Schema from "effect/Schema";

  import type { Fetch } from "@monarcode/effetch";

  declare const api: Fetch.Client;

  const Prompt = Schema.Struct({ prompt: Schema.String });
  const Delta = Schema.Struct({ text: Schema.String });

  export const complete = (prompt: string) =>
    api.sse("/completions", {
      method: "POST",
      input: Prompt,
      body: { prompt },
      output: Delta,
    });
  ```

- The request sends `Accept: text/event-stream`, unless the call or the
  client sets an `accept` header.
- Events are parsed by the [WHATWG rules][sse-spec]: comment lines are
  ignored, a multi-line `data` is joined with `\n`, and an `id` carries over
  to the events after it. The stream doesn't reconnect, and ignores
  `retry:` lines.
- A response whose `Content-Type` is set to another type than
  `text/event-stream`, such as a login page from a proxy, fails the stream
  with a `DecodeError`.

`output` decodes every event, so an event whose data doesn't match it
fails the stream, after the events before it. When the server ends with a
sentinel that isn't JSON, such as `data: [DONE]`, leave `output` out, stop
at the sentinel, then decode the rest:

```ts
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import type { Fetch } from "@monarcode/effetch";

declare const api: Fetch.Client;

const Delta = Schema.fromJsonString(Schema.Struct({ text: Schema.String }));

export const deltas = (prompt: string) =>
  api.sse("/completions", { method: "POST", body: { prompt } }).pipe(
    Stream.takeWhile((event) => event.data !== "[DONE]"),
    Stream.mapEffect((event) => Schema.decodeUnknownEffect(Delta)(event.data)),
  );
```

`api.sse` parses events with Effect's `encoding/Sse` module, which Effect
marks unstable.

[sse-spec]: https://html.spec.whatwg.org/multipage/server-sent-events.html

### Newline-delimited JSON

`api.ndjson` reads an `application/x-ndjson` body (also called JSON Lines):
one JSON value per line, decoded with `output`:

```ts
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import type { Fetch } from "@monarcode/effetch";

declare const api: Fetch.Client;

const Row = Schema.Struct({ id: Schema.Finite, email: Schema.String });

export const countRows = api
  .ndjson("/export/users", { output: Row })
  .pipe(Stream.runCount);
```

- Without `output`, each value is the parsed JSON, typed `unknown`.
  `Fetch.text()` gives each line's text instead.
- Blank lines are skipped, and the last line needs no line end.
- The request sends `Accept: application/x-ndjson`, unless an `accept`
  header is set.

### Stream endpoints

An endpoint defined with `stream: "sse"` or `stream: "ndjson"` returns a
`Stream` from its calls, however it's bound:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { Fetch } from "@monarcode/effetch";

const JobEvent = Schema.Struct({ percent: Schema.Finite });

const jobEvents = Fetch.endpoint("GET /jobs/:id/events", {
  output: JobEvent,
  stream: "sse",
});

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
}) {}

export class JobApi extends Fetch.Endpoints<JobApi>()("JobApi", Api, {
  events: jobEvents,
}) {}

export const lastEvent = (id: number) =>
  Effect.gen(function* () {
    const jobs = yield* JobApi;
    return yield* jobs.events({ params: { id } }).pipe(Stream.runLast);
  });
```

### How a stream fails

A stream's request runs as any call does, up to the response's headers:

- Plugins run once. `retry` and `timeout` apply to getting the response,
  not to reading the body.
- When no response arrives, the stream fails with a `NetworkError`.
- An error status fails it with an `HttpError`, or a
  [`statusErrors`](#errors-by-status) error, before it gives any value.
- A `204 No Content` or `205 Reset Content` gives an empty stream.

Then the body is read as it arrives. The values before a failure are given
first. A value that doesn't match `output`, or a body that breaks off,
fails the stream with a `DecodeError`, which names the event or the line:
`Line 3 doesn't match the output schema`.

For plugins, the call ends when the response's headers arrive. Their
`onExit` hooks, and so `logger` and `consoleLogger`, report it then, with
the time to the headers, and a `DecodeError` while reading the body doesn't
reach them. Handle it on the stream, with `Stream.catchTag("DecodeError", …)`
or `Stream.tapError`.

### Stopping a stream

Interrupting the stream, or taking only part of it, as with `Stream.take`,
aborts the request. Nothing else is needed to close the connection.

A stream can't take `responseMode`, or an `output` made with
`Fetch.bytes()`. A call that passes one dies, and a definition with one
throws when it's made.

## Pagination

Lists are often split into pages: you ask for the first, and the response
says how to get the next. `Fetch.paginate` follows those pages for you, as a
`Stream` of pages. It calls a bound endpoint for the first page, then for the
next one, until `next` says there's none:

```ts
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { Fetch } from "@monarcode/effetch";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

const listTodos = Fetch.endpoint("GET /todos", {
  query: Schema.Struct({ page: Schema.Finite }),
  output: Schema.Array(Todo),
});

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
}) {}

class TodoApi extends Fetch.Endpoints<TodoApi>()("TodoApi", Api, {
  list: listTodos,
}) {}

export const allTodos = Effect.gen(function* () {
  const todos = yield* TodoApi;
  return yield* Fetch.paginate(todos.list, {
    start: 1,
    request: (page) => ({ query: { page } }),
    next: (page, number) =>
      page.length === 0 ? Option.none() : Option.some(number + 1),
  }).pipe(Stream.flattenIterable, Stream.runCollect);
});
```

- `start` is the state of the first page, such as a page number or a
  cursor.
- `request(state)` gives the page's call options: `params`, `query`, `body`
  and `headers`, typed by the endpoint.
- `next(page, state, response)` gives the next page's state, or
  `Option.none()` after the last page.

Each page is one value of the stream, so a page that's a list stays a list.
`Stream.flattenIterable` gives its items one by one.

The stream is lazy: it sends a page's call only when the page is needed, so
`Stream.take(1)` sends one. A call that fails fails the stream with the
call's error.

`Fetch.paginate` takes a bound endpoint, from `Fetch.Endpoints`,
`client.bind`, `client.bindAll` or `client.endpoint`. A definition made by
`Fetch.endpoint` needs binding first, and a stream endpoint can't be paged.

### Cursors in headers

When the next page's cursor is in a header, such as a `Link` header, define
the endpoint with `responseMode: "decoded-and-response"`. `next` then gets
each page's response:

```ts
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

declare const api: Fetch.Client;

const Item = Schema.Struct({ id: Schema.Finite });

const listItems = Fetch.endpoint("GET /items", {
  output: Schema.Array(Item),
  responseMode: "decoded-and-response",
});

// The cursor is percent-encoded in the URL, and `query` encodes it again.
const nextCursor = (link: string | undefined) =>
  Option.fromNullishOr(
    /[?&]cursor=([^&>]+)[^>]*>;\s*rel="next"/.exec(link ?? "")?.[1],
  ).pipe(Option.flatMap(Option.liftThrowable(decodeURIComponent)));

export const allItems = Fetch.paginate(api.bind(listItems), {
  start: undefined as string | undefined,
  request: (cursor) => (cursor === undefined ? {} : { query: { cursor } }),
  next: (_items, _cursor, response) => nextCursor(response.headers.link),
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

import { Fetch } from "@monarcode/effetch";

export const apiVersion = Fetch.plugin({
  name: "apiVersion",
  defaults: { version: "2024-06-01" },
  onRequest: (request, ctx) =>
    Effect.succeed(
      HttpClientRequest.setHeader(request, "api-version", ctx.options.version),
    ),
});

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [apiVersion],
}) {}

export const program = Effect.gen(function* () {
  const api = yield* Api;
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
| `onExit(exit, ctx)`            | After every call, whatever the outcome, in array order, after `onError`. It can't change the outcome.                                        |
| `wrap(client, options, route)` | Wraps the plugins after it and the network, for retries, timeouts and the like. It can add errors but can't remove them.                     |

`ctx.request` is the request: in `onResponse`, the one this plugin passed on;
in `onError` and `onExit`, the one the call built.

`onExit` gets the call's `Exit`: its result (the decoded `output`, or the
response for a call without one), or the cause of its failure, defect or
interruption. Its `ctx` also has:

- `response`: the one the plugins returned; when a plugin failed after a
  response arrived, the last one the network sent; `undefined` when none
  arrived;
- `durationMs`: the time from sending the request to decoding the body,
  retries included.

It suits logging and metrics, and is what `consoleLogger` uses:

```ts
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { Fetch } from "@monarcode/effetch";

declare const record: (route: string, ok: boolean, durationMs: number) => void;

export const metrics = Fetch.plugin({
  name: "metrics",
  onExit: (exit, ctx) =>
    Effect.sync(() => record(ctx.route, Exit.isSuccess(exit), ctx.durationMs)),
});
```

The call returns once every `onExit` hook is done, so keep them quick, and
fork anything slow.

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

import { Fetch } from "@monarcode/effetch";

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
sign out and fail with a typed `SessionExpired`. To renew the token instead,
see [Refreshing a token](#refreshing-a-token).

```ts
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { Fetch } from "@monarcode/effetch";

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

// Api.layer now needs Session; calls fail with SessionExpired too.
export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [auth],
}) {}
```

### Example: a deadline with its own error

A `wrap` that adds its own error, with an option calls can override:

```ts
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";

import { Fetch } from "@monarcode/effetch";

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

- Services a plugin needs are required once, by the client's layer (or by
  `Fetch.make`). Calls don't need them. Services provided around a call win
  over those the client was built with.
- Plugin names must be unique.
- Write `wrap` bodies with `Effect.gen`. A ternary that returns two different
  Effects can't be typed.
- Pass plugin lists inline, or let TypeScript infer them. Annotating a list as
  `Fetch.Plugin.Any[]` erases the plugins' types.

## Structuring an app

A client is declared once, and endpoints are bound to it once, in a layer.
Where each piece lives depends on the size of your app. These are patterns,
not rules: Effetch works the same way whichever you pick.

### A small app

Keep the client in one file, and each area's endpoints in its own file, as a
`Fetch.Endpoints` class. One layer puts them together:

```ts
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { bearer } from "@monarcode/effetch/plugins";

const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });
const NewUser = Schema.Struct({ name: Schema.String });
const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

// api.ts
export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [bearer({ token: "token" })],
}) {}

// users.ts
export class Users extends Fetch.Endpoints<Users>()("Users", Api, {
  get: Fetch.endpoint("GET /users/:id", { output: User }),
  create: Fetch.endpoint("POST /users", { input: NewUser, output: User }),
  login: [
    Fetch.endpoint("POST /auth/login", { output: User }),
    { plugins: { bearer: false } },
  ],
}) {}

// todos.ts
export class Todos extends Fetch.Endpoints<Todos>()("Todos", Api, {
  list: Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) }),
}) {}

// layer.ts
export const AppLayer = Layer.mergeAll(Users.layer, Todos.layer).pipe(
  Layer.provideMerge(Api.layer),
  Layer.provide(FetchHttpClient.layer),
);

// anywhere
export const program = Effect.gen(function* () {
  const users = yield* Users;
  const api = yield* Api; // for one-off calls
  const user = yield* users.get({ params: { id: 1 } });
  yield* api.post("/users/:id/ping", { params: { id: user.id } });
  return user;
});
```

The plugin override on `login` is checked against `Api`'s plugins, and every
endpoint's errors are typed with `Api`'s `defaultError` and `statusErrors`.

To make endpoints with `client.endpoint` instead, write each area as a
function of the client, typed `Effect.Success<typeof Api>`, so overrides and
errors are still checked against your plugins and `defaultError`:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { bearer } from "@monarcode/effetch/plugins";

const User = Schema.Struct({ id: Schema.Finite, name: Schema.String });

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
  plugins: [bearer({ token: "token" })],
}) {}

export const users = (api: Effect.Success<typeof Api>) => ({
  get: api.endpoint("GET /users/:id", { output: User }),
  login: api.endpoint("POST /auth/login", {
    output: User,
    plugins: { bearer: false },
  }),
});
```

### A feature-sliced app

When your app is split into feature modules, each with its own schemas, the
client becomes shared infrastructure that knows nothing about the modules.
Each module defines its endpoints next to its schemas, with no client, and
binds them to the client in its data layer:

```text
src/
├── infrastructure/http/
│   └── app-api-client.ts  the client: base URL, error body, plugins
├── modules/
│   ├── todos/
│   │   ├── contract/      schemas, and endpoints defined with Fetch.endpoint
│   │   ├── data/          the endpoints, bound to AppApiClient
│   │   ├── application/   workflows that take more than one call
│   │   └── public.ts
│   └── wallet/
└── runtime.ts             modules, on top of clients, on top of HttpClient
```

> **This layout is a personal preference,** the one Effetch's author uses in
> their own apps, and Effetch doesn't depend on it. Rename, merge or split the
> folders to suit your project. What carries over is that modules import the
> client, never the other way around, and that endpoints are bound once, in a
> layer.

```ts
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

// infrastructure/http/app-api-client.ts: how to reach the backend, nothing else
export class AppApiClient extends Fetch.Service<AppApiClient>()(
  "AppApiClient",
  { baseUrl: Config.String("APP_API_URL") },
) {}

// modules/todos/contract/todos.ts: schemas and endpoints, no client
const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const NewTodo = Schema.Struct({ title: Schema.String });

export const listTodos = Fetch.endpoint("GET /todos", {
  output: Schema.Array(Todo),
});
export const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
export const createTodo = Fetch.endpoint("POST /todos", {
  input: NewTodo,
  output: Todo,
});

// modules/todos/data/todo.api.ts: the endpoints, bound, as the module's service
export class TodoApi extends Fetch.Endpoints<TodoApi>()(
  "TodoApi",
  AppApiClient,
  {
    list: listTodos,
    get: getTodo,
    create: createTodo,
  },
) {}

// runtime.ts
export const AppLayer = TodoApi.layer.pipe(
  Layer.provideMerge(AppApiClient.layer),
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
- **A module with 20 endpoints has 20 definitions** in its own `contract/`
  folder, beside their schemas, and 20 one-line entries in its
  `Fetch.Endpoints` class in `data/`. When they serve separate concerns,
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

`client.endpoint` fits this layout too: make the endpoints in `data/`, and
import only the schemas from `contract/`. Define them with `Fetch.endpoint`
when something should read the routes and schemas without a client.
[`examples/app`](examples/app) is a complete app in this layout, with two
modules and two backends: `todos` declares its definitions with
`Fetch.Endpoints`, and `wallet` uses `client.endpoint`.

### Several backends

Declare one client per backend, each with its own id, `baseUrl`,
`defaultError` and plugins. Each module uses the client of the backend it
talks to, and one `HttpClient` layer serves them all.

- Plugins are values: one `bearer` can serve several clients.
- `ctx.route` has no host. A plugin that groups by route and is shared by
  several clients should take the backend's name, so each client gets its own
  instance.
- Catch a backend's `HttpError` next to its calls, where `body` has that
  backend's error shape.

[`examples/backends.ts`](examples/backends.ts) does this in one file, and
[`examples/app`](examples/app) across modules.

## Testing

Effetch never touches the network itself: it sends every request through the
`HttpClient` you provide. In tests, `@monarcode/effetch/test` gives you a fake
one, made from your endpoints, so your code runs as it does in production:
the real client, with its plugins, `defaultError` and `statusErrors`.

### A fake backend from your endpoints

`FetchTest.layer` takes a list of handlers, one per route, and is an
`HttpClient` layer. Provide it where `FetchHttpClient.layer` goes. A client
whose `layer` is [overridden](#providing-the-client) to provide its own
`HttpClient` ignores it, so test with a layer that doesn't:

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { FetchTest } from "@monarcode/effetch/test";

const Todo = Schema.Struct({
  id: Schema.Finite,
  title: Schema.String,
  due: Schema.Date,
});
const NewTodo = Schema.Struct({ title: Schema.String, due: Schema.Date });

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
  message: Schema.String,
}) {}

const getTodo = Fetch.endpoint("GET /todos/:id", {
  output: Todo,
  statusErrors: { 404: TodoNotFound },
});
const createTodo = Fetch.endpoint("POST /todos", {
  input: NewTodo,
  output: Todo,
});
const listTodos = Fetch.endpoint("GET /todos", { output: Schema.Array(Todo) });

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.test",
}) {}

class TodoApi extends Fetch.Endpoints<TodoApi>()("TodoApi", Api, {
  get: getTodo,
  create: createTodo,
  list: listTodos,
}) {}

const Backend = FetchTest.layer([
  FetchTest.respond(getTodo, ({ params }) =>
    // params are strings, as they are in the URL
    Effect.succeed({
      id: Number(params.id),
      title: "Write docs",
      due: new Date(0),
    }),
  ),
  FetchTest.respond(createTodo, ({ body }) =>
    Effect.succeed({ id: 2, ...body }),
  ),
  FetchTest.fail(listTodos, 503),
]);

const TestLayer = TodoApi.layer.pipe(
  Layer.provide(Api.layer),
  Layer.provide(Backend),
);

export const test = Effect.gen(function* () {
  const todos = yield* TodoApi;
  const todo = yield* todos.get({ params: { id: 1 } });
  // todo.due is a Date again: it went over the wire as a string
  return todo;
}).pipe(Effect.provide(TestLayer));
```

What a handler gets and returns is typed by its endpoint, and checked as a
real backend would check it:

- **`params`** has the route's params, as strings.
- **`body`** is decoded with the endpoint's `input` schema, so `body.due` is a
  `Date` here. A [multipart](#uploading-files) body is read back from the
  form, with its files as `File`s.
- **`query`** is decoded with the endpoint's
  [query schema](#typed-query-parameters), if it has one, and is the raw
  query, as strings, otherwise.
- **The result** has `output`'s type, and is encoded with `output` before
  it's sent, so a `Date` goes over the wire as a string, as in production.
  With [`Fetch.text()` or `Fetch.bytes()`](#text-and-bytes), it's sent as
  text or bytes.

A body, query or result that doesn't match its schema is a defect that names
the route: it's a bug in the code under test, or in the test. Handlers work
the same for definitions made with `Fetch.endpoint`, endpoints made with
`client.endpoint` or `client.bind`, and a `Fetch.Endpoints` class's
`definitions`.

`FetchTest` doesn't depend on a test runner: a test is an Effect, so run it
with `it.effect` from `@effect/vitest`, or with `Effect.runPromise` in Jest,
Bun or Deno.

### Errors and other statuses

To answer every request to an endpoint with an error, use `FetchTest.fail`,
with a status and an optional body. The body is encoded with the endpoint's
`statusErrors` schema for that status, then its `error` schema, so the client
decodes it back into your domain error:

```ts
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { FetchTest } from "@monarcode/effetch/test";

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
  message: Schema.String,
}) {}

const getTodo = Fetch.endpoint("GET /todos/:id", {
  statusErrors: { 404: TodoNotFound },
});

export const Backend = FetchTest.layer([
  // The call fails with a TodoNotFound.
  FetchTest.fail(getTodo, 404, new TodoNotFound({ message: "No todo 9" })),
]);
```

A handler answers with another status by returning `FetchTest.reply(status,
body)`, such as a `404` for one id and the todo for the others. A reply's body
is sent as it is, as a call's `body` without `input` is: no body, a string
as text, bytes as bytes, a `Blob`, `FormData` or `URLSearchParams` as it is,
and anything else as JSON. For a `2xx` with a typed body, such as a `201`, pass
`{ status: 201 }` as `respond`'s third argument instead:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { FetchTest } from "@monarcode/effetch/test";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });
const getTodo = Fetch.endpoint("GET /todos/:id", { output: Todo });
const createTodo = Fetch.endpoint("POST /todos", {
  input: Schema.Struct({ title: Schema.String }),
  output: Todo,
});

export const Backend = FetchTest.layer([
  FetchTest.respond(getTodo, ({ params }) =>
    Effect.succeed(
      params.id === "1"
        ? { id: 1, title: "Write docs" }
        : FetchTest.reply(404, { message: `No todo ${params.id}` }),
    ),
  ),
  FetchTest.respond(
    createTodo,
    ({ body }) => Effect.succeed({ id: 2, ...body }),
    {
      status: 201,
      headers: { location: "/todos/2" },
    },
  ),
]);
```

### Stream endpoints in tests

A handler for a [stream endpoint](#stream-endpoints) returns a list, and
`FetchTest` sends it as the stream's body: events for `stream: "sse"`, each
with its `data` and an optional `event` and `id`, and values for
`stream: "ndjson"`. Each value is encoded with the endpoint's `output`:

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { FetchTest } from "@monarcode/effetch/test";

const JobEvent = Schema.Struct({ percent: Schema.Finite });

const jobEvents = Fetch.endpoint("GET /jobs/:id/events", {
  output: JobEvent,
  stream: "sse",
});

export const Backend = FetchTest.layer([
  FetchTest.respond(jobEvents, ({ params }) =>
    Effect.succeed([
      { data: { percent: 50 } },
      { event: "done", id: params.id, data: { percent: 100 } },
    ]),
  ),
]);
```

The whole body is sent at once. To test how your code handles values that
arrive slowly, or a body that breaks off, use
[a hand-written `HttpClient`](#a-hand-written-httpclient) whose `Response`
has a `ReadableStream` body.

### Checking what was sent

The layer also provides `FetchTest.Recorder`, which keeps every request it
received, with a new record each time the layer is built.
`FetchTest.requests` reads it. Under a client's layer, `Layer.provide` would
hide it, so use `Layer.provideMerge`:

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Fetch } from "@monarcode/effetch";
import { FetchTest } from "@monarcode/effetch/test";

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.test",
}) {}

const deleteTodo = Fetch.endpoint("DELETE /todos/:id");

const Backend = FetchTest.layer([
  FetchTest.respond(deleteTodo, () => Effect.void),
]);

export const test = Effect.gen(function* () {
  const api = yield* Api;
  yield* api.bind(deleteTodo)({ params: { id: 1 } });
  const [sent] = yield* FetchTest.requests;
  // sent.method: "DELETE", sent.url: "https://api.test/todos/1",
  // sent.route: "DELETE /todos/:id", sent.params: { id: "1" }
  return sent;
}).pipe(Effect.provide(Api.layer.pipe(Layer.provideMerge(Backend))));
```

Each recorded request has its `method`, `url`, the `route` and `params` it
matched, its raw `query`, its `headers`, and its `body`, read back as JSON,
text or bytes.

### How requests are matched

- **Method and path.** A route matches a request with the same method, whose
  path ends with the route's path. So `GET /todos/:id` answers
  `https://api.test/v1/todos/1`, whatever the client's `baseUrl`. To match
  the whole URL instead, pass the `baseUrl` to the layer:
  `FetchTest.layer(handlers, { baseUrl: "https://api.test/v1" })`.
- **The root route,** `GET /`, matches the path `/` alone, since every path
  with a trailing slash ends with it. Under a `baseUrl` with a path, pass
  that `baseUrl` to the layer.
- **The best match wins.** When several routes match, the one with the most
  segments wins, then the one with the most literal segments, so
  `GET /todos/count` wins over `GET /todos/:id`. After that, the one listed
  first wins.
- **Absolute routes** such as `POST https://uploads.example.com/files` match
  that URL only.
- **No match is a defect,** whose message lists the backend's routes, and the
  ones that match the path with another method:

  ```text
  FetchTest: no handler for POST https://api.test/todos/1.
  GET /todos/:id matches its path, but not its method.
  The handlers are:
    - GET /todos/:id
  ```

A handler can use services, such as a clock or a store of fake data. The
layer then needs them, and runs its handlers with the services it was built
with, and those of the call they answer, which win when both have one.

### A hand-written HttpClient

For what a fake backend doesn't do, such as a network failure or a slow
response, provide an `HttpClient` of your own:

```ts
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

const Todo = Schema.Struct({ id: Schema.Finite, title: Schema.String });

class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.test",
}) {}

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
  const api = yield* Api;
  return yield* api.get("/todos/:id", { params: { id: 1 }, output: Todo });
});

const todo = await Effect.runPromise(
  program.pipe(Effect.provide(Api.layer.pipe(Layer.provide(TestHttpClient)))),
);
// todo: { id: 1, title: "Write docs" }; sent: ["GET https://api.test/todos/1"]
```

## Platform notes

Effetch has no platform-specific imports or builds, and runs wherever Effect's
`HttpClient` does: browsers, React Native, Node 20 or newer, Bun and Deno.
Two platforms need a little setup.

### Browsers

Effect's `HttpClient` adds `traceparent` and `b3` tracing headers to every
request. Cross-origin calls to APIs that don't allow those headers then fail
the CORS preflight. Turn propagation off in the layer that makes the client,
and it applies to all its calls:

```ts
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";

import { Fetch } from "@monarcode/effetch";

export class Api extends Fetch.Service<Api>()("Api", {
  baseUrl: "https://api.example.com",
}) {}

export const ApiLive = Api.layer.pipe(
  Layer.provide(Layer.succeed(HttpClient.TracerPropagationEnabled)(false)),
  Layer.provide(FetchHttpClient.layer),
);
```

In a browser, a relative path without a `baseUrl` is resolved against the
page's URL.

### React Native

- Effetch doesn't use `URL` itself. Effect's `HttpClient` does, including
  `searchParams`. Expo provides a standard `URL`. In a React Native app
  without Expo, install a polyfill such as `react-native-url-polyfill`.
- Effetch and Effect use package `exports` (`effect/http/HttpClient`,
  `@monarcode/effetch/plugins`). Metro resolves them by default from React
  Native 0.79 (Expo SDK 53). On older versions, set
  `resolver.unstable_enablePackageExports = true` in `metro.config.js`.
- `FetchHttpClient.layer` uses the global `fetch`.
- React Native's `fetch` doesn't stream response bodies, so `api.sse`,
  `api.ndjson` and stream endpoints fail with a `DecodeError` there. In
  Expo, provide the `fetch` from `expo/fetch`, which streams, as
  `FetchHttpClient.Fetch`:
  `Layer.succeed(FetchHttpClient.Fetch)(expoFetch as typeof globalThis.fetch)`.
- To upload a file a picker gave you, send its `{ uri, name, type }` in a
  `Fetch.UploadFile` field (see [Uploading files](#uploading-files)). React
  Native's `FormData` reads the file from disk by `uri`, and can't send a
  `Blob`.
- Metro's terminal drops `console.groupCollapsed` and everything inside it,
  so `consoleLogger` doesn't collapse its groups in React Native (see the
  details under [Console logging](#console-logging)).

## Coming from axios or ky

The following table maps what you know from axios and ky to Effetch:

| axios or ky                                                   | Effetch                                                                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `axios.create`, `ky.create`                                   | [`Fetch.Service`](#declaring-a-client), or [`Fetch.make`](#fetchservice-or-fetchmake) in a script                                         |
| `ky.extend`, a client per API version                         | A second `Fetch.Service` from `{ ...Api.config, baseUrl }` (see [A client from another](#a-client-from-another))                          |
| `baseURL`, `prefixUrl`                                        | `baseUrl`, a string or an Effect such as a `Config`                                                                                       |
| `params`, `searchParams`                                      | `query`, a plain object, or typed by an endpoint's [`query` schema](#typed-query-parameters)                                              |
| Interceptors, `hooks.beforeRequest` and `hooks.afterResponse` | A [plugin](#writing-plugins)'s `onRequest` and `onResponse`                                                                               |
| `hooks.beforeError`                                           | `Effect.mapError` on the call. A plugin's `onError` sees errors but can't change them                                                     |
| `retry`, `timeout`                                            | The [`retry` and `timeout` plugins](#built-in-plugins), which a call can turn off or adjust                                               |
| ky's `totalTimeout`                                           | `retry({ budget })`, or `Effect.timeout` around a call                                                                                    |
| `AbortController`, `signal`                                   | Interruption: `Fiber.interrupt`, `Effect.race`, `Effect.timeout`. An interrupted call aborts its request                                  |
| `validateStatus`, `throwHttpErrors: false`                    | `Effect.catchTag("HttpError", …)`, [`statusErrors`](#errors-by-status), or [`Fetch.catchStatus`](#catching-a-status) and `Fetch.optional` |
| `error.response.data`, ky's `HTTPError` body                  | `HttpError.body`, decoded with `defaultError` or the call's `error` schema                                                                |
| `ky.get(url).json<T>()`, `axios.get<T>(url)`                  | `api.get(path, { output: Schema })`: the body is checked, not cast                                                                        |
| `responseType: "text"` or `"arraybuffer"`                     | `output: Fetch.text()` or `Fetch.bytes()` (see [Text and bytes](#text-and-bytes))                                                         |
| Reading the status and headers with the data                  | `responseMode: "decoded-and-response"` (see [The body and the response](#the-body-and-the-response))                                      |
| `responseType: "stream"`, `onDownloadProgress` for events     | [`api.sse` and `api.ndjson`](#streaming-responses)                                                                                        |
| A `FormData` body built by hand                               | `input: Fetch.multipart(schema)`, a typed body sent as a form (see [Uploading files](#uploading-files))                                   |
| The `fetch` option or an `adapter` in tests                   | [`FetchTest`](#testing), or any `HttpClient` layer                                                                                        |

## Reference

### Limitations

- A path parameter is a whole segment: `/files/:name.json` has one parameter
  called `name.json`.
- Path parameters can't be optional. Define one endpoint per path, or pass
  the value in `query`.
- Paths shouldn't contain `?` or `#`. Pass query parameters with `query`.
- `timeout`, and the duration `logger` logs, cover the time until the
  response headers arrive, not downloading the body. `consoleLogger`'s
  duration, and an `onExit` hook's `durationMs`, include decoding the body.
- Two plugins with the same name are only caught when the client is made.
- Streams don't reconnect: `api.sse` ignores `retry:` lines and the
  `Last-Event-ID` header. Repeat the call, with the last `id` in a header,
  to pick up where a stream stopped.
- For a stream, plugins see the call end when the response's headers
  arrive: they don't see the body being read, or a `DecodeError` while
  reading it, and `timeout` doesn't bound it.

### API

Every export is documented, with an example, in the type declarations your
editor shows. This list says where each one is covered here.

`@monarcode/effetch`, as the `Fetch` namespace:

- `Service`, `ServiceClass` (and `ServiceClass.Any`), `isService`:
  [declaring a client](#declaring-a-client).
- `make`, `ClientConfig`, `Client`: [setting up a client](#setting-up-a-client)
  and [making calls](#making-calls).
- `endpoint`, `UnboundEndpoint`, `UnboundDefinition`, `AnyUnboundEndpoint`:
  [defining endpoints](#defining-endpoints).
- `Endpoints`, `EndpointsClass`:
  [sharing endpoints as a service](#sharing-endpoints-as-a-service).
- `BindMethod`, `BindOptions`, `BindAllMethod`, `EndpointDefinitions`,
  `EndpointEntry`, `BoundEndpoint`, `BoundEndpoints`:
  [other ways to bind endpoints](#other-ways-to-bind-endpoints).
- `Endpoint`, `EndpointMethod`, `EndpointDefinition`, `EndpointOptions`,
  `EndpointBody`, `EndpointArgs`, `EndpointRoute`, `ValidRoute`,
  `RouteMethod`, `RoutePath`: [endpoints](#endpoints).
- `QuerySchema`, `EndpointQuery`:
  [typed query parameters](#typed-query-parameters).
- `EndpointUrlOptions`, `EndpointUrlArgs`:
  [building an endpoint's URL](#building-an-endpoints-url).
- `multipart`, `UploadFile`, `UploadFileSchema`, `NativeFile`,
  `MultipartSchema`, `MultipartFields`, `MultipartValue`:
  [uploading files](#uploading-files).
- `text`, `bytes`, `TextSchema`, `BytesSchema`:
  [text and bytes](#text-and-bytes).
- `NetworkError`, `HttpError` (and `HttpError.With`), `DecodeError`,
  `FetchError`, `isFetchError`: [errors](#handling-errors).
- `StatusError`, `StatusErrorMap`, `StatusErrorSchema`,
  `StatusErrorServices`: [errors by status](#errors-by-status).
- `catchStatus`, `optional`, `CaughtStatus`:
  [catching a status](#catching-a-status).
- `SseEvent`, `StreamElement`, `StreamFormat`, `StreamMethod`,
  `StreamOptions`: [streaming responses](#streaming-responses).
- `paginate`, `PaginateOptions`, `PageEndpoint`, `PageRequest`, `PageOf`,
  `PageResponse`: [pagination](#pagination).
- `plugin`, `Plugin` (and the `Plugin.*` helper types), `PluginContext`,
  `PluginExitContext`:
  [writing plugins](#writing-plugins).
- Option and result types, for wrapping the client in your own functions:
  `RequestOptions`, `NoBodyRequestOptions`, `BaseOptions`, `BodyOptions`,
  `ParamsOption`, `QueryInput`, `QueryOf`, `QueryValue`, `AnySchema`,
  `Args`, `Success`, `ResponseMode`, `CallError`, `CallServices`,
  `CallEffect`,
  `NoBodyMethod`, `BodyMethod`, `RequestMethod`, `PathParamNames`,
  `PathParams`, `PathParamValue`. `CallEffect` types a function that
  returns a call; to take a call as an argument, accept any
  `Effect.Effect<A, E, R>`.

`@monarcode/effetch/plugins` ([plugins](#plugins)):

- `bearer`, `BearerOptions`, `BearerPlugin`, `TokenSource`, `TokenValue`,
  `RefreshSource`.
- `logger`, `LoggerOptions`, `LoggerPlugin`.
- `consoleLogger`, `ConsoleLoggerOptions`, `ConsoleLoggerSettings`,
  `ConsoleLoggerPlugin`, `ConsoleLoggerDetail`, `ConsoleLoggerRedact`,
  `ConsoleLoggerCall`, `ConsoleLoggerColor`.
- `retry`, `RetryOptions`, `RetryPlugin`, `RetryBudgetOptions`,
  `RetryBudgetPlugin`.
- `timeout`, `TimeoutOptions`, `TimeoutPlugin`, `TimeoutError`.

`@monarcode/effetch/test`, as the `FetchTest` namespace
([testing](#testing)):

- `layer`, `LayerOptions`, `Handler`, `HandlerServices`.
- `respond`, `RespondRequest`, `RespondResult`, `TestEvent`, `RespondOptions`,
  `RespondServices`, `RouteParams`, `RequestBody`, `RequestQuery`,
  `QueryParams`, `TestEndpoint`.
- `reply`, `Reply`, `ReplyOptions`.
- `fail`, `FailBody`, `FailServices`.
- `requests`, `Recorder`, `SentRequest`.

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
