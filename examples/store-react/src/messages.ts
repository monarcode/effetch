import * as Effect from "effect/Effect";

import { Fetch } from "@monarcode/effetch";
import { TimeoutError } from "@monarcode/effetch/plugins";

import { buyCheapest } from "./store.ts";

// What the screens tell the user. Plain functions and effects, with no
// React in them, so the tests check them without rendering anything.

/**
 * What to say about an error the store's calls can fail with, and the
 * screen didn't handle itself. A loader's errors reach the route's error
 * component as they are, typed, so they can be told apart here.
 */
export const describeError = (error: unknown): string => {
	if (error instanceof Fetch.HttpError) {
		return `The store answered with an error (${error.status}).`;
	}
	if (error instanceof Fetch.NetworkError) {
		return "Couldn't reach the store. Check your connection.";
	}
	if (error instanceof TimeoutError) {
		return "The store took too long to answer.";
	}
	if (error instanceof Fetch.DecodeError) {
		return "The store sent something this app doesn't understand.";
	}
	return "Something went wrong.";
};

/**
 * Buys the cheapest product in `category`, and says what happened. The
 * workflow's own errors each get their own message, and the rest the one
 * `describeError` gives, so the effect can't fail: its error type is
 * `never`, as `useAction` asks.
 */
export const buyCheapestMessage = (category: string, quantity: number) =>
	buyCheapest(1, category, quantity).pipe(
		Effect.map((cart) => {
			const [line] = cart.products;
			return `Cart ${cart.id}: ${line?.quantity} × ${line?.title}, $${cart.discountedTotal}`;
		}),
		Effect.catchTags({
			NothingToBuy: () => Effect.succeed("There's nothing to buy here."),
			OutOfStock: (error) =>
				Effect.succeed(
					`Only ${error.stock} ${error.product} left, not ${error.wanted}.`,
				),
		}),
		Effect.catch((error) => Effect.succeed(describeError(error))),
	);
