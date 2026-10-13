import * as Layer from "effect/Layer";

import { TodoApiLive } from "./data/todo.api.js";

/** Every live layer of the module, for the app's runtime. */
export const TodoModuleLive = Layer.mergeAll(TodoApiLive);
