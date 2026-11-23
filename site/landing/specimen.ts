import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";
import { retry, timeout } from "@monarcode/effetch/plugins";

class Todo extends Schema.Class<Todo>("Todo")({
  id: Schema.Finite,
  title: Schema.String,
}) {}

class ApiError extends Schema.Class<ApiError>("ApiError")({
  code: Schema.String,
}) {}

declare const id: number;

// Every combination of the landing page's options, one client per set of
// plugins. Each query's name is its combination: output, error, retry,
// timeout, each 0 or 1.
const program = Effect.gen(function* () {
  {
    const api = yield* Fetch.make({ baseUrl: "https://api.example.com" });
    const o0e0r0t0 = api.get("/todos/:id", { params: { id } });
//        ^?
    const o0e1r0t0 = api.get("/todos/:id", { params: { id }, error: ApiError });
//        ^?
    const o1e0r0t0 = api.get("/todos/:id", { params: { id }, output: Todo });
//        ^?
    const o1e1r0t0 = api.get("/todos/:id", { params: { id }, output: Todo, error: ApiError });
//        ^?
  }
  {
    const api = yield* Fetch.make({ baseUrl: "https://api.example.com", plugins: [retry({ times: 2 })] });
    const o0e0r1t0 = api.get("/todos/:id", { params: { id } });
//        ^?
    const o0e1r1t0 = api.get("/todos/:id", { params: { id }, error: ApiError });
//        ^?
    const o1e0r1t0 = api.get("/todos/:id", { params: { id }, output: Todo });
//        ^?
    const o1e1r1t0 = api.get("/todos/:id", { params: { id }, output: Todo, error: ApiError });
//        ^?
  }
  {
    const api = yield* Fetch.make({ baseUrl: "https://api.example.com", plugins: [timeout({ duration: "5 seconds" })] });
    const o0e0r0t1 = api.get("/todos/:id", { params: { id } });
//        ^?
    const o0e1r0t1 = api.get("/todos/:id", { params: { id }, error: ApiError });
//        ^?
    const o1e0r0t1 = api.get("/todos/:id", { params: { id }, output: Todo });
//        ^?
    const o1e1r0t1 = api.get("/todos/:id", { params: { id }, output: Todo, error: ApiError });
//        ^?
  }
  {
    const api = yield* Fetch.make({ baseUrl: "https://api.example.com", plugins: [retry({ times: 2 }), timeout({ duration: "5 seconds" })] });
    const o0e0r1t1 = api.get("/todos/:id", { params: { id } });
//        ^?
    const o0e1r1t1 = api.get("/todos/:id", { params: { id }, error: ApiError });
//        ^?
    const o1e0r1t1 = api.get("/todos/:id", { params: { id }, output: Todo });
//        ^?
    const o1e1r1t1 = api.get("/todos/:id", { params: { id }, output: Todo, error: ApiError });
//        ^?
  }
});
