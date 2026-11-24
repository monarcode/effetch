import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import {
	type CSSProperties,
	Fragment,
	type ReactNode,
	useId,
	useRef,
	useState,
} from "react";

import type { Example, TypedPath } from "@/lib/landing";

import { GetStarted, GITHUB, Install, SectionHead, Wordmark } from "./chrome";
import { breakable, CodeLine, CodeLines, effectOf, useSetIn } from "./code";
import {
	Caption,
	CompiledCall,
	Controls,
	LiveSignature,
	members,
	parts,
	Presets,
	slotsOf,
	SpecimenSignature,
	useTour,
	valuesOf,
} from "./specimen";

// --- The hero: the specimen -------------------------------------------------

export function Hero() {
	const ref = useRef<HTMLElement>(null);
	useTour(ref);
	return (
		<section
			ref={ref}
			aria-labelledby="pitch"
			// Phones: the pitch, the action, the signature, its controls, then
			// the install. From 1024px: the signature across the top band; the
			// controls in columns 1–7 below it, the pitch in 9–12.
			className="spec-column grid grid-cols-1 gap-x-6 pt-8 pb-20 sm:pt-10 lg:grid-cols-12 lg:pt-8 lg:pb-24"
		>
			<figure
				aria-label="The signature TypeScript infers for the call below, with the options set"
				className="order-3 m-0 mt-10 min-w-0 lg:order-none lg:col-span-12 lg:row-start-1 lg:mt-0"
			>
				<LiveSignature className="[--spec-size:clamp(28px,8.6vw,52px)] sm:[--spec-size:clamp(40px,6.1vw,68px)] lg:[--spec-size:clamp(60px,5.6vw,96px)]" />
				<figcaption className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-rule pt-4 lg:grid-cols-12">
					<Caption className="max-w-[60ch] text-[15px] leading-[1.5] text-steel sm:text-[16px] lg:col-span-7" />
					<CompiledCall className="lg:col-span-5 lg:col-start-8 lg:pl-6" />
				</figcaption>
			</figure>
			<div className="order-4 mt-10 grid min-w-0 grid-cols-1 gap-y-8 lg:order-none lg:col-span-7 lg:row-start-2 lg:mt-6">
				<Controls />
				<Presets />
			</div>
			{/* One column from 1024px; on phones its parts join the section's
			    flow around the specimen. */}
			<div className="contents lg:col-span-5 lg:col-start-8 lg:row-start-2 lg:mt-6 lg:flex lg:flex-col lg:pl-6">
				<h1
					id="pitch"
					className="order-1 max-w-[22ch] text-[1.625rem] leading-[1.08] font-bold tracking-[-0.02em] text-balance sm:text-[2.5rem] lg:order-none lg:text-[2.25rem]"
				>
					Typed HTTP calls for Effect, without the boilerplate.
				</h1>
				<div className="order-5 mt-12 lg:order-none lg:mt-5">
					<p className="max-w-[36ch] text-[17px] leading-[1.5] text-steel">
						Give Effetch a path and a schema, and you get back a fully
						typed Effect that tells you every way the call can fail.
					</p>
					<div className="mt-6 flex flex-col items-start gap-3">
						<Install />
						<div className="max-lg:hidden">
							<GetStarted />
						</div>
					</div>
				</div>
			</div>
			<div className="order-2 mt-6 lg:hidden">
				<GetStarted />
			</div>
		</section>
	);
}

// --- Typed paths ------------------------------------------------------------

/** A path set as a specimen: literal segments light, parameters heavy. */
function PathType({ path }: { path: string }) {
	return (
		<p className="spec-path" data-entrance="load">
			{path
				.split("/")
				.slice(1)
				.map((segment, i) => (
					<Fragment key={i}>
						{/* A line breaks only before a slash. */}
						<wbr />
						<span
							className="spec-seg"
							style={{ "--i": i } as CSSProperties}
						>
							<span className="spec-punct">/</span>
							{segment.startsWith(":") ? (
								<>
									<span className="spec-punct">:</span>
									<span className="spec-param">
										{segment.slice(1)}
									</span>
								</>
							) : (
								<span className="spec-literal">{segment}</span>
							)}
						</span>
					</Fragment>
				))}
		</p>
	);
}

/**
 * `"postId" | "userId"`, with its quotes and bars as punctuation. Each name
 * rises to its weight after the path's segments, one after another.
 */
function NamesType({ names }: { names: string }) {
	let n = 0;
	return (
		<span className="spec-names" data-entrance="load">
			{names.split(/("[^"]*")/).map((piece, i) =>
				piece.startsWith('"') ? (
					<span
						key={i}
						className="spec-set"
						style={{ "--i": n++ } as CSSProperties}
					>
						<span className="spec-punct">"</span>
						<span className="spec-name">{piece.slice(1, -1)}</span>
						<span className="spec-punct">"</span>
					</span>
				) : (
					<span key={i} className="spec-punct">
						{piece}
					</span>
				),
			)}
		</span>
	);
}

/** How many parameters a path has, from its compiled names. */
function countOf(names: string) {
	const count = names === "never" ? 0 : names.split("|").length;
	return count === 0 ? "none" : count === 1 ? "1 param" : `${count} params`;
}

/**
 * Typed paths: pick a path, and see the parameter names TypeScript reads
 * from it, a call that fills them in, and the error a wrong one gets. All
 * compiled from `site/landing/paths.ts`.
 */
export function Paths({ paths }: { paths: TypedPath[] }) {
	const [index, setIndex] = useState(2);
	const id = useId();
	const typed = paths[index]!;
	const { text, start, end } = typed.wrong;
	return (
		<section aria-labelledby="paths" className="spec-column py-20 sm:py-24">
			<SectionHead id="paths" title="The path is a type.">
				Every :name in a path is a parameter. TypeScript reads them from the
				string, so params needs exactly those names, and a path without any
				takes none.
			</SectionHead>
			<div className="mt-12 grid grid-cols-1 gap-x-6 gap-y-10 sm:mt-16 lg:grid-cols-12">
				<div className="min-w-0 lg:col-span-4">
					<p className="spec-label" id={id}>
						Paths
					</p>
					<div
						role="group"
						aria-labelledby={id}
						className="spec-path-list"
					>
						{paths.map((path, i) => (
							<button
								key={path.path}
								type="button"
								aria-pressed={i === index}
								onClick={() => setIndex(i)}
								className="spec-path-option"
							>
								<span className="min-w-0 flex-1">
									{breakable(path.path)}
								</span>
								<span className="spec-path-count">
									{countOf(path.names)}
								</span>
							</button>
						))}
					</div>
				</div>
				<div className="min-w-0 lg:col-span-8 lg:pl-8">
					<span className="sr-only" aria-live="polite">
						{`${typed.path}: params needs ${typed.names}.`}
					</span>
					<PathType key={typed.path} path={typed.path} />
					<dl className="spec-facts">
						<div className="spec-fact">
							<dt className="spec-label">params needs</dt>
							<dd>
								<NamesType key={typed.path} names={typed.names} />
							</dd>
						</div>
						<div className="spec-fact">
							<dt className="spec-label">Called right</dt>
							<dd className="min-w-0">
								<pre className="spec-code spec-code-flow text-[13px] leading-[1.7]">
									<code className="block">
										<CodeLine tokens={typed.call} />
									</code>
								</pre>
							</dd>
						</div>
						<div className="spec-fact">
							<dt className="spec-label">Called wrong</dt>
							<dd className="min-w-0">
								<pre className="spec-code spec-code-flow text-[13px] leading-[1.7] text-steel">
									<code className="block">
										<span
											className="spec-code-line block"
											style={{ "--indent": 0 } as CSSProperties}
										>
											{breakable(text.slice(0, start))}
											<span
												key={typed.path}
												className="spec-squiggle"
											>
												{breakable(text.slice(start, end))}
											</span>
											{breakable(text.slice(end))}
										</span>
									</code>
								</pre>
								<p className="spec-mono mt-2 text-[13px] leading-[1.6] text-paper">
									<span className="text-steel">
										TS{typed.error.code}{" "}
									</span>
									{breakable(typed.error.text)}
								</p>
							</dd>
						</div>
					</dl>
				</div>
			</div>
		</section>
	);
}

// --- Narrowing --------------------------------------------------------------

const STEPS = [
	{
		name: "call",
		title: "The call",
		text: "Its signature names every way it can fail: no response, a status outside 200–299, or a body that doesn't match.",
	},
	{
		name: "found",
		title: "Fetch.optional",
		text: "A 404 becomes Option.none(), so the value becomes an Option. Other statuses still fail: HttpError stays.",
	},
	{
		name: "settled",
		title: "Effect.catchTags",
		text: "Catch errors by tag. The ones you handle leave the signature; the rest stay for code further up.",
	},
] as const;

/**
 * One call's errors narrowing, on a slider with a stop per step: the code,
 * and the signature TypeScript infers at each step, with the handled
 * errors closing out of it.
 */
export function Narrowing({ example }: { example: Example }) {
	const steps = STEPS.map((step) => ({
		...step,
		effect: effectOf(example, step.name),
		line: example.bones.find((bone) => bone.name === step.name)!.line,
	}));
	const effects = steps.map((step) => step.effect);
	const values = valuesOf(effects);
	const slots = slotsOf(
		steps[0]!.effect.errors.map((error) => parts(error).name),
		effects,
	);
	const [index, setIndex] = useState(0);
	const step = steps[index]!;
	const from = step.line;
	const to = (steps[index + 1]?.line ?? example.lines.length) - 1;
	const id = useId();

	return (
		<section
			aria-labelledby="narrowing"
			className="spec-column py-20 sm:py-24"
		>
			<SectionHead
				id="narrowing"
				title="Every failure has a name, until you handle it."
			>
				Move the slider through one call. At each stop, the signature is the
				one TypeScript infers, and the errors handled so far close out of
				it.
			</SectionHead>
			<div className="mt-12 grid grid-cols-1 gap-x-6 gap-y-10 sm:mt-16 lg:grid-cols-12">
				<div className="min-w-0 lg:col-span-5">
					<label htmlFor={id} className="spec-label">
						Step
					</label>
					<input
						id={id}
						type="range"
						min={0}
						max={steps.length - 1}
						step={1}
						value={index}
						aria-valuetext={`${step.title}: ${step.text}`}
						onChange={(event) => setIndex(Number(event.target.value))}
						className="spec-range mt-3"
					/>
					<ol className="mt-1 grid grid-cols-3" aria-hidden="true">
						{steps.map((s, i) => (
							<li
								key={s.name}
								className={
									i === 0
										? ""
										: i === steps.length - 1
											? "text-right"
											: "text-center"
								}
							>
								<button
									type="button"
									tabIndex={-1}
									onClick={() => setIndex(i)}
									className={`spec-mono inline-flex min-h-11 items-center text-[12px] transition-colors duration-150 sm:text-[13px] ${i === index ? "text-paper" : "text-steel hover:text-paper"}`}
								>
									{s.title}
								</button>
							</li>
						))}
					</ol>
					<pre className="spec-code spec-code-wrap mt-6 overflow-x-auto text-[12px] leading-[1.8] sm:text-[13.5px]">
						<code className="block">
							{example.lines.map((line, i) => (
								<CodeLine
									key={i}
									tokens={line}
									className={
										i >= from && i <= to ? "" : "spec-code-quiet"
									}
								/>
							))}
						</code>
					</pre>
				</div>
				<div className="min-w-0 lg:col-span-7 lg:col-start-6 lg:pl-8">
					<SpecimenSignature
						values={values}
						slots={slots}
						effect={step.effect}
						className="[--spec-size:clamp(22px,6.2vw,48px)] lg:[--spec-size:clamp(34px,3.4vw,52px)]"
					/>
					<p
						className="mt-6 max-w-[52ch] border-t border-rule pt-4 text-[15px] leading-[1.5] text-steel sm:text-[17px]"
						aria-live="polite"
					>
						{step.text}
					</p>
				</div>
			</div>
		</section>
	);
}

// --- The comparison ---------------------------------------------------------

/**
 * What each error in the comparison stands for. HttpClient puts three
 * failures under one tag; Effetch gives each its own. From Effect's
 * `HttpClientError` reasons and the errors guide.
 */
const FAILURES: Record<string, string> = {
	HttpClientError:
		"No response, a status outside 200–299, or a body that isn't JSON: three failures under one tag.",
	SchemaError: "A JSON body that doesn't match Todo.",
	DecodeError: "A 2xx body that isn't JSON or doesn't match Todo.",
	NetworkError: "No response: offline, DNS failure, connection refused, CORS.",
	HttpError: "A status outside 200–299, with its headers and body.",
	HttpClient: "Needs an HttpClient layer before it runs.",
	never: "Needs nothing more to run.",
};

function Specimen({
	title,
	example,
	delay = 0,
}: {
	title: string;
	example: Example;
	/** How long its signature waits to set in, in milliseconds. */
	delay?: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useSetIn(ref);
	const effect = effectOf(example, "getTodo");
	const rows = [...effect.errors, effect.context];
	return (
		<article className="flex min-w-0 flex-col border-t border-rule pt-6">
			<h3 className="text-[19px] font-semibold">{title}</h3>
			<pre className="spec-code spec-code-wrap mt-5 overflow-x-auto text-[12px] leading-[1.8] sm:text-[13px]">
				<CodeLines lines={example.lines} />
			</pre>
			<div
				ref={ref}
				className="mt-8 border-t border-rule pt-6"
				style={{ "--set-delay": `${delay}ms` } as CSSProperties}
			>
				<SpecimenSignature
					values={members(effect.value)}
					slots={slotsOf(
						effect.errors.map((error) => parts(error).name),
						[effect],
					)}
					effect={effect}
					className="[--spec-size:clamp(22px,6.2vw,38px)] lg:[--spec-size:clamp(30px,2.5vw,38px)]"
				/>
			</div>
			<dl className="mt-8 border-b border-rule">
				{rows.map((row) => (
					<div
						key={row}
						className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-rule py-3 sm:grid-cols-[minmax(0,13rem)_1fr]"
					>
						<dt className="spec-mono text-[13px] leading-[1.5] text-paper">
							{row}
						</dt>
						<dd className="text-[15px] leading-[1.5] text-steel">
							{FAILURES[row] ?? ""}
						</dd>
					</div>
				))}
			</dl>
		</article>
	);
}

export function Compare({
	byHand,
	withEffetch,
}: {
	byHand: Example;
	withEffetch: Example;
}) {
	return (
		<section aria-labelledby="compare" className="spec-column py-20 sm:py-24">
			<SectionHead id="compare" title="The same request, two signatures.">
				Both send the same request and decode the same response. With
				HttpClient, three failures share one tag. With Effetch, each has its
				own.
			</SectionHead>
			<div className="mt-12 grid grid-cols-1 gap-x-6 gap-y-16 sm:mt-16 lg:grid-cols-2 lg:gap-x-12">
				<Specimen title="With HttpClient alone" example={byHand} />
				<Specimen title="With Effetch" example={withEffetch} delay={200} />
			</div>
		</section>
	);
}

// --- Specifications ---------------------------------------------------------

const GUIDES = [
	{ title: "Plugins", splat: "plugins" },
	{ title: "Endpoints", splat: "endpoints" },
	{ title: "Streaming responses", splat: "streaming" },
	{ title: "Pagination", splat: "pagination" },
	{ title: "Testing", splat: "testing" },
	{ title: "Uploads", splat: "calls/uploads" },
] as const;

const RUNTIMES = ["Browsers", "React Native", "Node.js 20+", "Bun", "Deno"];

function Spec({ term, children }: { term: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-rule py-5 lg:grid-cols-12">
			<dt className="spec-mono text-[13px] leading-[1.6] text-steel lg:col-span-3">
				{term}
			</dt>
			<dd className="min-w-0 text-[17px] leading-[1.5] lg:col-span-9">
				{children}
			</dd>
		</div>
	);
}

export function Specifications({ version }: { version: string }) {
	return (
		<section aria-labelledby="specs" className="spec-column py-20 sm:py-24">
			<SectionHead id="specs" title="Specifications.">
				Where it runs, what it's built on, and where to read about the rest.
			</SectionHead>
			<dl className="mt-12 border-b border-rule sm:mt-16">
				<Spec term="Runs on">
					<ul className="flex flex-wrap gap-x-[0.4em] text-[clamp(1.75rem,4.4vw,3.5rem)] leading-[1.1] font-semibold tracking-[-0.02em]">
						{RUNTIMES.map((runtime, i) => (
							<li key={runtime} className="whitespace-nowrap">
								{runtime}
								{i < RUNTIMES.length - 1 && (
									<span className="font-light text-steel"> /</span>
								)}
							</li>
						))}
					</ul>
					<p className="mt-3 max-w-[56ch] text-[15px] text-steel">
						Built for each of them: no Node.js modules and no{" "}
						<code className="spec-mono text-[0.92em] text-paper">
							new URL()
						</code>
						, so it runs on Hermes too. CI tests on Node.js 24.
					</p>
				</Spec>
				<Spec term="Built on">Effect v4's HttpClient and Schema.</Spec>
				<Spec term="Status">
					A release candidate,{" "}
					<span className="spec-mono text-[0.9em]">{version}</span>, on the
					way to 0.1.0. When a release candidate changes the API, the
					changelog says what to change in your code.
				</Spec>
				<Spec term="Checked">
					Every example in the docs and the README is compiled against the
					package, and so is every signature on this page.
				</Spec>
				<Spec term="License">MIT</Spec>
				<Spec term="Guides">
					<ul className="flex flex-wrap gap-x-7 gap-y-1">
						{GUIDES.map((guide) => (
							<li key={guide.title}>
								<Link
									to="/docs/$"
									params={{ _splat: guide.splat }}
									className="group inline-flex min-h-11 items-center gap-1.5 underline decoration-rule decoration-1 underline-offset-[0.3em] transition-colors duration-150 hover:decoration-paper"
								>
									{guide.title}
									<ArrowUpRight
										className="size-4 text-steel transition-[color,translate] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-paper"
										strokeWidth={1.75}
										aria-hidden="true"
									/>
								</Link>
							</li>
						))}
					</ul>
				</Spec>
			</dl>
		</section>
	);
}

// --- The close, the footer --------------------------------------------------

export function Closing() {
	const ref = useRef<HTMLHeadingElement>(null);
	useSetIn(ref);
	return (
		<section
			aria-labelledby="closing"
			className="spec-column pt-12 pb-24 sm:pt-16 sm:pb-32"
		>
			<div className="grid grid-cols-1 gap-x-6 gap-y-10 border-t border-rule pt-10 lg:grid-cols-12 lg:pt-14">
				<h2 ref={ref} id="closing" className="spec-closing lg:col-span-8">
					<span className="spec-closing-light">Set the options.</span>{" "}
					<span
						className="spec-closing-heavy spec-set"
						style={{ "--i": 0 } as CSSProperties}
					>
						Read the type.
					</span>
				</h2>
				<div className="flex flex-col items-start gap-3 lg:col-span-4 lg:col-start-9 lg:self-end">
					<Install />
					<GetStarted />
				</div>
			</div>
		</section>
	);
}

const FOOTER = [
	{ label: "Docs", splat: "" },
	{ label: "Reference", splat: "reference" },
	{ label: "Coming from axios or ky", splat: "coming-from-axios-or-ky" },
	{ label: "Examples", splat: "examples" },
];

const footerLink =
	"inline-flex min-h-11 items-center transition-colors duration-150 hover:text-paper";

export function Footer() {
	return (
		<footer className="spec-column pb-10">
			<div className="flex flex-col gap-8 border-t border-rule pt-8 sm:flex-row sm:items-start sm:justify-between">
				<Wordmark />
				<ul className="flex flex-wrap gap-x-6 gap-y-1 text-[15px] text-steel">
					{FOOTER.map((item) => (
						<li key={item.label}>
							<Link
								to="/docs/$"
								params={{ _splat: item.splat }}
								className={footerLink}
							>
								{item.label}
							</Link>
						</li>
					))}
					<li>
						<a href={GITHUB} className={footerLink}>
							GitHub
						</a>
					</li>
					<li>
						<a
							href="https://www.npmjs.com/package/@monarcode/effetch"
							className={footerLink}
						>
							npm
						</a>
					</li>
					<li>
						<a href="/llms.txt" className={footerLink}>
							llms.txt
						</a>
					</li>
				</ul>
			</div>
			<p className="mt-6 text-[14px] text-steel">MIT License.</p>
		</footer>
	);
}
