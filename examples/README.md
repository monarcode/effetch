# Examples

Complete programs using effetch. They're typechecked with the package
(`pnpm run typecheck`), so they always match the current API.

| Example                        | What it shows                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [`basic.ts`](basic.ts)         | A client in a service, the methods (`get`, `post`, `patch`, `del`) and handling each error.                         |
| [`builtins.ts`](builtins.ts)   | The built-in plugins (`logger`, `retry`, `timeout`, `bearer`) and per-call overrides.                               |
| [`plugins.ts`](plugins.ts)     | Writing plugins: auth with a service, a header with options, a `wrap` with its own error, error reporting.          |
| [`endpoints.ts`](endpoints.ts) | The same app as `builtins.ts` with endpoints: one client, its endpoints as the service's methods.                   |
| [`backends.ts`](backends.ts)   | Two backends in one file: one client each, shared plugins, and each backend's errors caught next to its calls.      |
| [`app/`](app)                  | A feature-sliced app: clients as shared infrastructure, each module defining its own endpoints next to its schemas. |

`endpoints.ts` and `backends.ts` keep everything in one file, which suits a
small app. `app/` is a layout for an app with many endpoints and modules.

Throughout, the Effect that builds a client or a service is named after what
it builds: `makeApi` builds `Api`, `makeAppApiClient` builds `AppApiClient`,
`makeTodoApi` builds `TodoApi`.

## `app/`: endpoints in a feature-sliced app

> **This folder structure is a personal preference:** the layout effetch's
> author uses in their own apps (React Native, with Expo). effetch doesn't
> depend on any of it. Rename the folders and files, merge or split them, and
> adapt it to your own taste and project. What carries over to any layout is
> in [the rules it follows](#the-rules-it-follows).

```text
app/
├── infrastructure/
│   └── http/
│       ├── plugins.ts               shared plugins: auth, error reporting
│       ├── app-api-client.ts        AppApiClient: the main backend's client
│       └── wallet-api-client.ts     WalletApiClient: a second backend's client
├── modules/
│   ├── todos/
│   │   ├── contract/
│   │   │   └── todos.ts             schemas: Todo, NewTodo, …
│   │   ├── data/
│   │   │   └── todo.api.ts          TodoApi: the module's endpoints
│   │   ├── todo.layer.ts            the module's live layers
│   │   └── public.ts                what other code may import
│   └── wallet/
│       ├── contract/
│       │   └── wallet.ts            schemas: Balance, Transfer, Receipt
│       ├── data/
│       │   └── wallet.api.ts        WalletApi: the module's endpoints
│       ├── application/
│       │   └── send-money.ts        a workflow over WalletApi
│       ├── wallet.layer.ts
│       └── public.ts
├── runtime.ts                       composition root: modules, clients, HttpClient
└── main.ts                          code using the modules
```

Read it in that order: a client, a module, the runtime, then `main.ts`.

### The rules it follows

1. **A client file says how to reach a backend, and nothing else:** its base
   URL, the body of its errors and its plugins. It holds no endpoints and no
   module schemas, and never imports a module, so it stays the same size
   however many endpoints the app has.
2. **A module defines its endpoints from the client it talks to,** in its
   `data/` folder, importing the schemas from its own `contract/` folder.
   Dependencies point one way: module → infrastructure, never back.
3. **Endpoints are defined once, when the module's layer is built,** never in
   code that runs per request.
4. **Every module's data service is its endpoints** (`TodoApi`,
   `WalletApi`): one line per operation, and every type inferred, so every
   `data/` folder looks the same.
5. **An operation that isn't one HTTP call is a workflow in `application/`.**
   `sendMoney` reads the balance, fails with `InsufficientFunds` when it's too
   low, then sends the transfer. The endpoints stay plain; the rules live in
   the workflow.
6. **The runtime composes the module layers on top of the client layers, on
   top of one `HttpClient`.** A new module is one line in `runtime.ts`; a new
   backend is one client file and one line.
7. **Other code imports a module through its `public.ts`,** and never sees a
   route, a schema it doesn't need or a client.

### As modules grow

- A module with 20 or more endpoints still has one line per endpoint, in its
  own `data/` folder, beside its own schemas. Nothing outside the module grows.
- When one module's endpoints serve separate concerns, split them into
  several services, each in its own file (`wallet.api.ts` and
  `transaction.api.ts`), and merge their layers in the module's
  `<module>.layer.ts`.
- When a module needs another implementation of its data service, such as an
  offline one or a fake for UI work, declare the service's interface by hand
  and implement it with the endpoints, in place of `<module>.api.ts`.
- When a capability gets its own screens, consumers and API, make it a module
  of its own.

### With one backend

Drop `wallet-api-client.ts`: every module uses `AppApiClient`. The layout is
otherwise the same.
