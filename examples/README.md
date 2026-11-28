# Examples

Programs that use Effetch for a real task, against real, free APIs. None of
them needs a key or an account. Run one, read what it prints, then read its
code.

## Run an example

From the repository, after `pnpm install`:

```sh
pnpm example github
```

`pnpm example` builds the package if `src` has changed since the last
build, then runs the example's `main.ts` with Node.js. That needs Node.js
22.18 or later, which runs TypeScript files as they are. Some examples take
arguments, which their `main.ts` lists, such as
`pnpm example github facebook/react`.

`pnpm example store-react` starts that app's dev server instead: open the
address it prints. It's a package of its own in the workspace, so
`pnpm install` at the root installs React, TanStack Router and Vite for it.

The examples call public services, which can be slow, rate-limited or down.
Their tests don't: each one runs against a fake backend made with
`FetchTest`, offline, as part of `pnpm test`. To run only the examples'
tests, use `pnpm vitest run examples`.

## The examples

Read them in this order. Each one builds on what the ones before it show.

| Example                       | What it does                                                                                                       | What it shows                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`github/`](github)           | Shows a GitHub repository and its newest open issues.                                                              | A client as a service, endpoints with a typed query, GitHub's error body, `404` and rate-limit errors of your own, paging by the `Link` header, `Retry-After`, an optional token, a plugin of your own.                                                                                         |
| [`sign-in/`](sign-in)         | Signs in to DummyJSON, renews the access token when it's refused, and signs out.                                   | A session as an Effect service, `bearer` with `refresh`, a second client for the auth calls, `consoleLogger`, and testing the refresh.                                                                                                                                                          |
| [`live/`](live)               | Prints the next edits to Wikipedia, then the moves of the game Lichess TV is showing.                              | Server-Sent Events and newline-delimited JSON, a union per line, ending a stream, and two clients for two backends.                                                                                                                                                                             |
| [`upload/`](upload)           | Uploads a file and two form fields to httpbin, which echoes what it received.                                      | A plain `post` call with a multipart body, a list field, a file size check with an error of your own, and retrying a `POST` that's safe to send again.                                                                                                                                          |
| [`bff/`](bff)                 | A server that calls DummyJSON, and a browser client that calls the server over Effect RPC.                         | `Fetch.errorCodec`: the call's errors cross to the client as JSON, and come back as the same classes. The example prints what crossed.                                                                                                                                                          |
| [`store/`](store)             | A shop app in modules: products and a cart, with a workflow that buys the cheapest product.                        | A feature-sliced layout, endpoints next to their module's schemas, a workflow with domain errors, a `ManagedRuntime` for the UI, and testing the workflow.                                                                                                                                      |
| [`store-react/`](store-react) | The `store/` modules behind a React app: categories, pages of products, a product's page, and buying the cheapest. | TanStack Router loaders that run their calls with the store's `ManagedRuntime` and the route's abort signal, `ProductNotFound` as the router's not-found, typed errors in an error component, search params checked by an Effect schema, a form that runs the workflow, and testing the routes. |

Each example's files start with a comment that says what they're for. The
APIs:
[GitHub's REST API](https://docs.github.com/en/rest),
[DummyJSON](https://dummyjson.com/docs),
[Wikimedia EventStreams](https://wikitech.wikimedia.org/wiki/Event_Platform/EventStreams_HTTP_Service),
[Lichess](https://lichess.org/api) and [httpbin](https://httpbin.org).

## `store/`: endpoints in a feature-sliced app

> **This folder structure is a personal preference:** the layout Effetch's
> author uses in their own apps (React Native, with Expo). Effetch doesn't
> depend on any of it. Rename the folders and files, merge or split them, and
> adapt it to your own taste and project. What carries over to any layout is
> in [the rules it follows](#the-rules-it-follows).

```text
store/
├── infrastructure/
│   └── http/
│       └── store-api-client.ts    StoreApiClient: how to reach the backend
├── modules/
│   ├── products/
│   │   ├── contract/
│   │   │   └── products.ts        schemas, errors, endpoints: Product, ProductNotFound, getProduct, …
│   │   ├── data/
│   │   │   └── product.api.ts     ProductApi: the endpoints, bound to the client
│   │   ├── products.layer.ts      the module's live layers
│   │   └── public.ts              what other code may import
│   └── cart/
│       ├── contract/
│       │   └── cart.ts            schemas and endpoints: Cart, NewCart, createCart
│       ├── data/
│       │   └── cart.api.ts        CartApi
│       ├── application/
│       │   └── buy-cheapest.ts    a workflow over ProductApi and CartApi
│       ├── cart.test.ts           the workflow, tested against a fake backend
│       ├── cart.layer.ts
│       └── public.ts
├── runtime.ts                     composition root: modules, client, HttpClient
└── main.ts                        code using the modules, as a screen would
```

Read it in that order: the client, a module, the runtime, then `main.ts`.

### The rules it follows

1. **A client file says how to reach a backend, and nothing else:** its base
   URL, the body of its errors, what a status means from every endpoint,
   and its plugins. It holds no endpoints and no module schemas, and never
   imports a module, so it stays the same size however many endpoints the
   app has.
2. **A module's endpoints sit next to its schemas,** in `contract/`, defined
   with `Fetch.endpoint`, which needs no client. So anything can read their
   routes and schemas, such as the fake backend in `cart.test.ts`. An
   endpoint's own `statusErrors` (`404: ProductNotFound`) sit with it, and
   the module's `public.ts` exports those errors, so other code can catch
   them.
3. **Every module's data service is its endpoints,** bound to the client
   with `Fetch.Endpoints` in `data/`: one line per operation, and every type
   inferred, so every `data/` folder looks the same. They're bound once,
   when the module's layer is built, never in code that runs per request.
4. **An operation that isn't one HTTP call is a workflow in `application/`.**
   `buyCheapest` finds the cheapest product in a category, fails with
   `NothingToBuy` or `OutOfStock`, then makes the cart. The endpoints stay
   plain; the rules live in the workflow.
5. **Dependencies point one way:** a module imports the infrastructure,
   and other modules through their `public.ts`, never the other way. The
   cart's workflow uses the products module through its `public.ts`.
6. **The runtime composes the module layers on top of the client layer, on
   top of one `HttpClient`.** A new module is one line in `runtime.ts`; a
   new backend is one client file and one line. The UI runs effects with
   the `ManagedRuntime` it exports.
7. **Other code imports a module through its `public.ts`,** and never sees a
   route, a schema it doesn't need or a client.

### As modules grow

- A module with 20 or more endpoints still has one definition and one line in
  `data/` per endpoint, inside the module. Nothing outside the module grows.
- When one module's endpoints serve separate concerns, split them into
  several services, each in its own file (`cart.api.ts` and
  `checkout.api.ts`), and merge their layers in the module's
  `<module>.layer.ts`.
- When a module needs another implementation of its data service, such as an
  offline one or a fake for UI work, declare the service's interface by hand
  and implement it with the endpoints, in place of `<module>.api.ts`.
- When a capability gets its own screens, consumers and API, make it a module
  of its own.

### With several backends

Add a client file per backend in `infrastructure/http/`, each with its own
base URL, error body and plugins, and merge their layers in `runtime.ts`.
Each module uses the client of the backend it talks to. [`live/`](live) has
two clients for two backends on one `HttpClient`.

## `store-react/`: the modules behind a React app

```text
store-react/
├── src/
│   ├── store.ts          the store's modules, runtime and types, from store/
│   ├── root.tsx          the root route, with the runtime in the router's context
│   ├── home.tsx          /: the categories
│   ├── category.tsx      /categories/$category?page=2: a page of products, and buying
│   ├── product.tsx       /products/$productId: a product, or the not-found
│   ├── route-error.tsx   what a route shows when its loader fails
│   ├── messages.ts       what the screens say about each error
│   ├── use-action.ts     runs an effect from a form, with its pending state
│   ├── router.ts         the route tree and the router
│   ├── main.tsx          the app: the router, on the store's runtime
│   ├── styles.css
│   └── app.test.ts       the routes and the messages, against a fake backend
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

1. **The app adds screens, and nothing else.** What it calls comes from
   `store/`'s `public.ts` files and its runtime, which `src/store.ts`
   imports once: the same modules `store/main.ts` uses.
2. **The runtime is in the router's context,** so each loader runs its
   effect with `runtime.runPromise(effect, { signal: abortController.signal })`.
   When the navigation moves on, TanStack Router aborts that signal, which
   interrupts the effect and cancels its request. The router doesn't preload
   on hover, as a preloaded loader would go on when the page is left. The
   tests give the router a runtime on a fake backend instead.
3. **A loader's errors reach the route as they are.** `ProductNotFound`,
   and a page past the last one, become the router's `notFound()`, which
   shows the route's `notFoundComponent`. The rest go to `RouteError`, which tells them apart
   by class.
4. **An action the user starts runs with `useAction`.** Its effect has
   handled every error, so its error type is `never`, and leaving the page
   while it runs interrupts it.
5. **Search params are an Effect schema.** `validateSearch` takes it as a
   Standard Schema, so `?page=0` fails as the schema says, and the route's
   `search` is typed from it.

Here, Effetch comes from the repository's `src`, and Effect from the root's
dependencies, so the app and the modules share one copy of each. In your
own app, install both.
