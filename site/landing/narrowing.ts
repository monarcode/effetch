// ---cut-start---
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

declare const api: Fetch.Client;
class Todo extends Schema.Class<Todo>("Todo")({
  id: Schema.Finite,
  title: Schema.String,
}) {}
// ---cut-end---
const call = api.get("/todos/:id", {
//    ^?
  params: { id: 1 },
  output: Todo,
});

const found = call.pipe(Fetch.optional);
//    ^?

const settled = found.pipe(
//    ^?
  Effect.catchTags({
    NetworkError: () => Effect.succeed(Option.none()),
    DecodeError: (error) => Effect.die(error),
  }),
);
