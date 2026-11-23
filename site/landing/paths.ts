// @errors: 2322 2554 2741 2561
// ---cut-start---
import type { Fetch } from "@monarcode/effetch";

declare const api: Fetch.Client;
declare const id: number;
declare const userId: number;
declare const postId: number;
// ---cut-end---
type none = Fetch.PathParamNames<"/todos">;
//   ^?
api.get("/todos");
api.get("/todos", { params: { id } });

type one = Fetch.PathParamNames<"/todos/:id">;
//   ^?
api.get("/todos/:id", { params: { id } });
api.get("/todos/:id");

type two = Fetch.PathParamNames<"/users/:userId/posts/:postId">;
//   ^?
api.get("/users/:userId/posts/:postId", { params: { userId, postId } });
api.get("/users/:userId/posts/:postId", { params: { userId } });

type three = Fetch.PathParamNames<"/orgs/:org/repos/:repo/issues/:number">;
//   ^?
api.get("/orgs/:org/repos/:repo/issues/:number", { params: { org: "effect", repo: "effect", number: 1 } });
api.get("/orgs/:org/repos/:repo/issues/:number", { params: { org: "effect", repo: "effect", numbr: 1 } });
