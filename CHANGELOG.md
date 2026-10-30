# Changelog

All notable changes to `@monarcode/effetch`, newest first.

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
  same route and definition. Plugin
  overrides are given when binding, where they're checked against the
  client's plugins, and a definition without an `error` schema uses the
  client's `defaultError`. Headers given when binding win over the
  definition's. The route is checked by the types, and `Fetch.endpoint`
  throws on a malformed one. New types: `UnboundEndpoint`,
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
