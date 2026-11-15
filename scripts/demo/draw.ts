/**
 * SVG drawing of fictional passport visa pages and border stamps. The stamp
 * designs are loosely modelled on each country's real ones (shape, language,
 * date format, entry and exit marks) without copying any emblem.
 */

import {
	COUNTRIES,
	PAGE_HEIGHT,
	PAGE_WIDTH,
	POSTS,
	type Post,
	type StampPlan,
} from "./scenario.ts";

const MONTHS = [
	"JAN",
	"FEB",
	"MAR",
	"APR",
	"MAY",
	"JUN",
	"JUL",
	"AUG",
	"SEP",
	"OCT",
	"NOV",
	"DEC",
];

export type StampStyle =
	| "ukraine"
	| "schengen"
	| "georgia"
	| "armenia"
	| "turkey"
	| "thailand"
	| "uae"
	| "japan"
	| "montenegro"
	| "moldova";

const STYLE_OF: Record<string, StampStyle> = {
	UA: "ukraine",
	GE: "georgia",
	AM: "armenia",
	TR: "turkey",
	TH: "thailand",
	AE: "uae",
	JP: "japan",
	ME: "montenegro",
	MD: "moldova",
};

/** Letters in the star circle of a Schengen stamp. */
const SCHENGEN_LETTERS: Record<string, string> = {
	ES: "E",
	PL: "PL",
	IT: "I",
	FR: "F",
	PT: "P",
};

export const postOf = (stamp: StampPlan): Post => POSTS[stamp.post];
export const styleOf = (stamp: StampPlan): StampStyle =>
	STYLE_OF[postOf(stamp).country] ?? "schengen";

function parts(date: string) {
	const [yyyy = "", mm = "", dd = ""] = date.split("-");
	return { dd, mm, yy: yyyy.slice(2), yyyy, mon: MONTHS[Number(mm) - 1] ?? "" };
}

/** A date written the way a stamp of this style prints it. */
export function formatDate(style: StampStyle, date: string): string {
	const { dd, mm, yy, yyyy, mon } = parts(date);
	switch (style) {
		case "ukraine":
		case "schengen":
		case "moldova":
			return `${dd}.${mm}.${yy}`;
		case "armenia":
		case "turkey":
		case "montenegro":
			return `${dd}.${mm}.${yyyy}`;
		case "uae":
			return `${dd}-${mm}-${yyyy}`;
		case "georgia":
		case "thailand":
		case "japan":
			return `${dd} ${mon} ${yyyy}`;
	}
}

/** The date line exactly as the stamp prints it. */
export const dateText = (stamp: StampPlan): string =>
	formatDate(styleOf(stamp), stamp.date);

/** Stamps are drawn at about 320 px wide, then scaled to the page. */
const SCALE = 1.12;

/** Unscaled size, as drawn. */
function drawnSize(stamp: StampPlan): { w: number; h: number } {
	const style = styleOf(stamp);
	if (style === "japan" && stamp.direction === "entry")
		return { w: 520, h: 300 };
	if (style === "thailand" && stamp.direction === "entry")
		return { w: 340, h: 236 };
	if (style === "armenia") return { w: 330, h: 214 };
	return { w: 330, h: 210 };
}

/** Stamp size on the page in px before rotation; layout keeps it on the page. */
export function stampSize(stamp: StampPlan): { w: number; h: number } {
	const { w, h } = drawnSize(stamp);
	return { w: w * SCALE, h: h * SCALE };
}

function escapeXml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

const SANS = "DejaVu Sans, Arial, sans-serif";
const MONO = "DejaVu Sans Mono, Courier New, monospace";
const SERIF = "DejaVu Serif, Georgia, serif";

interface TextOptions {
	size: number;
	bold?: boolean;
	font?: string;
	anchor?: "start" | "middle" | "end";
	/** Squeeze into this width (px), as a rubber stamp's letters would be. */
	fit?: number;
	spacing?: number;
	italic?: boolean;
	fill?: string;
}

/** Rough advance width of DejaVu glyphs, for `fit`. */
const advance = (font: string, bold: boolean) =>
	font === MONO ? 0.602 : bold ? 0.68 : 0.62;

function text(
	x: number,
	y: number,
	value: string,
	ink: string,
	o: TextOptions,
): string {
	const font = o.font ?? SANS;
	const natural =
		value.length * o.size * advance(font, Boolean(o.bold)) +
		(o.spacing ?? 0) * value.length;
	const squeeze = o.fit && natural > o.fit ? o.fit / natural : 1;
	const body = `<text x="0" y="0" font-size="${o.size}" font-family="${font}"${o.bold ? ` font-weight="bold"` : ""}${o.italic ? ` font-style="italic"` : ""}${o.spacing ? ` letter-spacing="${o.spacing}"` : ""} text-anchor="${o.anchor ?? "middle"}" fill="${o.fill ?? ink}">${escapeXml(value)}</text>`;
	return `<g transform="translate(${x} ${y}) scale(${squeeze.toFixed(3)} 1)">${body}</g>`;
}

const line = (ink: string, width = 3) =>
	`fill="none" stroke="${ink}" stroke-width="${width}"`;

function plane(x: number, y: number, ink: string, size = 34) {
	return text(x, y + size * 0.35, "✈", ink, { size });
}

function car(x: number, y: number, ink: string) {
	return `<g ${line(ink, 2.5)}><rect x="${x - 20}" y="${y - 6}" width="40" height="12" rx="3"/><path d="M ${x - 11} ${y - 6} L ${x - 6} ${y - 15} H ${x + 7} L ${x + 12} ${y - 6}"/><circle cx="${x - 11}" cy="${y + 8}" r="4"/><circle cx="${x + 11}" cy="${y + 8}" r="4"/></g>`;
}

function walker(x: number, y: number, ink: string) {
	return `<g ${line(ink, 2.5)} stroke-linecap="round"><circle cx="${x}" cy="${y - 14}" r="4"/><path d="M ${x} ${y - 9} L ${x - 2} ${y + 3} L ${x - 8} ${y + 14} M ${x - 2} ${y + 3} L ${x + 6} ${y + 14} M ${x - 9} ${y - 2} L ${x} ${y - 6} L ${x + 8} ${y}"/></g>`;
}

function transport(x: number, y: number, stamp: StampPlan, ink: string) {
	const crossing = postOf(stamp).crossing;
	return crossing === "plane"
		? plane(x, y, ink)
		: crossing === "car"
			? car(x, y, ink)
			: walker(x, y, ink);
}

/** Box with an arrow pointing into it (entry) or out of it (exit), centred on x, y. */
function arrowBox(x: number, y: number, entry: boolean, ink: string) {
	const left = x - 26;
	const top = y - 13;
	const box = entry
		? `<rect x="${left + 22}" y="${top}" width="30" height="26" ${line(ink, 2.5)}/>`
		: `<rect x="${left}" y="${top}" width="30" height="26" rx="8" ${line(ink, 2.5)}/>`;
	const from = entry ? left : left + 12;
	const arrow = `<path d="M ${from} ${y} H ${from + 40} M ${from + 32} ${y - 7} L ${from + 41} ${y} L ${from + 32} ${y + 7}" ${line(ink, 3)}/>`;
	return box + arrow;
}

function starCircle(cx: number, cy: number, letters: string, ink: string) {
	const stars: string[] = [];
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		stars.push(
			text(cx + Math.cos(a) * 29, cy + Math.sin(a) * 29 + 4, "★", ink, {
				size: 11,
			}),
		);
	}
	return (
		stars.join("") +
		text(cx, cy + 8, letters, ink, {
			size: letters.length > 1 ? 18 : 22,
			bold: true,
		})
	);
}

/** A rectangle with its corners cut off. */
function notched(w: number, h: number, cut: number, ink: string, width = 4) {
	const x = w / 2;
	const y = h / 2;
	return `<path d="M ${-x + cut} ${-y} H ${x - cut} L ${x} ${-y + cut} V ${y - cut} L ${x - cut} ${y} H ${-x + cut} L ${-x} ${y - cut} V ${-y + cut} Z" ${line(ink, width)}/>`;
}

interface Drawn {
	body: string;
	/** Where a smudge goes, if the plan asks for one. */
	date: { x: number; y: number };
	direction: { x: number; y: number };
}

function ukraine(stamp: StampPlan, ink: string): Drawn {
	const entry = stamp.direction === "entry";
	const post = postOf(stamp);
	const frame = entry
		? `<rect x="-160" y="-100" width="320" height="200" rx="16" ${line(ink, 4)}/>`
		: notched(320, 200, 26, ink);
	return {
		body: [
			frame,
			`<rect x="-150" y="-90" width="300" height="180" rx="${entry ? 10 : 0}" ${line(ink, 1.2)}/>`,
			text(0, -55, "УКРАЇНА", ink, { size: 26, bold: true, spacing: 3 }),
			text(0, -24, post.printed, ink, { size: 21, fit: 270 }),
			text(0, 26, dateText(stamp), ink, { size: 40, bold: true, font: MONO }),
			transport(-105, 63, stamp, ink),
			text(0, 72, `ДПСУ ${stamp.officer}`, ink, { size: 18, font: MONO }),
			arrowBox(108, 63, entry, ink),
		].join(""),
		date: { x: 30, y: 12 },
		direction: { x: 108, y: 63 },
	};
}

function schengen(stamp: StampPlan, ink: string): Drawn {
	const entry = stamp.direction === "entry";
	const post = postOf(stamp);
	const letters = SCHENGEN_LETTERS[post.country] ?? "?";
	return {
		body: [
			`<rect x="-160" y="-102" width="320" height="204" rx="${entry ? 2 : 32}" ${line(ink, 4)}/>`,
			starCircle(-100, -48, letters, ink),
			transport(8, -48, stamp, ink),
			arrowBox(98, -48, entry, ink),
			text(0, 30, dateText(stamp), ink, { size: 40, bold: true, font: MONO }),
			text(0, 74, `${post.printed} ${post.code}`.trim(), ink, {
				size: 21,
				font: MONO,
				fit: 285,
			}),
		].join(""),
		date: { x: 30, y: 16 },
		direction: { x: 98, y: -48 },
	};
}

function georgia(stamp: StampPlan, ink: string): Drawn {
	const entry = stamp.direction === "entry";
	const post = postOf(stamp);
	return {
		body: [
			`<rect x="-160" y="-100" width="320" height="200" rx="4" ${line(ink, 4)}/>`,
			`<rect x="-151" y="-91" width="302" height="182" rx="2" ${line(ink, 1.5)}/>`,
			text(0, -60, "საქართველო", ink, { size: 22, bold: true }),
			text(0, -36, "GEORGIA", ink, { size: 15, spacing: 6 }),
			transport(-112, -2, stamp, ink),
			text(18, 8, entry ? "ENTRY" : "EXIT", ink, { size: 20, bold: true }),
			arrowBox(112, 0, entry, ink),
			text(0, 48, dateText(stamp), ink, { size: 32, bold: true, font: MONO }),
			text(-10, 80, post.printed, ink, { size: 17, fit: 230 }),
			text(138, 80, stamp.officer, ink, {
				size: 14,
				font: MONO,
				anchor: "end",
			}),
		].join(""),
		date: { x: 30, y: 36 },
		direction: { x: 30, y: 2 },
	};
}

function armenia(stamp: StampPlan, ink: string): Drawn {
	const entry = stamp.direction === "entry";
	const post = postOf(stamp);
	return {
		body: [
			`<ellipse cx="0" cy="0" rx="163" ry="105" ${line(ink, 4)}/>`,
			`<ellipse cx="0" cy="0" rx="152" ry="95" ${line(ink, 1.3)}/>`,
			text(0, -55, "ՀԱՅԱՍՏԱՆ", ink, { size: 24, bold: true, spacing: 2 }),
			text(0, -32, "ARMENIA", ink, { size: 14, spacing: 5 }),
			text(0, 12, dateText(stamp), ink, { size: 30, bold: true, font: MONO }),
			text(0, 42, post.printed, ink, { size: 17, fit: 220 }),
			transport(-48, 68, stamp, ink),
			arrowBox(42, 68, entry, ink),
		].join(""),
		date: { x: 20, y: 0 },
		direction: { x: 42, y: 68 },
	};
}

function turkey(stamp: StampPlan, ink: string): Drawn {
	const entry = stamp.direction === "entry";
	const post = postOf(stamp);
	return {
		body: [
			notched(320, 200, entry ? 14 : 34, ink),
			text(-140, -66, "T.C.", ink, { size: 18, bold: true, anchor: "start" }),
			text(46, -60, entry ? "GİRİŞ" : "ÇIKIŞ", ink, {
				size: 30,
				bold: true,
				spacing: 3,
			}),
			plane(-58, -68, ink, 28),
			text(0, 18, dateText(stamp), ink, { size: 36, bold: true, font: MONO }),
			text(0, 52, post.printed, ink, { size: 18, fit: 280 }),
			text(0, 80, `${stamp.officer}0${stamp.officer}`, ink, {
				size: 15,
				font: MONO,
			}),
		].join(""),
		date: { x: 20, y: 6 },
		direction: { x: 46, y: -70 },
	};
}

function thailand(stamp: StampPlan, ink: string): Drawn {
	const post = postOf(stamp);
	if (stamp.direction === "exit")
		return {
			body: [
				`<rect x="-160" y="-100" width="320" height="200" rx="6" ${line(ink, 4)}/>`,
				`<path d="M -160 -48 H 160" ${line(ink, 2)}/>`,
				text(-30, -62, "DEPARTURE", ink, { size: 28, bold: true, spacing: 2 }),
				plane(118, -74, ink, 30),
				text(0, 6, dateText(stamp), ink, { size: 34, bold: true, font: MONO }),
				text(0, 42, post.printed, ink, { size: 18, fit: 280 }),
				text(0, 78, `IMMIGRATION ${stamp.officer}${stamp.officer}`, ink, {
					size: 15,
					font: MONO,
				}),
			].join(""),
			date: { x: 20, y: -6 },
			direction: { x: -30, y: -72 },
		};
	const until = new Date(`${stamp.date}T00:00:00Z`);
	until.setUTCDate(until.getUTCDate() + 29);
	const pen = "#1f3fa8";
	return {
		body: [
			`<rect x="-170" y="-118" width="340" height="236" rx="4" ${line(ink, 4)}/>`,
			text(0, -82, "ADMITTED", ink, { size: 28, bold: true, spacing: 4 }),
			text(0, -56, post.printed, ink, { size: 17, fit: 300 }),
			text(0, -10, dateText(stamp), ink, { size: 36, bold: true, font: MONO }),
			`<rect x="-150" y="10" width="300" height="34" ${line(ink, 2)}/>`,
			text(0, 35, "VISA EXEMPT", ink, { size: 20, bold: true, spacing: 2 }),
			text(-150, 86, "UNTIL", ink, { size: 18, anchor: "start" }),
			`<path d="M -80 92 H 150" ${line(ink, 1.5)}/>`,
			`<g transform="rotate(-4 30 80)">${text(30, 84, formatDate("thailand", until.toISOString().slice(0, 10)), pen, { size: 26, font: SERIF, italic: true, fill: pen })}</g>`,
			text(150, 110, stamp.officer, ink, {
				size: 13,
				font: MONO,
				anchor: "end",
			}),
		].join(""),
		date: { x: 20, y: -22 },
		direction: { x: 0, y: -90 },
	};
}

function uae(stamp: StampPlan, ink: string): Drawn {
	const entry = stamp.direction === "entry";
	const post = postOf(stamp);
	return {
		body: [
			`<rect x="-160" y="-100" width="320" height="200" rx="44" ${line(ink, 4)}/>`,
			text(0, -60, "دولة الإمارات العربية المتحدة", ink, {
				size: 20,
				fit: 260,
			}),
			text(0, -32, post.printed, ink, { size: 18, bold: true, spacing: 2 }),
			text(0, 4, entry ? "ARRIVAL" : "DEPARTURE", ink, {
				size: 24,
				bold: true,
				spacing: 3,
			}),
			text(0, 46, dateText(stamp), ink, { size: 32, bold: true, font: MONO }),
			plane(-112, 72, ink, 24),
			text(0, 80, `${stamp.officer}${stamp.officer}${stamp.officer}`, ink, {
				size: 15,
				font: MONO,
			}),
		].join(""),
		date: { x: 20, y: 34 },
		direction: { x: 0, y: -6 },
	};
}

function japanExit(stamp: StampPlan, ink: string): Drawn {
	const post = postOf(stamp);
	return {
		body: [
			`<rect x="-150" y="-100" width="300" height="200" rx="10" ${line(ink, 4)}/>`,
			text(0, -60, "DEPARTED", ink, { size: 30, bold: true, spacing: 4 }),
			text(0, -32, "JAPAN", ink, { size: 16, spacing: 8 }),
			text(0, 14, dateText(stamp), ink, { size: 32, bold: true, font: MONO }),
			text(-10, 54, post.printed, ink, { size: 20, bold: true }),
			plane(110, 50, ink, 26),
			text(0, 84, `${stamp.officer}${stamp.officer}`, ink, {
				size: 14,
				font: MONO,
			}),
		].join(""),
		date: { x: 20, y: 2 },
		direction: { x: 0, y: -70 },
	};
}

/** The printed landing sticker, with the officer's red seal over it. */
function japanEntry(stamp: StampPlan, ink: string, id: string): string {
	const green = "#3d7d58";
	const until = new Date(`${stamp.date}T00:00:00Z`);
	until.setUTCDate(until.getUTCDate() + 89);
	const waves: string[] = [];
	for (let i = 0; i < 26; i++) {
		const y = -112 + i * 9;
		waves.push(
			`<path d="M -250 ${y} Q -190 ${y - 6} -125 ${y} T 0 ${y} T 125 ${y} T 250 ${y}" ${line("#cfe3d4", 1)}/>`,
		);
	}
	const sticker = [
		`<rect x="-260" y="-150" width="520" height="300" rx="6" fill="#f7f8f1" stroke="#c9d4c6" stroke-width="1"/>`,
		`<g clip-path="url(#jp-clip-${id})">${waves.join("")}</g>`,
		`<clipPath id="jp-clip-${id}"><rect x="-252" y="-112" width="504" height="254"/></clipPath>`,
		`<rect x="-260" y="-150" width="520" height="38" rx="6" fill="${green}"/>`,
		text(0, -123, "LANDING PERMISSION · JAPAN", "#fff", {
			size: 20,
			bold: true,
			spacing: 2,
			fill: "#f7f8f1",
		}),
		text(-236, -76, "Status:", green, { size: 17, anchor: "start" }),
		text(-150, -76, "Temporary Visitor", "#222", {
			size: 20,
			bold: true,
			anchor: "start",
			font: MONO,
		}),
		text(-236, -40, "Duration:", green, { size: 17, anchor: "start" }),
		text(-136, -40, "90 days", "#222", {
			size: 20,
			bold: true,
			anchor: "start",
			font: MONO,
		}),
		text(-236, -4, "Until:", green, { size: 17, anchor: "start" }),
		text(
			-150,
			-4,
			formatDate("japan", until.toISOString().slice(0, 10)),
			"#222",
			{
				size: 20,
				bold: true,
				anchor: "start",
				font: MONO,
			},
		),
		text(-236, 120, "SPECIMEN · NOT VALID", "#9a3a3a", {
			size: 13,
			anchor: "start",
			spacing: 2,
		}),
	].join("");
	const seal = [
		`<circle cx="0" cy="0" r="96" ${line(ink, 4)}/>`,
		`<circle cx="0" cy="0" r="86" ${line(ink, 1.2)}/>`,
		text(0, -46, "LANDED", ink, { size: 18, bold: true, spacing: 3 }),
		text(0, 10, dateText(stamp), ink, { size: 25, bold: true, font: MONO }),
		text(0, 48, postOf(stamp).printed, ink, { size: 17, bold: true }),
		text(0, 72, stamp.officer, ink, { size: 13, font: MONO }),
	].join("");
	return `${sticker}<g transform="translate(140 40) rotate(-8)" filter="url(#ink-${id})" opacity="0.88">${seal}</g>`;
}

function montenegro(stamp: StampPlan, ink: string): Drawn {
	const entry = stamp.direction === "entry";
	const post = postOf(stamp);
	return {
		body: [
			`<rect x="-160" y="-100" width="320" height="200" rx="${entry ? 0 : 22}" ${line(ink, 4)}/>`,
			text(0, -62, "CRNA GORA", ink, { size: 26, bold: true, spacing: 4 }),
			text(0, -40, "MONTENEGRO", ink, { size: 13, spacing: 6 }),
			transport(-108, -2, stamp, ink),
			text(8, 6, post.printed, ink, { size: 22, bold: true, fit: 150 }),
			arrowBox(112, -2, entry, ink),
			text(0, 52, dateText(stamp), ink, { size: 36, bold: true, font: MONO }),
			text(0, 84, `GP ${stamp.officer}`, ink, { size: 15, font: MONO }),
		].join(""),
		date: { x: -75, y: 40 },
		direction: { x: 112, y: -2 },
	};
}

function moldova(stamp: StampPlan, ink: string): Drawn {
	const entry = stamp.direction === "entry";
	const post = postOf(stamp);
	return {
		body: [
			`<rect x="-160" y="-100" width="320" height="200" rx="${entry ? 8 : 40}" ${line(ink, 4)}/>`,
			text(0, -62, "REPUBLICA MOLDOVA", ink, {
				size: 22,
				bold: true,
				fit: 290,
			}),
			text(0, -32, post.printed, ink, { size: 22, spacing: 4 }),
			text(0, 22, dateText(stamp), ink, { size: 38, bold: true, font: MONO }),
			transport(-100, 66, stamp, ink),
			text(0, 74, stamp.officer, ink, { size: 18, font: MONO }),
			arrowBox(100, 66, entry, ink),
		].join(""),
		date: { x: 30, y: 10 },
		direction: { x: 100, y: 66 },
	};
}

const DRAW: Record<
	Exclude<StampStyle, "japan">,
	(s: StampPlan, ink: string) => Drawn
> = {
	ukraine,
	schengen,
	georgia,
	armenia,
	turkey,
	thailand,
	uae,
	montenegro,
	moldova,
};

/** Ink choices per style; a stamp's seed picks one. */
const INKS: Record<StampStyle, string[]> = {
	ukraine: ["#4a2f86", "#3a2a74", "#2c2c38"],
	schengen: ["#1d2f80", "#232323", "#7a2236", "#1e5a8c"],
	georgia: ["#1f4f9a", "#5a2a7a"],
	armenia: ["#5b2c86", "#1f3f8a"],
	turkey: ["#1a2370", "#2a2a2a"],
	thailand: ["#2b3d9e", "#6e2a6a"],
	uae: ["#8b1c24", "#1f5a3a"],
	japan: ["#b2302c"],
	montenegro: ["#203a80", "#8a2a2a"],
	moldova: ["#3a2a8a", "#1f5a8c"],
};

/** How a stamp sits on its page. */
export interface Placed {
	stamp: StampPlan;
	x: number;
	y: number;
	rotate: number;
	/** 0–1 per-stamp noise for ink, pressure and texture. */
	seed: number;
	/** Pressed harder on one side: the far side fades to this opacity. */
	partial: number | null;
}

/** Speckled, slightly wobbly ink; faint stamps lose more of it. */
function inkFilter(id: string, seed: number, faint: boolean) {
	const keep = faint ? "-3.2 2.1" : "-1.6 1.75";
	return `<filter id="${id}" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="${Math.floor(seed * 997)}" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${keep}" result="mask"/><feComposite in="SourceGraphic" in2="mask" operator="in" result="inked"/><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="${Math.floor(seed * 7919)}" result="warp"/><feDisplacementMap in="inked" in2="warp" scale="3.5" xChannelSelector="R" yChannelSelector="G"/></filter>`;
}

function stampSvg(placed: Placed, index: number): string {
	const { stamp, seed } = placed;
	const style = styleOf(stamp);
	const inks = INKS[style];
	const ink = inks[Math.floor(seed * inks.length)] ?? inks[0] ?? "#222";
	const id = `s${index}`;
	const defs = [inkFilter(`ink-${id}`, seed, Boolean(stamp.faint))];
	const { w, h } = drawnSize(stamp);
	let mask = "";
	if (placed.partial !== null) {
		const angle = Math.floor(seed * 360);
		defs.push(
			`<linearGradient id="fade-${id}" gradientTransform="rotate(${angle} 0.5 0.5)"><stop offset="0.25" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="${placed.partial}"/></linearGradient>`,
			`<mask id="mask-${id}"><rect x="${-w}" y="${-h}" width="${2 * w}" height="${2 * h}" fill="url(#fade-${id})"/></mask>`,
		);
		mask = ` mask="url(#mask-${id})"`;
	}
	const opacity = stamp.faint ? 0.5 : 0.78 + seed * 0.16;
	const transform = `translate(${placed.x} ${placed.y}) rotate(${placed.rotate}) scale(${SCALE})`;
	if (style === "japan" && stamp.direction === "entry")
		return `<defs>${defs.join("")}</defs><g transform="${transform}">${japanEntry(stamp, ink, id)}</g>`;
	const drawn =
		style === "japan"
			? japanExit(stamp, ink)
			: DRAW[style as Exclude<StampStyle, "japan">](stamp, ink);
	let smudge = "";
	if (stamp.smudge) {
		const at = drawn[stamp.smudge];
		smudge = `<g filter="url(#blur-${id})" opacity="0.62"><ellipse cx="${at.x}" cy="${at.y}" rx="${stamp.smudge === "date" ? 26 : 62}" ry="${stamp.smudge === "date" ? 24 : 20}" fill="${ink}"/><ellipse cx="${at.x + 14}" cy="${at.y - 6}" rx="20" ry="11" fill="${ink}"/></g>`;
		defs.push(
			`<filter id="blur-${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>`,
		);
	}
	return `<defs>${defs.join("")}</defs><g transform="${transform}"${mask}><g filter="url(#ink-${id})" opacity="${opacity.toFixed(2)}">${drawn.body}</g>${smudge}</g>`;
}

/** Spirograph rosette, the usual base of a guilloche. */
function rosette(cx: number, cy: number, r: number, k: number, colour: string) {
	const points: string[] = [];
	const steps = 1400;
	for (let i = 0; i <= steps; i++) {
		const t = (i / steps) * Math.PI * 2;
		const rr = r * (0.72 + 0.28 * Math.cos(k * t));
		const wobble = 0.06 * r * Math.sin((k + 3) * t);
		points.push(
			`${(cx + (rr + wobble) * Math.cos(t)).toFixed(1)},${(cy + (rr + wobble) * Math.sin(t)).toFixed(1)}`,
		);
	}
	return `<polyline points="${points.join(" ")}" shape-rendering="crispEdges" fill="none" stroke="${colour}" stroke-width="0.9"/>`;
}

function paper(pageNumber: number): string {
	const W = PAGE_WIDTH;
	const H = PAGE_HEIGHT;
	const waves: string[] = [];
	for (let y = 60; y < H - 30; y += 20) {
		const a = 9 + 5 * Math.sin(y / 170);
		const phase = (y * 7) % 240;
		waves.push(
			`<path d="M -40 ${y} q 60 ${-a} 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0" transform="translate(${-phase / 2} 0)" fill="none" stroke="${y % 40 === 20 ? "#d7dccb" : "#dfd8cf"}" stroke-width="0.8"/>`,
		);
	}
	const rosettes = [
		rosette(W / 2, H / 2, 430, 18, "#cfd6c4"),
		rosette(W / 2, H / 2, 360, 24, "#d9cfc8"),
		rosette(W / 2, H / 2, 290, 30, "#cfd6c4"),
		rosette(W / 2, H / 2, 150, 12, "#d6cdc4"),
	];
	const gutterLeft = pageNumber % 2 === 0;
	return [
		`<defs><linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1efe3"/><stop offset="1" stop-color="#e8eadc"/></linearGradient>`,
		`<linearGradient id="gutter" x1="${gutterLeft ? 0 : 1}" x2="${gutterLeft ? 1 : 0}"><stop offset="0" stop-color="#6b6a5a" stop-opacity="0.22"/><stop offset="0.06" stop-color="#6b6a5a" stop-opacity="0.05"/><stop offset="0.2" stop-color="#6b6a5a" stop-opacity="0"/></linearGradient>`,
		"</defs>",
		`<rect width="${W}" height="${H}" fill="url(#paper)"/>`,
		...waves,
		...rosettes,
		`<rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="#c7cfbd" stroke-width="1.5"/>`,
		`<rect x="38" y="38" width="${W - 76}" height="${H - 76}" fill="none" stroke="#d5d9c9" stroke-width="0.8" stroke-dasharray="2 3"/>`,
		text(W / 2, 92, "ВІЗИ · VISAS", "#93a08d", { size: 30, spacing: 10 }),
		text(gutterLeft ? W - 70 : 70, 92, String(pageNumber), "#93a08d", {
			size: 26,
		}),
		text(W / 2, H - 78, String(pageNumber), "#93a08d", { size: 28 }),
		text(W / 2, H - 48, "SPECIMEN · FICTIONAL DEMO DATA", "#b25050", {
			size: 17,
			spacing: 3,
		}),
		`<rect width="${W}" height="${H}" fill="url(#gutter)"/>`,
	].join("");
}

export function pageSvg(stamps: Placed[], pageNumber: number): string {
	const country = (p: Placed) => COUNTRIES[postOf(p.stamp).country]?.code;
	if (stamps.some((p) => !country(p))) throw new Error("Unknown stamp country");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">${paper(pageNumber)}${stamps.map(stampSvg).join("")}</svg>`;
}
