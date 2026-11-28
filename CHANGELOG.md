# Changelog

All notable changes to `@monarcode/effetch`, newest first.

## Unreleased

### Changed

- The documentation site moved to https://effetch.monarcode.dev. The old
  address, https://effetch.pages.dev, still serves it.
- CI now runs the installed package on Node.js 20 and 22, Bun 1 and Deno 2,
  compiles it with TypeScript 5.7 (the oldest supported) and 7, and runs the
  tests against the newest Effect 4.x. The
  [Compatibility](https://effetch.monarcode.dev/docs/reference/compatibility)
  page lists what each job covers.

## 0.1.0-rc.5

### Added

- Documentation site at [effetch.pages.dev/docs](https://effetch.pages.dev/docs),
  with a page for each guide that was in the README, and search. The
  package's `homepage` points to it.
- The site's examples show each name's type and docs on hover, and its
  [API reference](https://effetch.pages.dev/docs/reference) lists every
  export of `Fetch`, the plugins and `FetchTest`, with tables of the option
  types. A [Compatibility](https://effetch.pages.dev/docs/reference/compatibility)
  page lists the supported Effect versions, runtimes and TypeScript
  settings.
- Each page of the site is also served as Markdown, from the page's
  "Copy Markdown" button and its view options, and
  [llms.txt](https://effetch.pages.dev/llms.txt) and
  [llms-full.txt](https://effetch.pages.dev/llms-full.txt) list the pages
  for LLMs.
- Releases update the documentation site: the live docs show the newest
  release's API, and `main` deploys as a preview.

### Changed

- The README is now an overview: what Effetch is, how to install it, a
  quick start and links to the site's guides. The sections that earlier
  entries name, such as "Upgrading from 0.1.0-rc.3" and "Uploading files",
  are now [Upgrade from 0.1.0-rc.3](https://effetch.pages.dev/docs/upgrading)
  and [Upload files](https://effetch.pages.dev/docs/calls/uploads).
- Error messages for an endpoint passed to the wrong place no longer name
  the client `client` (as in `client.bind`). They say "bind" or "your
  client's endpoint or bind method", so they read the same whatever you
  name your client.
- A call without an `error` schema, on a client without a `defaultError`,
  now shows its error as `HttpError` rather than `HttpError.With<unknown>`:
  `Effect<Todo, NetworkError | DecodeError | HttpError>`. They're the same
  type, so values and assignments are unaffected. With a schema, the error
  is still `HttpError.With<…>`, typed by it, and `Schema.Any` still gives
  `HttpError.With<any>`. One thing can break: a
  function generic over the error schema, such as one that takes a
  `Fetch.CallEffect<O, EB, …>` with `EB` still a type parameter, can no
  longer use `Effect.catchTag("HttpError", …)` on it, because TypeScript
  can't tell which of the two the error is. Check `error._tag ===
  "HttpError"` instead, or type the parameter as any
  `Effect.Effect<A, E, R>`, as the `CallEffect` docs advise.

### Fixed

- The documented TypeScript requirement is 5.7 or newer, not 5.4. Effetch's
  declarations use typed arrays with a type argument, such as
  `Uint8Array<ArrayBuffer>`, which TypeScript 5.6 and older reject. With
  `skipLibCheck: true`, an older TypeScript compiles a project that uses
  Effetch, but some of its types become `any`.
- A plugin override can set an option to `undefined`, which keeps the
  option's default, with `exactOptionalPropertyTypes` on too. Calls already
  worked this way, but the type rejected it, so passing a value that may be
  missing, as in `plugins: { retry: { times: maybeTimes } }`, needed a
  cast.
- `Fetch.paginate` ignores a `plugins` key returned from `request`, as its
  type always said. The key reached each page's call, unchecked, so an
  unknown plugin name or a wrong option went unnoticed. Give plugin
  overrides when you bind the endpoint, and every page's call uses them.
  `PageRequest`'s `plugins` key says so in its hover.
- A literal value returned from `Fetch.paginate`'s `request` keeps its
  type, so a query field typed `"asc" | "desc"` accepts `"asc"`. It was
  widened to `string`, which failed to compile.

## 0.1.0-rc.4

### Changed

- **Breaking:** the main entry now has one export, the `Fetch` namespace,
  so you import it by name. Change the import line in each file; uses
  such as `Fetch.endpoint` and `Fetch.Client` stay the same:

  ```ts
  // Before
  import * as Fetch from "@monarcode/effetch";
  import type * as Fetch from "@monarcode/effetch";
  // After
  import { Fetch } from "@monarcode/effetch";
  import type { Fetch } from "@monarcode/effetch";
  ```

  A named import of a member, such as
  `import { HttpError, type Client } from "@monarcode/effetch"`, becomes
  `import { Fetch } from "@monarcode/effetch"`, with `Fetch.HttpError` and
  `Fetch.Client` where they're used.

  - `npx -p @monarcode/effetch effetch-migrate` (or
    `pnpm exec effetch-migrate`) makes these changes for you: run it in
    the package that depends on Effetch after upgrading, with
    `--dry-run` first to see the files it would change. It lists what it
    can't rewrite, such as a dynamic `import()`. See "Upgrading from
    0.1.0-rc.3" in the README.
  - Your editor can now add the import for you as you type `Fetch`.
  - Bundlers still drop what you don't use: an app that only calls
    `Fetch.make` doesn't bundle `Fetch.paginate` or `Fetch.Endpoints`.
  - New subpaths, `@monarcode/effetch/Fetch` and
    `@monarcode/effetch/test/FetchTest`, hold the same exports without the
    namespace. TypeScript uses them to name Effetch's types in the `.d.ts`
    files it emits for your code, which a namespace alone can't do.
  - The `/plugins` and `/test` entries are unchanged.

- A `content-type` header set by a call, an endpoint or the client is now
  removed for a `FormData` body, so the platform's multipart boundary is
  kept. Before, it replaced the boundary, and servers couldn't read the
  form.

### Added

- `Fetch.multipart(schema)` sends a typed body as `multipart/form-data`,
  for file uploads. Wrap an `input` schema in it: `body` is typed and
  checked by the schema, as for JSON, then sent as `FormData`. Before, an
  upload had no `input`, and its `FormData` was built by hand and untyped:

  ```ts
  const uploadDocument = Fetch.endpoint("POST /documents", {
    input: Fetch.multipart(
      Schema.Struct({ file: Fetch.UploadFile, kind: Schema.String }),
    ),
    output: Document,
  });
  // upload({ body: { file, kind: "PASSPORT" } })
  ```

  - Fields become form parts: strings as they are; numbers, booleans and
    bigints as strings; a `Date` as its ISO string; a file as a file part;
    a list as one part per item. `null` and `undefined` are left out.
  - A nested object or a list of lists can't be sent: TypeScript rejects
    most schemas that encode to one, and a value that does makes the call
    die.
    `Schema.fromJsonString` sends one as a string.
  - A body that doesn't match the schema dies with the same
    `Invalid request body:` defect as for JSON.
  - It works wherever `input` does: methods, `client.endpoint`,
    `Fetch.endpoint`, `api.sse` and `api.ndjson`. Endpoints without `input`,
    and `input` schemas without it, are sent as before.
  - `FetchTest` reads the form back into the handler's `body`, decoded with
    the schema, with files as `File`s. A form has no `null`, `undefined` or
    empty list, and every part is a string, so it reads some values back as
    best it can (see "Uploading files" in the README).
  - New types: `MultipartSchema`, `MultipartFields`, `MultipartValue`.

- `Fetch.UploadFile` is a schema for a file field of a multipart body. It
  takes a `Blob` or `File` in browsers, Node, Bun and Deno, and, in React
  Native, the `{ uri, name, type }` object its pickers give (new type:
  `NativeFile`), which React Native's `FormData` reads from disk by `uri`.
  React Native can't send a `Blob` in a form. New type: `UploadFileSchema`.
  - `uri` and `name` are required. `type` is optional, and a file without
    one is sent as `application/octet-stream`, since Android rejects a file
    part without a type.
  - A `NativeFile` sent outside React Native, or in a field that isn't an
    `UploadFile`, makes the call die, rather than send `"[object Object]"`.
  - In an `input` schema without `Fetch.multipart`, it makes the call die:
    a file has no JSON form.

## 0.1.0-rc.3

### Changed

- Code that passes `client.bind`'s type arguments explicitly needs two more,
  for the response mode and the query schema:
  `api.bind<R, O, EB, I, SE, M, QS>(definition)`, where `M` and `QS` are
  `undefined` for a definition without `responseMode` or `query`. Calls
  that let TypeScript infer them, the usual way, are unchanged. The two
  can't have defaults: with one, a definition written inline in the call
  loses its literal types.
- The message logged when a plugin's `onError` or `onExit` hook fails starts
  with `Effetch:` rather than `effetch:`.

### Added

- `Fetch.Service` declares a client as a service in one class, with its
  layer and its config. It takes the config `Fetch.make` takes. Before:

  ```ts
  const makeApi = Fetch.make({ baseUrl, defaultError: ApiError });

  class Api extends Context.Service<Api, Effect.Success<typeof makeApi>>()(
    "Api",
  ) {}

  const ApiLive = Layer.effect(Api)(makeApi);
  ```

  After:

  ```ts
  class Api extends Fetch.Service<Api>()("Api", {
    baseUrl,
    defaultError: ApiError,
  }) {}

  const ApiLive = Api.layer;
  ```

  - `yield* Api` gives the client, typed from the config, as before.
  - `Api.layer` builds the client with `Fetch.make`. It needs and fails
    with what `Fetch.make(config)` needs and fails with. Every layer that
    depends on it in one layer graph gets the same client.
  - `Api.config` is the config, readable when the module loads, before any
    layer is built. It's a frozen copy, down to its `statusErrors`,
    `plugins` and `headers`, and the layer builds the client from that
    copy, so changing the object you passed changes nothing. Its `headers`
    is an Effect `Headers` value, so an `authorization` header stays
    redacted when the config is logged.
  - To make `Api.layer` provide its `HttpClient` too, override it in the
    class:
    `static override readonly layer = super.layer.pipe(Layer.provide(FetchHttpClient.layer))`.
    An override can need less than `Api.layer`, but not more, and can't add
    an error.
  - `Fetch.isService` tells a class made by `Fetch.Service`, or a subclass
    of one, from any other value, including a `Context.Service` key.
  - New types: `ServiceClass` and `ServiceClass.Any`.
  - The config must be known when the module loads. A `baseUrl` Effect,
    such as a `Config`, is fine. A config that comes from an Effect still
    needs `Fetch.make` and a hand-written service, as before.
  - Spread `Api.config` into a second class for a related client, such as
    another API version: `{ ...Api.config, baseUrl }`. Its client has the
    same type.
  - `Fetch.make`, `Client` and `ClientConfig` are unchanged.

- `Fetch.Endpoints` declares a module's endpoints as a service, in one
  class, with its layer. It takes the service's id, the client's service
  and a record of definitions made with `Fetch.endpoint`. Before:

  ```ts
  const makeTodoApi = AppApiClient.useSync((client) => ({
    list: client.bind(listTodos),
    get: client.bind(getTodo),
  }));

  class TodoApi extends Context.Service<
    TodoApi,
    Effect.Success<typeof makeTodoApi>
  >()("TodoApi") {}

  const TodoApiLive = Layer.effect(TodoApi)(makeTodoApi);
  ```

  After:

  ```ts
  class TodoApi extends Fetch.Endpoints<TodoApi>()("TodoApi", AppApiClient, {
    list: listTodos,
    get: getTodo,
  }) {}

  const TodoApiLive = TodoApi.layer;
  ```

  - `yield* TodoApi` gives the endpoints, each typed as `client.bind`
    types it, with the client's plugins, `defaultError` and
    `statusErrors`.
  - `TodoApi.layer` binds the definitions once, when it's built, and needs
    the client's service. The client can be a `Fetch.Service` class or a
    service written by hand.
  - `TodoApi.definitions` is the record, frozen, readable when the module
    loads.
  - An entry can be a `[definition, options]` pair, with the options
    `client.bind` takes: `refresh: [refresh, { plugins: { bearer: false } }]`.

- `client.bindAll({ list, get })` binds a record of definitions at once,
  each under its name, as `client.bind` binds one. Pairs work as above, and
  their options are checked as `client.bind` checks them. An entry that
  isn't a definition throws, and `Fetch.Endpoints` checks its entries when
  the class is declared.

- New types: `EndpointsClass`, `EndpointDefinitions`, `EndpointEntry`,
  `BoundEndpoint`,
  `BoundEndpoints`, `BindAllMethod` and `AnyUnboundEndpoint`. `Client`
  gains the `bindAll` member.

- `@monarcode/effetch/test` is a new entry point, with `FetchTest`: a typed
  fake backend made from your endpoints, to test code that calls them
  without a network or a hand-written `HttpClient`. Before:

  ```ts
  const TestHttpClient = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      url.pathname === "/todos/1"
        ? Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({
                id: 1,
                title: "Write docs",
                due: "1970-01-01T00:00:00.000Z",
              }),
            ),
          )
        : Effect.die(new Error(`Unexpected ${request.method} ${url.href}`)),
    ),
  );
  ```

  After:

  ```ts
  import { FetchTest } from "@monarcode/effetch/test";

  const Backend = FetchTest.layer([
    FetchTest.respond(getTodo, ({ params }) =>
      Effect.succeed({
        id: Number(params.id),
        title: "Write docs",
        due: new Date(0),
      }),
    ),
    FetchTest.fail(listTodos, 503),
  ]);
  ```

  - `FetchTest.layer(handlers, options?)` is an `HttpClient` layer. Provide
    it where `FetchHttpClient.layer` goes, under the real client.
  - `FetchTest.respond(endpoint, handler, options?)` answers an endpoint's
    requests. The handler's `params`, `query` and `body` are typed by the
    endpoint, and decoded with its `input` and query schemas. Its result
    is typed by `output`, and encoded with it, so a `Date` goes over the
    wire as a string.
  - `FetchTest.reply(status, body?, options?)` answers with any status, as
    it is. `FetchTest.fail(endpoint, status, body?)` answers with an error,
    its body encoded with the endpoint's `statusErrors` or `error` schema,
    so the client decodes it into your domain error.
  - `FetchTest.requests` gives what the backend received. It needs
    `FetchTest.Recorder`, which the layer provides.
  - A route matches the end of a request's path, under any `baseUrl`, or
    the whole URL with `{ baseUrl }`. A request no route matches is a
    defect that lists the routes.
  - It doesn't depend on a test runner.

- `api.sse(path, options)` and `api.ndjson(path, options)` read a streamed
  body as an Effect `Stream`, one value at a time, as it arrives: the events
  of a Server-Sent Events body, or the lines of a newline-delimited JSON
  body. Before, streaming needed `api.httpClient` and your own parsing.

  ```ts
  api
    .sse("/jobs/:id/events", { params: { id }, output: JobEvent })
    .pipe(Stream.runForEach((event) => Effect.log(event.data.percent)));
  ```

  - `output` decodes each event's `data`, or each line. An SSE value is an
    `SseEvent`, with the event's `event`, `id` and `data`.
  - `method` defaults to `"GET"`. Pass `"POST"` with a `body` for APIs that
    stream the answer to a request.
  - The request runs as any call does, up to the response's headers:
    plugins, `retry`, `timeout`, and an error status that fails with an
    `HttpError` or a `statusErrors` error. A value that doesn't match
    `output`, or a body that breaks off, fails the stream with a
    `DecodeError`.
  - The values before a failure are given first. A `204` or `205` gives an
    empty stream, and `api.sse` fails when the `Content-Type` isn't
    `text/event-stream`.
  - For plugins, the call ends when the response's headers arrive: their
    `onExit` hooks, and `logger` and `consoleLogger`, don't see the body
    being read.
  - Interrupting the stream, or taking part of it, aborts the request.
  - `api.sse` uses Effect's `encoding/Sse` module, which Effect marks
    unstable.
  - New types: `SseEvent`, `StreamElement`, `StreamFormat`, `StreamMethod`,
    `StreamOptions`.

- `stream: "sse"` or `stream: "ndjson"` on an endpoint definition makes its
  calls return a `Stream`, from `client.endpoint`, `client.bind`,
  `client.bindAll` and `Fetch.Endpoints`. Endpoints have a `stream`
  property. `FetchTest.respond` answers a stream endpoint with a list of
  events or values (new type: `FetchTest.TestEvent`).

- `Fetch.paginate(endpoint, { start, request, next })` pages through a list
  as a lazy `Stream` of pages, calling a bound endpoint once per page:

  ```ts
  Fetch.paginate(api.bind(listTodos), {
    start: 1,
    request: (page) => ({ query: { page } }),
    next: (todos, page) =>
      todos.length === 0 ? Option.none() : Option.some(page + 1),
  });
  ```

  - With `responseMode: "decoded-and-response"` on the endpoint, `next`
    gets each page's response, for cursors in headers such as `Link`.
  - New types: `PaginateOptions`, `PageEndpoint`, `PageRequest`, `PageOf`,
    `PageResponse`.

- `responseMode: "decoded-and-response"` makes a call succeed with the
  decoded body and the response together, to read the status and headers,
  such as a total count or an `ETag`:

  ```ts
  Effect.gen(function* () {
    const [todos, response] = yield* api.get("/todos", {
      output: Schema.Array(Todo),
      responseMode: "decoded-and-response",
    });
  });
  ```

  - It's allowed on every method, on `client.endpoint` and `Fetch.endpoint`
    definitions, and on each call of an endpoint, where the call's own mode
    wins. `bind`, `bindAll` and `Fetch.Endpoints` keep a definition's mode.
  - Without `output`, both items are the response.
  - The default, `"decoded"`, gives the decoded body alone, as before.
  - New type: `ResponseMode`. `Success`, `CallEffect`, `BaseOptions`,
    `RequestOptions`, `NoBodyRequestOptions`, `Endpoint`,
    `EndpointDefinition`, `EndpointOptions`, `UnboundEndpoint` and
    `UnboundDefinition` gain a last type parameter for the mode, defaulted,
    and endpoints and definitions a `responseMode` property. See Changed
    for `client.bind`'s type arguments.
  - A plugin's `onExit` sees the pair as the call's result.

- `Fetch.text()` and `Fetch.bytes()` read a 2xx body as text or as a
  `Uint8Array`, for `output`. `Fetch.text(schema)` reads a single value: it
  trims the text and decodes it with a schema whose encoded side is a
  string, such as `Schema.NumberFromString`.
  - The call sends `Accept: text/*, */*;q=0.1` or `*/*`, unless one is set.
  - An empty body is `""`, or a `Uint8Array` of length 0. With
    `Fetch.text(schema)`, it fails, as for JSON.
  - Errors are `DecodeError`, as for JSON. Error responses are still read
    as JSON.
  - New types: `TextSchema` and `BytesSchema`.

- A `query` schema on an endpoint types each call's `query` and encodes it
  before it's sent:

  ```ts
  const listTodos = Fetch.endpoint("GET /todos", {
    query: Schema.Struct({
      done: Schema.optional(Schema.Boolean),
      since: Schema.optional(Schema.Date),
    }),
  });
  // list({ query: { done: true, since } }) → ?done=true&since=2026-…Z
  ```

  - The schema can be a `Schema.Struct`, or a `Schema.Class` called with an
    instance.
  - Each field is encoded to a string, as `Schema.toCodecStringTree`
    encodes it. Arrays repeat the key, fields left out aren't sent, and
    `Schema.encodeKeys` renames keys. A `Schema.Redacted` field is sent as
    its value and, with Effect 4.1 or later, stays redacted in logs and
    traces.
  - A schema with a field that has no string encoding throws when the
    endpoint is defined.
  - `query` is required on a call when the schema has required fields.
  - A query that doesn't match the schema, or a field that encodes to an
    object, makes the call die before anything is sent.
  - The schema's encoding services join the call's services.
    `CallServices` and `CallEffect` gain a last type parameter for the
    schema, defaulted.
  - It's allowed on `client.endpoint` and `Fetch.endpoint`. `bind`,
    `bindAll` and `Fetch.Endpoints` keep it, and endpoints and definitions
    gain a `query` property.
  - New types: `QuerySchema` and `EndpointQuery`. `Endpoint`,
    `EndpointDefinition`, `EndpointOptions`, `EndpointArgs`,
    `UnboundEndpoint` and `UnboundDefinition` gain a last type parameter
    for the schema, defaulted. See Changed for `client.bind`'s type
    arguments.

- `endpoint.url(options)` returns the URL a call with the same `params` and
  `query` goes to, for links and cache keys:
  `getFile.url({ params: { name: "a.pdf" } })`.
  - On a bound endpoint, it starts with the client's `baseUrl`. On a
    definition, it's the path alone, unless the route is a full URL.
  - It's built before plugins run.
  - It's made as the call's URL is, so `..` segments, a route's own query
    string and the host are normalized the same way.
  - It throws for a missing path parameter or a query that doesn't match
    the schema. On an endpoint whose query schema needs services to
    encode, calling it doesn't compile.
  - New types: `EndpointUrlOptions` and `EndpointUrlArgs`.

- `Fetch.catchStatus(status, handler)` handles an `HttpError` with one of
  the given statuses, data-last or data-first. The handler's `error.status`
  is narrowed to them. `HttpError` stays in the error type.

  ```ts
  api
    .get("/me")
    .pipe(Fetch.catchStatus([401, 403], () => Effect.succeed(null)));
  ```

- `Fetch.optional` succeeds with `Option.none()` on a `404` and
  `Option.some(value)` otherwise: `getTodo({ params: { id } }).pipe(Fetch.optional)`.
  - A status that `statusErrors` maps fails with your error, so neither
    sees it.
  - New type: `CaughtStatus`.

- `bearer({ refresh })` renews an expired token. When a request that
  `bearer` signed gets a `401`, it asks `refresh` for a new token and sends
  the request again with it, once:

  ```ts
  bearer({ token: () => tokens.access(), refresh: () => tokens.renew() });
  ```

  - `refresh` is a function of the refused request, sync or async, or an
    Effect, whose error and services become the client's.
  - Requests refused with the same token share one refresh, and its token
    or error. Requests refused with different tokens get their own. A
    caller that's interrupted doesn't cancel the refresh for the others.
  - When `refresh` gives `null`, `undefined` or `""`, or the new token is
    refused too, the call ends with the `401`.
  - Requests with their own `Authorization` header, sent without a token,
    with a stream body, or that skip `bearer` aren't refreshed. Make the
    refresh call itself skip `bearer`.
  - New type: `RefreshSource`. Without `refresh`, `bearer` is unchanged.

- `retry({ retryAfter })` waits as long as a retried response's
  `Retry-After` header asks, in seconds or as an HTTP date, in place of the
  schedule's delay. `true` waits up to 1 minute, and `{ max }` up to `max`.
  It's off by default.

- `retry({ budget })` limits the whole call, every attempt and wait
  included. A retry whose wait would end at or after the budget isn't made, and
  the call ends with its last response or `NetworkError`. When the budget
  runs out during an attempt, the call fails with `TimeoutError`. Calls can
  override it: `plugins: { retry: { budget: "2 minutes" } }`.
  - `retry` with a `budget` returns the new `RetryBudgetPlugin` type, which
    adds `TimeoutError`. New type: `RetryBudgetOptions`.
  - `retry` without a `budget` still returns `RetryPlugin`, with no errors.

### Documentation

- The README is rewritten around `Fetch.Service`, the recommended way to
  set up a client. Getting started declares a client as a service, and a
  new "Fetch.Service or Fetch.make?" section says when to use each.
  Endpoints start from `Fetch.endpoint` and `Fetch.Endpoints`, with
  `client.bind`, `client.bindAll` and `client.endpoint` as the other ways to
  bind them. Long lists of edge cases are folded into "Details" blocks.
- The README adds badges for bundle size (without `effect`), types,
  provenance and license, and for the runtimes Effetch targets.
- The README has new sections: "Providing the client", "Coming from axios or
  ky", which maps their options and hooks to Effetch; "A client from
  another"; "Streaming responses"; "Pagination"; and "Stream endpoints in
  tests". "Built-in plugins" says how to limit each attempt or the whole
  call, and the configuration table lists `statusErrors`.
- `examples/streams.ts` shows Server-Sent Events, newline-delimited JSON, an
  answer that ends with `[DONE]`, and a list paged by its `Link` header.
  `examples/basic.ts` handles its `404` with `Fetch.catchStatus`.
- `examples/endpoints.ts`, `examples/status-errors.ts` and
  `examples/backends.ts` declare their clients with `Fetch.Service` and their
  endpoints with `Fetch.Endpoints`, and the JSDoc examples declare clients
  with `Fetch.Service`. `Fetch.make`'s JSDoc says when to use it instead.
- The docs call the package Effetch. `effetch` stays the npm and repository
  name.

## 0.1.0-rc.2

### Added

- `statusErrors` turns error responses into your own errors. It maps an
  HTTP status to an error schema, usually a `Schema.TaggedError` class, or
  to a list of schemas tried in order:
  `statusErrors: { 404: TodoNotFound, 400: [InvalidRole, RoleTaken] }`.
  The first schema that decodes the JSON body is what the call fails with,
  so callers write `Effect.catchTag("TodoNotFound", …)` rather than
  checking `status` and `body`. It can be given to `Fetch.make` (every
  call), `client.endpoint` and `Fetch.endpoint` (every call of the
  endpoint) and a call's options. The call's schemas are tried first, then
  the endpoint's, then the client's.
  - Backends don't send a `_tag`, so Effetch adds the schema's literal
    `_tag` to the body before decoding. `Schema.encodeKeys` renames fields.
  - A response that no schema decodes, or with an empty or non-JSON body,
    fails with the `HttpError` it fails with today, which stays in the
    error type. Calls without `statusErrors` keep exactly their types and
    behaviour.
  - Plugins see the raw response, as before, so `retry` still retries by
    status. `onError` receives the decoded error.
  - Maps are copied and frozen where they're given, so changing one later
    changes nothing. The client has a `statusErrors` property, its copy or
    `undefined`, and so do `Fetch.endpoint` definitions. Endpoints have a
    `statusErrors` property too: their map joined with the client's, each
    status listing its schemas in the order they're tried.
  - A client's type includes its map, `Client<Ps, EB, SE>`, so a client
    with a map isn't assignable to a plain `Fetch.Client`, which would hide
    its errors.
  - New types: `StatusErrorMap`, `StatusError`, `StatusErrorSchema` and
    `StatusErrorServices`.
    `Client`, `ClientConfig`, `Endpoint`, `EndpointDefinition`,
    `UnboundEndpoint`, `UnboundDefinition`, the option types, the method
    signatures, `CallEffect`, `CallError` and `CallServices` gain a type
    parameter for the maps, last and defaulting to `undefined`, so existing
    type references keep compiling.
- Plugins can have an `onExit(exit, ctx)` hook. It runs once per call, when
  it's over, whatever the outcome: success, failure, defect or interruption.
  It gets the call's `Exit` (with the decoded `output`, or the response for
  a call without one) and a `PluginExitContext`: the `PluginContext` fields,
  the `response` (the one the plugins returned, else the last one the
  network sent, or `undefined`), and `durationMs`,
  from sending the request to decoding the body, retries included. Hooks
  run in array order, after the `onError` hooks, and can't change the
  outcome; one that dies is logged at Debug level. They don't run for
  `client.httpClient`, or for a plugin the call skips.
  - `Plugin.Definition` gains an `RExit` type parameter for the hook's
    services, last and defaulting to `never`, so existing references keep
    compiling.
- `consoleLogger` (from `@monarcode/effetch/plugins`) prints each call to the
  console while you develop: a line with the route, status, duration, size
  and outcome, opening a group with the full URL, the request and response
  headers and bodies, and the error. It redacts sensitive headers, query
  parameters and body keys (in errors too), reads only text bodies of at
  most 1 MB and never the body of a raw or interrupted call, colors with CSS
  or ANSI codes, and can be limited to errors, filtered, or set per call.
  Its `enabled` option turns it off in production while keeping the
  client's type. Groups start collapsed, except in React Native, whose
  Metro terminal drops collapsed groups.

### Changed

- Values typed as `Client`, `Endpoint` or `UnboundEndpoint` that you build
  by hand, such as test doubles, need a `statusErrors` property:
  `undefined`, or the map the real one would have.

## 0.1.0-rc.1

### Added

- Endpoints have `output`, `error` and `input` properties: the schemas they
  were defined with, for things like decoding cached data or building test
  fixtures. `output` and `input` are `undefined` when the endpoint has none.
  `error` is the schema `HttpError.body` is decoded with: the endpoint's
  `error`, else the client's `defaultError`, else `Schema.Unknown`. Values
  typed as `Endpoint` that you build by hand, such as test doubles, need the
  three properties too.
- `Fetch.endpoint(route, definition)` defines an endpoint without a client:
  frozen data with its `route`, `method`, `path`, schemas and headers, which
  can be exported at module level next to its schemas. `client.bind` makes it
  an endpoint of that client, the same one `client.endpoint` makes from the
  same route and definition. Plugin overrides are given when binding, where
  they're checked against the client's plugins, and a definition without an
  `error` schema uses the client's `defaultError`. Headers given when binding
  win over the definition's. The route is checked by the types, and
  `Fetch.endpoint` throws on a malformed one. New types: `UnboundEndpoint`,
  `UnboundDefinition`, `BindMethod` and `BindOptions`. Values typed as
  `Client` that you build by hand need `bind` too.

### Changed

- Calls and endpoints return `Effect.Effect<…>` with their errors and
  services written out, rather than `CallEffect<…>`, so editors show what a
  call succeeds with, fails with and needs. Hovering a call, or a program
  built from calls, shows
  `Effect<{ readonly id: number }, NetworkError | DecodeError | HttpError.With<unknown>, never>`
  instead of `CallEffect<…>` and `CallError<…>` with the schemas. The types
  are structurally the same, and a `CallEffect` you write yourself prints
  the same way once it's used in a program.
  - TypeScript can no longer infer `CallEffect`'s type parameters from a
    call. A helper that takes `call: CallEffect<O, EB, I, Ps>` and is passed
    a call gets their constraints instead, so `Success<O>` is `unknown`.
    Accept any Effect: `<A, E, R>(call: Effect.Effect<A, E, R>)`.
    Functions that return a call typed as `CallEffect`, or as
    `Effect.Effect` with `CallError` and `CallServices`, work as before.

### Fixed

- A `Redacted` query value is sent as its value. From Effect 4.1,
  `QueryValue` (Effect's `UrlParams.Coercible`) accepts `Redacted`, but
  Effetch converted it with `String()`, so `{ token: Redacted.make(key) }`
  sent `token=<redacted>`.

## 0.1.0-rc.0

### Added

- `client.endpoint(route, definition)` saves a call: a route such as
  `"GET /users/:id"` with its `output`, `error` and `input` schemas, `headers`
  and plugin overrides. It returns a function that takes one call's `params`,
  `query`, `body`, `headers` and `plugins`, and sends what the equivalent
  method would.
  - The route is type-checked (an uppercase method, one space, then a path
    starting with `/` or an absolute `http(s)://` URL), and editors suggest
    the methods.
  - With an `input` schema, `body` is required. `GET`, `HEAD`, `OPTIONS` and
    `TRACE` endpoints reject `body` and `input`.
  - A call's `headers` and plugin overrides are merged over the endpoint's,
    and win. Plugin options given by both are merged.
  - Each endpoint has `route`, `method` and `path` properties.
- The types `Endpoint`, `EndpointMethod`, `EndpointDefinition`,
  `EndpointOptions`, `EndpointBody`, `EndpointArgs`, `EndpointRoute`,
  `ValidRoute`, `RouteMethod` and `RoutePath`.
- Plugins see each call's route: its method and path before the params are
  filled in, such as `"GET /users/:id"`, the same for a method call and an
  endpoint. Hooks get it as `ctx.route` (`PluginContext.route`), and `wrap`
  as a third argument, an `Effect` like `options`. It's `undefined` for
  requests sent through `client.httpClient`.
- `logger` adds the route to its log annotations, as `route`.

### Changed

- `CallServices` and `CallEffect` accept `undefined` for the `input` schema
  `I`, as they already did for `O`.

### Documentation

- The README is reorganized as a guide that reads top to bottom: why Effetch
  (with a side-by-side with `HttpClient`), getting started, then clients,
  calls, errors, plugins and writing them, endpoints, structuring an app and
  testing, with a two-level table of contents.
- The README's Endpoints section explains why endpoints exist, when to use
  one rather than a method, and how to organize them: in one service for a
  small app, in each module for a feature-sliced app, and with several
  backends.
- New examples: `endpoints.ts`, `backends.ts`, and `app/`, a feature-sliced
  app with shared clients and module-owned endpoints. `examples/README.md`
  says what each example shows.

## 0.1.0-alpha.2

### Changed

- `make`'s `error` option is now `defaultError`, so it reads differently from
  a call's `error`, which replaces it.

### Fixed

- `query` now accepts values typed with an `interface`. Each property is
  still checked, so a `Date`, a nested object or a function is rejected. The
  new `QueryOf<Q>` type is the constraint; `QueryInput` is unchanged, and the
  option types (`BaseOptions`, `NoBodyRequestOptions`, `RequestOptions`) take
  an optional trailing `Q` parameter that defaults to it.
- `HttpError.status` and `DecodeError.status` use `Schema.Finite` instead of
  `Schema.Number`. The value is still a `number`, as before.

### Documentation

- Examples use `Schema.Finite` instead of `Schema.Number`. Through the JSON
  codec, `Schema.Number` decodes `"NaN"`, `"Infinity"` and `"-Infinity"`
  strings into numbers and encodes them back as strings.

## 0.1.0-alpha.1

First release published from CI with npm provenance. No changes to the
package since 0.1.0-alpha.0.

## 0.1.0-alpha.0

First preview of Effetch: typed, schema-driven HTTP calls on Effect v4's
`HttpClient`.

### Added

#### Client

- `make` builds a client from any `HttpClient`, with a `baseUrl` (a string, or
  an Effect such as a `Config`, run once), default `headers`, a default
  `error` schema and `plugins`. Calls need no services apart from those of
  their own schemas.
- `get`, `head` and `options` (no body), `post`, `put`, `patch` and `del`, and
  `request(method, …)` for any method. `httpClient` exposes the configured
  `HttpClient` for anything else, such as streaming.
- Path parameters are inferred from the path: `"/users/:id"` requires
  `params: { id }`, and values are URI-encoded.
- `query` takes a plain object: arrays repeat the key, `null` and `undefined`
  are dropped.
- `body` is sent by its type (`FormData`, `URLSearchParams`, `Blob`, bytes,
  text, or JSON), or encoded with an `input` schema.
- `output` decodes the 2xx JSON body with a schema and sends
  `Accept: application/json`. Without it, calls return the raw response.

#### Errors

- `NetworkError`, `HttpError` and `DecodeError`, with `FetchError` and
  `isFetchError`. `HttpError.body` is decoded with the call's or the client's
  `error` schema, and `HttpError.With<B>` types it.
- Error URLs never include the query string, and response headers such as
  `set-cookie` print as `<redacted>`.

#### Plugins

- `plugin` defines a plugin with `onRequest`, `onResponse`, `onError` and
  `wrap` hooks. Its errors, services and options are inferred, and calls can
  skip it or override its options with `plugins: { name: … }`.
- Built-in plugins in `@monarcode/effetch/plugins`: `bearer` (tokens from a
  string, a sync or async function, or an Effect), `logger`, `retry` (network
  errors and transient statuses, idempotent methods only, with jittered
  backoff) and `timeout` (with `TimeoutError`).

#### Types and docs

- Every export is documented with an example in the shipped `.d.ts`.
  TypeScript 5.4 or newer is required.
