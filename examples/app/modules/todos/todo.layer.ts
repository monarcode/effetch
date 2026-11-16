import * as Layer from "effect/Layer";

import { TodoApi } from "./data/todo.api.js";

/** Every live layer of the module, for the app's runtime. */
export const TodoModuleLive = Layer.mergeAll(TodoApi.layer);
