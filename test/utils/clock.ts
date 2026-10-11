import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";

/** Runs `self` in a fiber, moves the test clock on by `duration`, then waits for the result. */
export const after = <A, E, R>(
	self: Effect.Effect<A, E, R>,
	duration: Duration.Input,
): Effect.Effect<A, E, R> =>
	Effect.gen(function* () {
		const fiber = yield* Effect.forkChild(self);
		yield* TestClock.adjust(duration);
		return yield* Fiber.join(fiber);
	});
