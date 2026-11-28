import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { makeRouter } from "./router.ts";
import { runtime } from "./store.ts";

import "./styles.css";

// The store example's runtime: its modules, on its client, on the browser's
// `fetch`. The router hands it to every loader in its context.
const router = makeRouter(runtime);

const root = document.querySelector("#root");
if (root === null) throw new Error("index.html has no #root element");

createRoot(root).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
