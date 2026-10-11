import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Logger from "effect/Logger";
import type * as LogLevel from "effect/LogLevel";
import * as References from "effect/References";

/** One entry written with `Effect.log*`. */
export interface LogEntry {
	readonly level: LogLevel.LogLevel;
	readonly message: ReadonlyArray<unknown>;
	readonly cause: Cause.Cause<unknown>;
}

export interface CapturedLogs {
	readonly entries: ReadonlyArray<LogEntry>;
	readonly capture: <A, E, R>(
		self: Effect.Effect<A, E, R>,
	) => Effect.Effect<A, E, R>;
}

/** Records every log entry, Debug included, of the effects it captures. */
export const captureLogs = (): CapturedLogs => {
	const entries: Array<LogEntry> = [];
	const logger = Logger.make<unknown, void>((options) => {
		entries.push({
			level: options.logLevel,
			message: Array.isArray(options.message)
				? options.message
				: [options.message],
			cause: options.cause,
		});
	});
	return {
		entries,
		capture: (self) =>
			self.pipe(
				Effect.provide(Logger.layer([logger])),
				Effect.provideService(References.MinimumLogLevel, "All"),
			),
	};
};
