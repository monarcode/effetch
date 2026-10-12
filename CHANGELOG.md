# Changelog

All notable changes to `@monarcode/effetch`, newest first.

## 0.1.0-alpha.2

### Fixed

- `query` now accepts values typed with an `interface`. Each property is
  still checked, so a `Date`, a nested object or a function is rejected. The
  new `QueryOf<Q>` type is the constraint; `QueryInput` is unchanged, and the
  option types (`BaseOptions`, `NoBodyRequestOptions`, `RequestOptions`) take
  an optional trailing `Q` parameter that defaults to it.

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
