import * as Schema from "effect/Schema";

export const Balance = Schema.Struct({
	amount: Schema.Finite,
	currency: Schema.String,
});
export type Balance = typeof Balance.Type;

export const Transfer = Schema.Struct({
	from: Schema.String,
	to: Schema.String,
	amount: Schema.Finite,
});
export type Transfer = typeof Transfer.Type;

export const Receipt = Schema.Struct({ id: Schema.String });
export type Receipt = typeof Receipt.Type;

/**
 * A 422 from `POST /transfers` with `"error": "LIMIT_EXCEEDED"`. The wallet
 * backend names its code `error`; `encodeKeys` reads it into `code`.
 */
export class TransferLimitExceeded extends Schema.TaggedError<TransferLimitExceeded>()(
	"TransferLimitExceeded",
	{ code: Schema.Literal("LIMIT_EXCEEDED"), reason: Schema.String },
) {}

export const TransferLimitExceededBody = TransferLimitExceeded.pipe(
	Schema.encodeKeys({ code: "error" }),
);
