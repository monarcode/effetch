# Changelog

All notable changes to `@monarcode/effetch`, newest first.

## 0.1.0-rc.3

### Added

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
  - `Fetch.make`, `Client` and `ClientConfig` are unchanged.

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
    and endpoints and definitions a `responseMode` property. Code that
    passes `client.bind`'s type arguments explicitly needs one more.
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
    for the schema, defaulted. Code that passes `client.bind`'s type
    arguments explicitly needs one more.

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
  - Backends don't send a `_tag`, so effetch adds the schema's literal
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
  effetch converted it with `String()`, so `{ token: Redacted.make(key) }`
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

- The README is reorganized as a guide that reads top to bottom: why effetch
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

First preview of effetch: typed, schema-driven HTTP calls on Effect v4's
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
