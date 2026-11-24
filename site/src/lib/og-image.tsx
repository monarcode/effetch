/**
 * The link-preview images, drawn with Takumi in the type specimen world:
 * ink, paper and steel, with lime for the mark and the value. Import it
 * from server code only.
 */
import recursive from "@fontsource-variable/recursive/files/recursive-latin-full-normal.woff2?inline";
import type { ReactNode } from "react";
import { render } from "takumi-js";

import { IMAGE_AS_BASE64, OG_SIZE } from "./og";
import { SITE_URL } from "./shared";

const INK = "#16171d";
const PAPER = "#ecedf1";
const STEEL = "#8a8d99";
const LIME = "#d5f70d";
const RULE = "#2a2c36";

/** Recursive, every axis: weight from the hairline to 1000, and MONO. */
const FONTS = [
	{
		name: "Recursive Variable",
		data: Uint8Array.from(
			atob(recursive.slice(recursive.indexOf(",") + 1)),
			(c) => c.charCodeAt(0),
		),
	},
];

const MONO = { fontVariationSettings: "'MONO' 1" } as const;

/** The site's host, as a reader would type it. */
const HOST = SITE_URL.replace(/^https?:\/\//, "");

/** The brace-and-dot, in lime, from `landing/mark.tsx`. */
function Mark({ height }: { height: number }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 389 447"
			width={(height * 389) / 447}
			height={height}
		>
			<path
				fill={LIME}
				d="M228.706 310.99L139.78 301.061L158.113 319.394L228.506 349.98C226.34 387.533 210.479 411.042 180.922 420.506L189.796 446.674C216.343 439.089 236.443 426.726 250.096 409.584C263.9 392.442 270.803 369.612 270.803 341.093V295.128C270.803 258.266 286.883 239.834 319.042 239.834V206.84C286.883 206.84 270.803 188.712 270.803 152.456V104.672C270.651 76.6074 263.824 54.0803 250.323 37.0901C236.822 19.9483 216.646 7.58491 189.796 1.52588e-05L181.149 26.1679C212.854 36.3317 228.706 62.8029 228.706 105.582V151.774C228.706 187.119 242.435 211.012 269.892 223.451C242.435 236.194 228.706 260.086 228.706 295.128V310.99Z"
			/>
			<path
				fill={LIME}
				d="M154.676 135.876C154.676 159.227 135.746 178.156 112.396 178.156C89.0455 178.156 70.1162 159.227 70.1162 135.876C70.1162 112.526 89.0455 93.5968 112.396 93.5968C135.746 93.5968 154.676 112.526 154.676 135.876Z"
			/>
		</svg>
	);
}

/**
 * The frame every image shares: the wordmark and a mono label across the
 * top, the content, and a hairline over two mono notes at the foot.
 */
function Frame({
	label,
	foot,
	children,
}: {
	label: string;
	foot: [string, string];
	children: ReactNode;
}) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
				height: "100%",
				padding: "60px 72px 56px",
				backgroundColor: INK,
				color: PAPER,
				fontFamily: "Recursive Variable",
				fontWeight: 400,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
					<Mark height={44} />
					<span
						style={{
							fontSize: 34,
							fontWeight: 600,
							letterSpacing: "-0.01em",
						}}
					>
						Effetch
					</span>
				</div>
				<span style={{ ...MONO, fontSize: 22, color: STEEL }}>{label}</span>
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					flexGrow: 1,
					justifyContent: "flex-end",
				}}
			>
				{children}
			</div>
			<div
				style={{
					...MONO,
					display: "flex",
					justifyContent: "space-between",
					marginTop: 44,
					paddingTop: 22,
					borderTop: `2px solid ${RULE}`,
					fontSize: 22,
					color: STEEL,
				}}
			>
				<span>{foot[0]}</span>
				<span>{foot[1]}</span>
			</div>
		</div>
	);
}

/**
 * A docs page's image: where it sits in the docs, its title set heavy, and
 * its description in steel.
 */
export function DocsImage({
	section,
	title,
	description,
	path,
}: {
	section: string;
	title: string;
	description: string;
	path: string;
}) {
	// Short titles set larger, so one word doesn't sit small in the frame.
	const size = title.length <= 22 ? 96 : title.length <= 36 ? 82 : 68;
	return (
		<Frame
			label={section}
			foot={[`${HOST}${path}`, "Typed HTTP calls for Effect"]}
		>
			<div
				style={{
					fontSize: size,
					fontWeight: 760,
					letterSpacing: "-0.03em",
					lineHeight: 1.02,
				}}
			>
				{title}
			</div>
			{description && (
				<div
					style={{
						marginTop: 26,
						maxWidth: 1000,
						fontSize: 32,
						lineHeight: 1.38,
						color: STEEL,
					}}
				>
					{description}
				</div>
			)}
		</Frame>
	);
}

/**
 * The landing page's image: the hero's signature, set as the specimen sets
 * it, over the pitch.
 */
export function HomeImage() {
	const punct = { fontWeight: 300, color: STEEL };
	const error = { fontWeight: 640 };
	return (
		<Frame
			label="A specimen of one call"
			foot={["pnpm add @monarcode/effetch effect", HOST]}
		>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					fontSize: 88,
					letterSpacing: "-0.035em",
					lineHeight: 1.04,
				}}
			>
				<span style={punct}>Effect&lt;</span>
				<span style={{ fontWeight: 900, color: LIME }}>Todo</span>
				<span style={{ ...punct, marginRight: 22 }}>,</span>
				<span style={error}>DecodeError</span>
				<span style={{ ...punct, margin: "0 18px" }}>|</span>
				<span style={error}>NetworkError</span>
				<span style={punct}>&gt;</span>
			</div>
			<div
				style={{
					marginTop: 34,
					fontSize: 40,
					fontWeight: 700,
					letterSpacing: "-0.02em",
					lineHeight: 1.12,
				}}
			>
				Typed HTTP calls for Effect, without the boilerplate.
			</div>
		</Frame>
	);
}

/**
 * Draws an image as a PNG response, or, for the prerender, as base64 text
 * (see {@link IMAGE_AS_BASE64}).
 */
export async function imageResponse(
	element: ReactNode,
	request: Request,
): Promise<Response> {
	const image = await render(element, {
		...OG_SIZE,
		format: "png",
		fonts: FONTS,
	});
	if (request.headers.has(IMAGE_AS_BASE64)) {
		let binary = "";
		for (const byte of image) binary += String.fromCharCode(byte);
		return new Response(btoa(binary), {
			headers: { "Content-Type": "text/plain; charset=utf-8" },
		});
	}
	return new Response(image, {
		headers: { "Content-Type": "image/png" },
	});
}
