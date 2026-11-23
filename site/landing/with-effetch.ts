// ---cut-start---
import * as Schema from "effect/Schema";

import type { Fetch } from "@monarcode/effetch";

declare const api: Fetch.Client;

class Todo extends Schema.Class<Todo>("Todo")({
  id: Schema.Finite,
  title: Schema.String,
}) {}
// ---cut-end---
const getTodo = (id: number) =>
//    ^?
  api.get("/todos/:id", {
    params: { id },
    output: Todo,
  });
