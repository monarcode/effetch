import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import { Fetch } from "@monarcode/effetch";

// The backend's error body, for responses that aren't one of the errors
// below.
const ApiError = Schema.Struct({ code: Schema.String, message: Schema.String });

// The app's own errors. The backend never sends a `_tag`: Effetch adds it
// before decoding, so plain `Schema.TaggedError` classes work.

/** A 401 from any endpoint: the session is over. */
export class SessionExpired extends Schema.TaggedError<SessionExpired>()(
	"SessionExpired",
	{ message: Schema.String },
) {}

/** A 429 from any endpoint. */
export class RateLimited extends Schema.TaggedError<RateLimited>()(
	"RateLimited",
	{ retryAfter: Schema.Finite },
) {}

/** A 404 from the todo endpoints. */
export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
	"TodoNotFound",
	{ message: Schema.String },
) {}

// Two 400s from `POST /todos/:id/assignees`, told apart by their literal
// `code`. Any other 400 stays an `HttpError`.

export class UnknownUser extends Schema.TaggedError<UnknownUser>()(
	"UnknownUser",
	{ code: Schema.Literal("UNKNOWN_USER"), message: Schema.String },
) {}

export class AlreadyAssigned extends Schema.TaggedError<AlreadyAssigned>()(
	"AlreadyAssigned",
	{
		code: Schema.Literal("ALREADY_ASSIGNED"),
		message: Schema.String,
		assignee: Schema.String,
	},
) {}

/** A 409 from `GET /reports/:id`, while the report is being built. */
export class ReportNotReady extends Schema.TaggedError<ReportNotReady>()(
	"ReportNotReady",
	{ message: Schema.String },
) {}

const Todo = Schema.Struct({
	id: Schema.Finite,
	title: Schema.String,
	assignees: Schema.Array(Schema.String),
});

const Report = Schema.Struct({ url: Schema.String });

// --- For every call: the client's map ---

export class Api extends Fetch.Service<Api>()("examples/status-errors/Api", {
	baseUrl: "https://api.example.com",
	defaultError: ApiError,
	// What these statuses mean from any endpoint. The backend sends
	// `retry_after_seconds`; `encodeKeys` reads it into `retryAfter`.
	statusErrors: {
		401: SessionExpired,
		429: RateLimited.pipe(
			Schema.encodeKeys({ retryAfter: "retry_after_seconds" }),
		),
	},
}) {}

// --- For every call to an endpoint: the endpoint's map ---

export const getTodo = Fetch.endpoint("GET /todos/:id", {
	output: Todo,
	statusErrors: { 404: TodoNotFound },
});

export const assign = Fetch.endpoint("POST /todos/:id/assignees", {
	input: Schema.Struct({ userId: Schema.String }),
	output: Todo,
	// A list is tried in order: the first that decodes the body wins.
	statusErrors: {
		404: TodoNotFound,
		400: [UnknownUser, AlreadyAssigned],
	},
});

export class TodoApi extends Fetch.Endpoints<TodoApi>()(
	"examples/status-errors/TodoApi",
	Api,
	{ get: getTodo, assign },
) {}

// `provideMerge` keeps `Api` available too, for `report`'s one-off call.
export const AppLayer = TodoApi.layer.pipe(
	Layer.provideMerge(Api.layer),
	Layer.provide(FetchHttpClient.layer),
);

// --- For one call: the call's map ---

export const report = (id: number) =>
	Effect.gen(function* () {
		const api = yield* Api;
		return yield* api.get("/reports/:id", {
			params: { id },
			output: Report,
			statusErrors: { 409: ReportNotReady },
		});
	});

// --- Using them ---

// A missing todo is `undefined`; every other error stays in the type, for
// the caller to handle.
export const findTodo = (id: number) =>
	Effect.gen(function* () {
		const todos = yield* TodoApi;
		return yield* todos.get({ params: { id } });
	}).pipe(Effect.catchTag("TodoNotFound", () => Effect.undefined));

// Each error comes with its own fields: `assignee` is typed and decoded.
export const assignTo = (id: number, userId: string) =>
	Effect.gen(function* () {
		const todos = yield* TodoApi;
		return yield* todos.assign({ params: { id }, body: { userId } });
	}).pipe(
		Effect.catchTags({
			AlreadyAssigned: (error) =>
				Effect.fail(`Already assigned to ${error.assignee}`),
			UnknownUser: (error) => Effect.fail(error.message),
		}),
	);

export const program = Effect.gen(function* () {
	const todo = yield* findTodo(1);
	if (todo === undefined) {
		return "No todo 1";
	}
	yield* assignTo(todo.id, "u_ada");
	const { url } = yield* report(todo.id).pipe(
		Effect.retry({
			while: (error) => error._tag === "ReportNotReady",
			schedule: Schedule.spaced("2 seconds"),
			times: 3,
		}),
	);
	return url;
}).pipe(
	Effect.catchTags({
		SessionExpired: () => Effect.fail("Please sign in again"),
		RateLimited: (error) =>
			Effect.fail(`Too many requests: try again in ${error.retryAfter}s`),
		ReportNotReady: () => Effect.fail("The report isn't ready yet"),
		TodoNotFound: (error) => Effect.fail(error.message),
		// Whatever the maps don't cover is still an HttpError.
		HttpError: (error) =>
			Effect.fail(error.body?.message ?? `HTTP ${error.status}`),
		NetworkError: () => Effect.fail("You appear to be offline"),
		DecodeError: (error) =>
			Effect.fail(`Unexpected response: ${error.message}`),
	}),
);

export const main = program.pipe(Effect.provide(AppLayer));
