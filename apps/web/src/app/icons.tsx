import type { ReactNode } from "react";

/** 24×24 stroke icons for the navigation; decorative, the link text names the section. */
function Icon({ children }: { children: ReactNode }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{children}
		</svg>
	);
}

export const icons = {
	/** A stack of photos: the Collect area. */
	collect: (
		<Icon>
			<rect x="4" y="8" width="13" height="12" rx="2" />
			<path d="M8 4.5h10a2 2 0 0 1 2 2V16" />
			<path d="m6.5 17 3-3.5 2.5 2.5 1.5-1.5 2 2.5" />
		</Icon>
	),
	/** A suitcase: the Stays history. */
	stays: (
		<Icon>
			<rect x="3.5" y="7.5" width="17" height="12" rx="2" />
			<path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M3.5 13h17" />
		</Icon>
	),
	/** A dashed path between two points: Journey. */
	journey: (
		<Icon>
			<circle cx="6" cy="18" r="2" />
			<circle cx="18" cy="6" r="2" />
			<path d="M7.5 16.5c2-4 7-3 9-9" strokeDasharray="2 2.5" />
		</Icon>
	),
	map: (
		<Icon>
			<path d="m3.5 6.5 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
			<path d="M9 4.5v13M15 6.5v13" />
		</Icon>
	),
	calendar: (
		<Icon>
			<rect x="4" y="5.5" width="16" height="14.5" rx="2" />
			<path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
		</Icon>
	),
	stats: (
		<Icon>
			<path d="M5 20V12M10 20V5M15 20v-9M20 20v-5M3.5 20h17" />
		</Icon>
	),
	/** A padlock: data stays local. */
	lock: (
		<Icon>
			<rect x="5" y="10.5" width="14" height="10" rx="2" />
			<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
		</Icon>
	),
	insights: (
		<Icon>
			<circle cx="12" cy="12" r="8.5" />
			<path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" />
		</Icon>
	),
	settings: (
		<Icon>
			<path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
			<circle cx="16" cy="7" r="2" />
			<circle cx="10" cy="17" r="2" />
		</Icon>
	),
	sun: (
		<Icon>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
		</Icon>
	),
	moon: (
		<Icon>
			<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
		</Icon>
	),
	system: (
		<Icon>
			<rect x="3" y="4.5" width="18" height="12" rx="2" />
			<path d="M8.5 20h7M12 16.5V20" />
		</Icon>
	),
};

/** The brand mark as pixel art: a green tile with a pixel "V" (`x` = letter). */
const BRAND_ROWS = [
	"..........",
	".xx....xx.",
	".xx....xx.",
	".xx....xx.",
	"..xx..xx..",
	"..xx..xx..",
	"...xxxx...",
	"....xx....",
	"..........",
];

const BRAND_LETTER = BRAND_ROWS.flatMap((row, y) =>
	[...row].flatMap((cell, x) => (cell === "x" ? [`M${x} ${y}h1v1h-1z`] : [])),
).join("");

export function BrandMark() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 10 10"
			width="30"
			height="30"
			shapeRendering="crispEdges"
		>
			<path
				d="M1 0h8v1h1v8h-1v1h-8v-1h-1v-8h1z"
				style={{ fill: "var(--vp-accent)" }}
			/>
			<path
				d="M1 9h8v1h-8z"
				style={{ fill: "var(--vp-accent-ink)", opacity: 0.5 }}
			/>
			<path d={BRAND_LETTER} style={{ fill: "var(--vp-accent-text)" }} />
		</svg>
	);
}
