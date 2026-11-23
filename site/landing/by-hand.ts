// ---cut-start---
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as HttpIncomingMessage from "effect/http/HttpIncomingMessage";
import * as Schema from "effect/Schema";

class Todo extends Schema.Class<Todo>("Todo")({
  id: Schema.Finite,
  title: Schema.String,
}) {}
// ---cut-end---
const getTodo = (id: number) =>
//    ^?
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(
      `https://api.example.com/todos/${encodeURIComponent(id)}`,
    );
    const ok = yield* HttpClientResponse.filterStatusOk(response);
    return yield* HttpIncomingMessage.schemaBodyJson(Todo)(ok);
  });
