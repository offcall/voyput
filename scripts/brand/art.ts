/**
 * The brand mark and the share image as SVG strings, drawn from the kit's pixel
 * art (packages/ui sprites, dark theme colours). Pure: no file access.
 */

import {
	type PaletteKey,
	SPRITES,
	type SpriteName,
	spritePaths,
} from "../../packages/ui/src/pixel/sprites.ts";

/** Same grid as `BRAND_ROWS` in apps/web/src/app/icons.tsx (`x` = letter); a test keeps them equal. */
export const BRAND_ROWS = [
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

/** The letter as one path, one 1×1 square per pixel, as `BrandMark` draws it. */
export const BRAND_LETTER = BRAND_ROWS.flatMap((row, y) =>
	[...row].flatMap((cell, x) => (cell === "x" ? [`M${x} ${y}h1v1h-1z`] : [])),
).join("");

/** Dark-theme values of the kit tokens the art uses (packages/ui/src/styles.css). */
export const DARK = {
	bg: "#111315",
	surface: "#1c1f23",
	text: "#eef0f2",
	muted: "#9aa2ab",
	accent: "#5cb85c",
	accentInk: "#7fd67f",
	accentText: "#0c1a0d",
	accentSoft: "#1e2d20",
	skyTop: "#0b1020",
	skyBottom: "#1a2238",
	hill: "#2a5a33",
	hillFar: "#1f3f28",
	hillShade: "#1d4226",
	star: "#f4f1c9",
} as const;

const SPRITE_INK: Record<PaletteKey, string> = {
	k: "#4d5560",
	w: "#e9ecef",
	g: DARK.accent,
	G: DARK.hillShade,
	r: "#e8615a",
	b: "#5b93ea",
	y: "#f0bf3a",
	n: "#a26d40",
	s: "#7d8791",
	c: "#3a4258",
	C: "#2c3347",
	t: "#f4f1c9",
	u: "#f1edc8",
};

/** The tile, shadow row and letter in a 10×10 box. `opaque` fills the cut corners too. */
function brandGroup(opaque: boolean): string {
	const tile = opaque ? "M0 0h10v10h-10z" : "M1 0h8v1h1v8h-1v1h-8v-1h-1v-8h1z";
	return [
		`<path d="${tile}" fill="${DARK.accent}"/>`,
		`<path d="M1 9h8v1h-8z" fill="${DARK.accentInk}" fill-opacity="0.5"/>`,
		`<path d="${BRAND_LETTER}" fill="${DARK.accentText}"/>`,
	].join("");
}

/**
 * The brand mark at `size` pixels: whole-pixel scale, centred, edges not
 * smoothed. `opaque` (home-screen icons) fills the square edge to edge.
 */
export function iconSvg(size: number, { opaque = false } = {}): string {
	const scale = opaque ? size / 10 : Math.floor(size / 10);
	const offset = (size - scale * 10) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><title>voyput</title><g transform="translate(${offset} ${offset}) scale(${scale})">${brandGroup(opaque)}</g></svg>\n`;
}

function sprite(name: SpriteName, x: number, y: number): string {
	const paths = spritePaths(SPRITES[name])
		.map((path) => `<path d="${path.d}" fill="${SPRITE_INK[path.key]}"/>`)
		.join("");
	return `<g transform="translate(${x} ${y})">${paths}</g>`;
}

/** Column tops of a hill layer, stepped every 2 art pixels (as `PixelSky`). */
function hills(
	width: number,
	height: number,
	base: number,
	waves: [number, number][],
): string {
	let d = "";
	for (let x = 0; x < width; x += 2) {
		const lift = waves.reduce(
			(sum, [amp, period]) => sum + amp * Math.sin(x / period),
			0,
		);
		d += `M${x} ${Math.round(height - base - lift)}h2V${height}h-2z`;
	}
	return d;
}

const xml = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Text with the kit's hard 2px pixel shadow. */
function text(
	content: string,
	x: number,
	y: number,
	size: number,
	fill: string,
	shadow: string,
): string {
	const attrs = `font-family="Silkscreen" font-size="${size}"`;
	return `<text x="${x + 3}" y="${y + 3}" ${attrs} fill="${shadow}">${xml(content)}</text><text x="${x}" y="${y}" ${attrs} fill="${fill}">${xml(content)}</text>`;
}

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** Art pixels are 6×6 screen pixels: a 200 × 105 scene. */
const PX = 6;
const W = OG_WIDTH / PX;
const H = OG_HEIGHT / PX;

/** The home page's title and promise (HomePage.tsx `Hero`), the share image's text. */
export const OG_TITLE = [
	"Your travel history from passport",
	"stamps and iPhone photo locations",
];
export const OG_PROMISE =
	"Bring your own key · Your data stays in your browser";

const STARS: [number, number][] = [
	[8, 6],
	[23, 15],
	[41, 4],
	[58, 11],
	[77, 3],
	[96, 8],
	[118, 5],
	[131, 14],
	[149, 3],
	[176, 9],
	[189, 16],
	[110, 19],
	[14, 24],
	[195, 4],
];

/** The 1200×630 share image: night pixel sky, brand, title and the BYOK promise. */
export function ogSvg(): string {
	const bands = [100, 80, 60, 40, 20, 0]
		.map((share, index) => {
			const mix = (a: string, b: string) => {
				const channel = (hex: string, i: number) =>
					Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
				return `#${[0, 1, 2]
					.map((i) =>
						Math.round(
							(channel(a, i) * share + channel(b, i) * (100 - share)) / 100,
						)
							.toString(16)
							.padStart(2, "0"),
					)
					.join("")}`;
			};
			const band = Math.ceil(H / 6);
			return `<rect x="0" y="${index * band}" width="${W}" height="${band + 1}" fill="${mix(DARK.skyTop, DARK.skyBottom)}"/>`;
		})
		.join("");
	const stars = STARS.map(
		([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1"/>`,
	).join("");
	const art = [
		bands,
		`<g fill="${DARK.star}">${stars}</g>`,
		sprite("sun", 168, 8),
		sprite("cloud", 136, 20),
		sprite("cloud", 92, 2),
		sprite("cloud", 176, 30),
		`<path d="${hills(W, H, 14, [
			[5, 23],
			[2, 7],
		])}" fill="${DARK.hillFar}"/>`,
		`<path d="${hills(W, H, 7, [
			[3, 17],
			[1, 5],
		])}" fill="${DARK.hill}"/>`,
		`<rect x="0" y="${H - 2}" width="${W}" height="2" fill="${DARK.hillShade}"/>`,
		sprite("passport", 12, 20),
		sprite("plane", 30, 26),
		sprite("globe", 54, 22),
		`<g transform="translate(12 6)">${brandGroup(false)}</g>`,
		// The promise plate: surface, accent border, star (Hero's `.home-promise`).
		`<rect x="12" y="63" width="176" height="15" fill="${DARK.accent}"/>`,
		`<rect x="13" y="64" width="174" height="13" fill="${DARK.surface}"/>`,
		sprite("star", 16, 66),
	].join("");
	const words = [
		text("voyput", 150, 90, 64, DARK.text, "#000000"),
		...OG_TITLE.map((line, i) =>
			text(line, 72, 276 + i * 54, 40, DARK.text, DARK.accentSoft),
		),
		`<text x="${30 * PX}" y="${70 * PX + 12}" font-family="Silkscreen" font-size="24" fill="${DARK.text}">${xml(OG_PROMISE)}</text>`,
	].join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}"><g transform="scale(${PX})" shape-rendering="crispEdges">${art}</g>${words}</svg>\n`;
}
