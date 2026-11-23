import {
	type CSSProperties,
	createContext,
	type ReactNode,
	type RefObject,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import type { Combo, EffectParts, Specimen } from "@/lib/landing";

import { onScreen } from "./code";

// --- State ------------------------------------------------------------------

/** The specimen's options: the call's and the client's. */
export type Options = Pick<Combo, "output" | "error" | "retry" | "timeout">;
type Option = keyof Options;
const OPTIONS: Option[] = ["output", "error", "retry", "timeout"];

const START: Options = {
	output: true,
	error: false,
	retry: false,
	timeout: false,
};

const same = (a: Options, b: Options) =>
	OPTIONS.every((key) => a[key] === b[key]);

type SpecimenState = {
	specimen: Specimen;
	options: Options;
	combo: Combo;
	/** What the last change did, for the caption. */
	change: string;
	/** What a screen reader hears: only a change someone made. */
	announced: string;
	/** Sets the options. A change someone made is announced; the tour's isn't. */
	set: (options: Options, change: string, announce?: boolean) => void;
	toggle: (option: Option) => void;
	/** Whether someone has touched the specimen; the tour stops for good. */
	touched: boolean;
};

const Context = createContext<SpecimenState | null>(null);

export function useSpecimen() {
	const state = useContext(Context);
	if (!state) throw new Error("useSpecimen outside SpecimenProvider");
	return state;
}

export function comboOf(specimen: Specimen, options: Options) {
	const combo = specimen.combos.find((c) => same(c, options));
	if (!combo) throw new Error("No compiled combination for these options");
	return combo;
}

/** What turning an option on or off does, from the compiled types. */
function changeOf(specimen: Specimen, option: Option, on: boolean) {
	const raw = comboOf(specimen, { ...START, output: false }).effect.value;
	switch (option) {
		case "output":
			return on
				? "output decodes the body: the call succeeds with a Todo, and DecodeError joins the errors."
				: `Without output, nothing is decoded: the call succeeds with the ${raw} itself, and DecodeError leaves.`;
		case "error":
			return on
				? "error decodes the body of a status outside 200–299: HttpError's body is typed ApiError."
				: "Without an error schema, HttpError's body is unknown.";
		case "timeout":
			return on
				? "timeout() on the client adds TimeoutError to every call it makes."
				: "Without timeout(), no call can fail with TimeoutError.";
		case "retry":
			return on
				? "retry() sends a failed request again. The signature doesn't change: what can fail is the same."
				: "Without retry(), a failed request isn't sent again. The signature doesn't change.";
	}
}

export const DEFAULT_CHANGE =
	"Switch an option. The signature is the type TypeScript infers for that exact call.";

export function SpecimenProvider({
	specimen,
	children,
}: {
	specimen: Specimen;
	children: ReactNode;
}) {
	const [options, setOptions] = useState(START);
	const [change, setChange] = useState(DEFAULT_CHANGE);
	const [announced, setAnnounced] = useState("");
	const [touched, setTouched] = useState(false);
	const set = useCallback((next: Options, why: string, announce = true) => {
		setOptions(next);
		setChange(why);
		if (announce) {
			setAnnounced(why);
			setTouched(true);
		}
	}, []);
	const toggle = useCallback(
		(option: Option) => {
			const next = { ...options, [option]: !options[option] };
			set(next, changeOf(specimen, option, next[option]));
		},
		[options, set, specimen],
	);
	const state = useMemo(
		() => ({
			specimen,
			options,
			combo: comboOf(specimen, options),
			change,
			announced,
			set,
			toggle,
			touched,
		}),
		[specimen, options, change, announced, set, toggle, touched],
	);
	return <Context.Provider value={state}>{children}</Context.Provider>;
}

// --- The signature, set as a specimen ---------------------------------------

/**
 * A part that can leave: present, it takes its width and its weight; gone,
 * it thins to a hairline as its width closes to nothing, on the same beat.
 */
function Member({
	on,
	className = "",
	children,
}: {
	on: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<span className={`spec-m ${className}`} data-on={on}>
			<span className="spec-m-in">{children}</span>
		</span>
	);
}

/** A type's text, with its angle brackets set as punctuation. */
function TypeText({ text }: { text: string }) {
	return text.split(/([<>])/).map((piece, i) =>
		piece === "<" || piece === ">" ? (
			<span key={i} className="spec-punct">
				{piece}
			</span>
		) : (
			piece
		),
	);
}

/** An error's name and its type argument: `HttpError.With`, `unknown`. */
export function parts(error: string) {
	const open = error.indexOf("<");
	return open < 0
		? { name: error, argument: undefined }
		: { name: error.slice(0, open), argument: error.slice(open + 1, -1) };
}

/** Every error a signature can carry, with every type argument it takes. */
export type ErrorSlot = { name: string; arguments: string[] };

/** The text a screen reader reads for a signature. */
export function spoken(effect: EffectParts) {
	return `Effect<${effect.value}, ${effect.errors.join(" | ")}, ${effect.context}>`;
}

/** Splits a union at its top level: `A | B<C | D>` is `A` and `B<C | D>`. */
export function members(type: string) {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < type.length; i++) {
		const char = type[i]!;
		if ("<{([".includes(char)) depth++;
		else if (">})]".includes(char) && type[i - 1] !== "=") depth--;
		else if (depth === 0 && type.startsWith(" | ", i)) {
			out.push(type.slice(start, i));
			start = i + 3;
			i += 2;
		}
	}
	out.push(type.slice(start));
	return out;
}

/**
 * Every member a set of values has, in an order each value's union keeps,
 * so a member never moves when another enters or leaves.
 */
export function valuesOf(effects: EffectParts[]) {
	const order: string[] = [];
	for (const effect of effects) {
		const pieces = members(effect.value);
		pieces.forEach((piece, i) => {
			if (order.includes(piece)) return;
			const before = pieces
				.slice(i + 1)
				.find((next) => order.includes(next));
			order.splice(
				before === undefined ? order.length : order.indexOf(before),
				0,
				piece,
			);
		});
	}
	return order;
}

/**
 * A signature in the specimen face, as one flowing line: `Effect<`, the
 * value, the errors, the context. Every member a set of combinations has
 * is set; the ones this combination lacks are closed, so a change of
 * options reads as members leaving and arriving in place. A bar leads each
 * member after the first, and a line breaks only before a bar.
 *
 * - `values`: every member of every value, in an order each union keeps.
 * - `slots`: every error, in an order each union keeps.
 */
export function SpecimenSignature({
	values,
	slots,
	effect,
	entrance,
	className = "",
}: {
	values: string[];
	slots: ErrorSlot[];
	effect: EffectParts;
	/** `load` sets it in from the first paint, in CSS alone. */
	entrance?: "load" | undefined;
	className?: string;
}) {
	const ref = useRef<HTMLParagraphElement>(null);
	const pieces = members(effect.value);
	const shownValues = values.filter((value) => pieces.includes(value));
	const present: Record<string, string | undefined> = Object.fromEntries(
		effect.errors.map((error) => [parts(error).name, parts(error).argument]),
	);
	const shown = slots.filter((slot) => slot.name in present);

	// Once a change of weight has run, repaint the whole signature: a glyph
	// that thins can leave a sliver of its bolder ink behind otherwise.
	const key = spoken(effect);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const timer = setTimeout(() => {
			element.dataset.repaint = element.dataset.repaint === "a" ? "b" : "a";
		}, 620);
		return () => clearTimeout(timer);
	}, [key]);

	let i = 0;
	const next = () => ({ "--i": i++ }) as CSSProperties;
	return (
		<p ref={ref} className={`spec-sig ${className}`} data-entrance={entrance}>
			<span className="sr-only">{key}</span>
			<span aria-hidden="true">
				{values.map((value, n) => {
					const on = pieces.includes(value);
					return (
						<span
							key={value}
							className="spec-set spec-hold"
							style={next()}
						>
							{n === 0 && (
								<>
									<span className="spec-punct">Effect&lt;</span>
									{/* Only a phone's line is too narrow to keep it with the
									    value: a zero-width space, which nowrap holds, where a
									    <wbr> breaks regardless. */}
									{"\u200B"}
								</>
							)}
							<span className="spec-pair">
								<Member
									on={on && shownValues[0] !== value}
									className="spec-bar"
								>
									<span className="spec-bar-glyph">|</span>
								</Member>
								<Member on={on} className="spec-value">
									<TypeText text={value} />
								</Member>
								{/* The comma follows whichever member is last. */}
								<Member on={shownValues.at(-1) === value}>
									<span className="spec-punct">,</span>
								</Member>
							</span>
							<wbr />
						</span>
					);
				})}{" "}
				{slots.map((slot, n) => {
					const on = slot.name in present;
					const first = shown[0]?.name === slot.name;
					const last = n === slots.length - 1;
					const comma = last && <span className="spec-punct">,</span>;
					return (
						<span key={slot.name} className="spec-set" style={next()}>
							<span
								className="spec-hold spec-hold-error"
								data-bar={on && !first}
							>
								<span className="spec-pair">
									<Member on={on && !first} className="spec-bar">
										<span className="spec-bar-glyph">|</span>
									</Member>
									<Member on={on} className="spec-error">
										{slot.name}
									</Member>
									{slot.arguments.length === 0 && comma}
								</span>
								{/* Only a phone's line may break before a type argument. */}
								{slot.arguments.length > 0 && (
									<>
										{"\u200B"}
										<span className="spec-pair spec-error">
											<Member on={on}>
												<span className="spec-punct">&lt;</span>
											</Member>
											{slot.arguments.map((a) => (
												<Member
													key={a}
													on={present[slot.name] === a}
												>
													{a}
												</Member>
											))}
											<Member on={on}>
												<span className="spec-punct">&gt;</span>
											</Member>
											{comma}
										</span>
									</>
								)}
							</span>
							<wbr />
						</span>
					);
				})}{" "}
				<span className="spec-set spec-pair" style={next()}>
					<span className="spec-context">{effect.context}</span>
					<span className="spec-punct">&gt;</span>
				</span>
			</span>
		</p>
	);
}

/** Every error a set of signatures carries, in the order `names` gives. */
export function slotsOf(names: string[], effects: EffectParts[]): ErrorSlot[] {
	return names.map((name) => ({
		name,
		arguments: [
			...new Set(
				effects.flatMap((effect) =>
					effect.errors
						.map(parts)
						.filter((error) => error.name === name)
						.flatMap((error) =>
							error.argument === undefined ? [] : [error.argument],
						),
				),
			),
		],
	}));
}

/**
 * The specimen's signature, for the options in hand. Every distinct
 * signature is set beneath it, unseen, so its box is always as tall as the
 * tallest, and the controls below it never move.
 */
export function LiveSignature({
	still = false,
	className = "",
}: {
	/** Set without the entrance. */
	still?: boolean;
	className?: string;
}) {
	const { specimen, combo } = useSpecimen();
	const effects = specimen.combos.map((c) => c.effect);
	const distinct = [
		...new Map(effects.map((effect) => [spoken(effect), effect])).values(),
	];
	return (
		<div className={`grid ${className}`}>
			{distinct.map((effect) => (
				<SpecimenSignature
					key={spoken(effect)}
					values={members(effect.value)}
					slots={slotsOf(
						effect.errors.map((error) => parts(error).name),
						[effect],
					)}
					effect={effect}
					className="spec-ghost col-start-1 row-start-1"
				/>
			))}
			<SpecimenSignature
				values={valuesOf(effects)}
				slots={slotsOf(specimen.errors, effects)}
				effect={combo.effect}
				entrance={still ? undefined : "load"}
				className="col-start-1 row-start-1"
			/>
		</div>
	);
}

// --- The controls -----------------------------------------------------------

/** A switch, set into a line of code. */
function Switch({ option, children }: { option: Option; children: ReactNode }) {
	const { options, toggle } = useSpecimen();
	return (
		<button
			type="button"
			role="switch"
			aria-checked={options[option]}
			onClick={() => toggle(option)}
			className="spec-switch"
		>
			<span className="spec-switch-track" aria-hidden="true">
				<span className="spec-switch-knob" />
			</span>
			<code className="spec-switch-code">{children}</code>
		</button>
	);
}

/** The call's options and the client's plugins, as their code. */
export function Controls({ className = "" }: { className?: string }) {
	const { specimen } = useSpecimen();
	// The plugins as the compiled client writes them.
	const both = specimen.combos.find((c) => c.retry && c.timeout)!.plugins;
	const [retry, timeout] = both.slice(1, -1).split(/, (?=timeout)/);
	return (
		<div className={`spec-controls ${className}`}>
			<fieldset className="min-w-0">
				<legend className="spec-label">The call</legend>
				<div className="spec-code-block">
					<div className="spec-code-fixed">
						api.get(<span className="text-paper">"/todos/:id"</span>,{" "}
						{"{"}
					</div>
					<div className="spec-switch spec-switch-fixed">
						<span className="spec-switch-track" aria-hidden="true">
							<span className="spec-switch-knob" />
						</span>
						<code className="spec-switch-code">params: {"{ id }"},</code>
						<span className="sr-only">(the path requires it)</span>
					</div>
					<Switch option="output">output: Todo,</Switch>
					<Switch option="error">error: ApiError,</Switch>
					<div className="spec-code-fixed">{"})"}</div>
				</div>
			</fieldset>
			<fieldset className="min-w-0">
				<legend className="spec-label">The client's plugins</legend>
				<div className="spec-code-block">
					<div className="spec-code-fixed">
						Fetch.make({"{ plugins: ["}
					</div>
					<Switch option="retry">{retry},</Switch>
					<Switch option="timeout">{timeout},</Switch>
					<div className="spec-code-fixed">{"] })"}</div>
				</div>
			</fieldset>
		</div>
	);
}

const PRESETS: {
	label: string;
	adds: string;
	options: Options;
	why: string;
}[] = [
	{
		label: "Raw",
		adds: "no schemas",
		options: { output: false, error: false, retry: false, timeout: false },
		why: "Raw: no schemas and no plugins. The call succeeds with the response itself.",
	},
	{
		label: "Decoded",
		adds: "+ output",
		options: START,
		why: "Decoded: output types the value as Todo, and DecodeError joins the errors.",
	},
	{
		label: "Error body",
		adds: "+ error",
		options: { output: true, error: true, retry: false, timeout: false },
		why: "Error body: an error schema types the body HttpError carries.",
	},
	{
		label: "Guarded",
		adds: "+ plugins",
		options: { output: true, error: true, retry: true, timeout: true },
		why: "Guarded: retry and timeout on the client. retry changes nothing; TimeoutError joins.",
	},
];

/** Named instances: a set of options each. */
export function Presets({ className = "" }: { className?: string }) {
	const { options, set } = useSpecimen();
	return (
		<div className={className}>
			<p className="spec-label" id="presets">
				Instances
			</p>
			<div role="group" aria-labelledby="presets" className="spec-presets">
				{PRESETS.map((preset) => (
					<button
						key={preset.label}
						type="button"
						aria-pressed={same(options, preset.options)}
						onClick={() => set(preset.options, preset.why)}
						className="spec-preset"
					>
						<span className="block">{preset.label}</span>
						<span className="spec-preset-adds">{preset.adds}</span>
					</button>
				))}
			</div>
		</div>
	);
}

/** The call and the client the options in hand compile to, as written. */
export function CompiledCall({ className = "" }: { className?: string }) {
	const { combo } = useSpecimen();
	return (
		<p className={`spec-compiled ${className}`}>
			<code>
				<span className="text-steel">plugins: </span>
				{combo.plugins}
				<br />
				{combo.call}
			</code>
		</p>
	);
}

/** What the last change did. */
export function Caption({ className = "" }: { className?: string }) {
	const { change, announced } = useSpecimen();
	return (
		<>
			<p className={className}>{change}</p>
			<span className="sr-only" aria-live="polite">
				{announced}
			</span>
		</>
	);
}

/**
 * Once the specimen is on screen, step through the instances, as a type
 * specimen cycles its weights, then rest where it started. Stops for good
 * when someone touches it. Not under reduced motion.
 */
export function useTour(ref: RefObject<HTMLElement | null>) {
	const { set, touched } = useSpecimen();
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	useEffect(() => {
		const stop = () => {
			for (const timer of timers.current) clearTimeout(timer);
			timers.current = [];
		};
		if (touched) return stop();
		const element = ref.current;
		if (!element) return;
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const steps = [PRESETS[2]!, PRESETS[3]!, PRESETS[0]!];
		const start = () => {
			steps.forEach((preset, n) => {
				timers.current.push(
					setTimeout(
						() => set(preset.options, preset.why, false),
						2400 + n * 2800,
					),
				);
			});
			timers.current.push(
				setTimeout(
					() => set(START, DEFAULT_CHANGE, false),
					2400 + steps.length * 2800,
				),
			);
		};
		if (onScreen(element)) {
			start();
			return stop;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				start();
			},
			{ threshold: 0.4 },
		);
		observer.observe(element);
		return () => {
			observer.disconnect();
			stop();
		};
	}, [ref, set, touched]);
}
