import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { Fetch } from "@monarcode/effetch";
import { FetchTest } from "@monarcode/effetch/test";
import {
	createMemoryHistory,
	RouterProvider,
	SearchParamError,
} from "@tanstack/react-router";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { StoreApiClient } from "../../store/infrastructure/http/store-api-client.ts";
import { CartModuleLive } from "../../store/modules/cart/cart.layer.ts";
import { createCart } from "../../store/modules/cart/contract/cart.ts";
import {
	getProduct,
	listCategories,
	productsInCategory,
} from "../../store/modules/products/contract/products.ts";
import { ProductModuleLive } from "../../store/modules/products/products.layer.ts";
import { buyCheapestMessage, describeError } from "./messages.ts";
import { makeRouter } from "./router.ts";
import type { StoreRuntime } from "./store.ts";

// The app as it runs: the store's real modules and client, with only the
// HttpClient under them fake. The route tests build the app's router at a
// URL, load it, then read what the loaders gave the page's route, and what
// the page shows.

const phone = {
	id: 1,
	title: "iPhone 9",
	category: "smartphones",
	price: 549,
	stock: 94,
};

/** A runtime whose calls `handlers` answer, disposed after each test. */
const runtimeWith = (...handlers: ReadonlyArray<FetchTest.Handler>) => {
	const runtime = ManagedRuntime.make(
		Layer.mergeAll(ProductModuleLive, CartModuleLive).pipe(
			Layer.provide(StoreApiClient.layer),
			Layer.provideMerge(FetchTest.layer(handlers)),
		),
	);
	runtimes.push(runtime);
	return runtime;
};
const runtimes: Array<ManagedRuntime.ManagedRuntime<never, unknown>> = [];
afterEach(async () => {
	await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

/**
 * The app's routes at `url`, after their loaders ran, as a browser runs
 * them: Node would otherwise count as the server, where `navigate` doesn't
 * load.
 */
const loaded = async (runtime: StoreRuntime, url: string) => {
	const router = makeRouter(runtime, {
		history: createMemoryHistory({ initialEntries: [url] }),
		isServer: false,
		// What the browser's `window.origin` would be.
		origin: "http://localhost",
	});
	await router.load();
	return router;
};

type LoadedRouter = Awaited<ReturnType<typeof loaded>>;

/** The deepest match: the page's route. */
const page = (router: LoadedRouter) => router.state.matches.at(-1);

/** The page's text, as React renders it. */
const text = (router: LoadedRouter) =>
	renderToString(createElement(RouterProvider, { router }))
		.replaceAll(/<[^>]+>/g, " ")
		.replaceAll("&#x27;", "'")
		.replaceAll(/\s+/g, " ");

describe("store-react routes", () => {
	it("loads the categories", async () => {
		const runtime = runtimeWith(
			FetchTest.respond(listCategories, () =>
				Effect.succeed([{ slug: "smartphones", name: "Smartphones" }]),
			),
		);
		const router = await loaded(runtime, "/");
		expect(page(router)?.loaderData).toStrictEqual([
			{ slug: "smartphones", name: "Smartphones" },
		]);
	});

	it("reads the page from the search params", async () => {
		const runtime = runtimeWith(
			FetchTest.respond(productsInCategory, () =>
				Effect.succeed({ products: [phone], total: 20 }),
			),
		);
		const router = await loaded(runtime, "/categories/smartphones?page=2");
		expect(page(router)?.status).toBe("success");
		expect(text(router)).toContain("Page 2 of 3");
		const [sent] = await runtime.runPromise(FetchTest.requests);
		expect(sent?.params).toStrictEqual({ category: "smartphones" });
		expect(sent?.query).toStrictEqual({ limit: "8", skip: "8" });
	});

	it("rejects a page the search schema doesn't take", async () => {
		const runtime = runtimeWith();
		const router = await loaded(runtime, "/categories/smartphones?page=0");
		const match = page(router);
		expect(match?.status).toBe("error");
		expect(match?.error).toBeInstanceOf(SearchParamError);
		expect(await runtime.runPromise(FetchTest.requests)).toStrictEqual([]);
	});

	it("shows the not-found for a page past the last one", async () => {
		const runtime = runtimeWith(
			FetchTest.respond(productsInCategory, () =>
				Effect.succeed({ products: [], total: 20 }),
			),
		);
		const router = await loaded(runtime, "/categories/smartphones?page=9");
		expect(page(router)?.status).toBe("notFound");
		expect(text(router)).toContain("There's no such page.");
	});

	it("shows a product's page", async () => {
		const runtime = runtimeWith(
			FetchTest.respond(getProduct, () => Effect.succeed(phone)),
		);
		const router = await loaded(runtime, "/products/1");
		expect(text(router)).toContain("iPhone 9");
		expect(text(router)).toContain("94 in stock");
	});

	it("turns ProductNotFound into the route's not-found", async () => {
		const runtime = runtimeWith(
			FetchTest.respond(getProduct, () =>
				Effect.succeed(
					FetchTest.reply(404, { message: "Product not found" }),
				),
			),
		);
		const router = await loaded(runtime, "/products/9999");
		expect(page(router)?.status).toBe("notFound");
		expect(text(router)).toContain("This product isn't in the store.");
	});

	it("hands other errors to the route's error component, typed", async () => {
		const runtime = runtimeWith(
			FetchTest.respond(getProduct, () =>
				Effect.succeed(FetchTest.reply(500, { message: "Down" })),
			),
		);
		const router = await loaded(runtime, "/products/1");
		const match = page(router);
		expect(match?.status).toBe("error");
		expect(match?.error).toBeInstanceOf(Fetch.HttpError);
		// React can't render an error boundary to a string, so this checks
		// what `RouteError` shows for it.
		expect(describeError(match?.error)).toBe(
			"The store answered with an error (500).",
		);
	});

	it("interrupts a loader's call when the navigation moves on", async () => {
		let started: () => void = () => {};
		const asked = new Promise<void>((resolve) => {
			started = resolve;
		});
		let interrupted = false;
		const runtime = runtimeWith(
			// The store never answers, so only leaving the page ends the call.
			FetchTest.respond(getProduct, () =>
				Effect.sync(started).pipe(
					Effect.andThen(Effect.never),
					Effect.onInterrupt(() =>
						Effect.sync(() => {
							interrupted = true;
						}),
					),
				),
			),
			FetchTest.respond(listCategories, () => Effect.succeed([])),
		);
		const router = await loaded(runtime, "/");
		void router.navigate({
			to: "/products/$productId",
			params: { productId: "1" },
		});
		await asked;
		await router.navigate({ to: "/" });

		await Effect.runPromise(Effect.sleep("10 millis"));
		expect(interrupted).toBe(true);
	});
});

describe("buyCheapestMessage", () => {
	const store = (stock: number, status = 201) =>
		runtimeWith(
			FetchTest.respond(productsInCategory, ({ params }) =>
				Effect.succeed(
					params.category === "smartphones"
						? { products: [{ ...phone, stock }], total: 1 }
						: { products: [], total: 0 },
				),
			),
			FetchTest.respond(
				createCart,
				({ body }) =>
					Effect.succeed(
						status === 201
							? {
									id: 51,
									products: body.products.map((line) => ({
										...line,
										title: phone.title,
									})),
									discountedTotal: phone.price * 2,
								}
							: FetchTest.reply(status, { message: "Down" }),
					),
				{ status: 201 },
			),
		);

	it("says what went in the cart", async () => {
		const message = await store(94).runPromise(
			buyCheapestMessage("smartphones", 2),
		);
		expect(message).toBe("Cart 51: 2 × iPhone 9, $1098");
	});

	it("gives each of the workflow's errors its own message", async () => {
		const runtime = store(3);
		expect(
			await runtime.runPromise(buyCheapestMessage("smartphones", 5)),
		).toBe("Only 3 iPhone 9 left, not 5.");
		expect(
			await runtime.runPromise(buyCheapestMessage("flying-cars", 1)),
		).toBe("There's nothing to buy here.");
	});

	it("describes the store's errors", async () => {
		const message = await store(94, 503).runPromise(
			buyCheapestMessage("smartphones", 2),
		);
		expect(message).toBe("The store answered with an error (503).");
	});
});
