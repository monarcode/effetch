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
