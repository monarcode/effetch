import {
	type ErrorComponentProps,
	Link,
	SearchParamError,
	useRouter,
} from "@tanstack/react-router";

import { describeError } from "./messages.ts";

/**
 * A route's error component: what went wrong, and a way to try again. A
 * search param its schema rejects, such as `?page=0`, lands here too.
 */
export function RouteError({ error }: ErrorComponentProps) {
	const router = useRouter();
	if (error instanceof SearchParamError) {
		return (
			<section className="notice" role="alert">
				<p>This page's address has a search param it can't read.</p>
				<Link to="/">Back to the store</Link>
			</section>
		);
	}
	return (
		<section className="notice" role="alert">
			<p>{describeError(error)}</p>
			<button type="button" onClick={() => router.invalidate()}>
				Try again
			</button>
		</section>
	);
}
