import type * as Effect from "effect/Effect";

import { useCallback, useEffect, useRef, useState } from "react";

import type { StoreRuntime, StoreServices } from "./store.ts";

/** What a component shows of an action: whether it's running, and its result. */
export interface ActionState<A> {
	readonly pending: boolean;
	readonly result: A | undefined;
}

/**
 * Runs an effect from an event handler, such as a form's submit, and keeps
 * the state a component shows. Running it again, or unmounting the
 * component, interrupts the run in progress, which cancels its requests.
 *
 * The effect handles its own errors, as its `never` error type says, so
 * the component decides what each one shows.
 */
export const useAction = <A>(runtime: StoreRuntime) => {
	const [state, setState] = useState<ActionState<A>>({
		pending: false,
		result: undefined,
	});
	const running = useRef<AbortController | undefined>(undefined);
	useEffect(() => () => running.current?.abort(), []);

	const run = useCallback(
		(effect: Effect.Effect<A, never, StoreServices>) => {
			running.current?.abort();
			const controller = new AbortController();
			running.current = controller;
			setState((current) => ({ ...current, pending: true }));
			void runtime.runPromise(effect, { signal: controller.signal }).then(
				(result) => {
					if (running.current === controller) {
						setState({ pending: false, result });
					}
				},
				(defect: unknown) => {
					// Interrupted by a newer run or by unmounting: nothing to show.
					if (controller.signal.aborted) return;
					// A defect, as the effect handles its errors: stop waiting, and
					// let it reach the console.
					if (running.current === controller) {
						setState((current) => ({ ...current, pending: false }));
					}
					throw defect;
				},
			);
		},
		[runtime],
	);

	return { ...state, run };
};
