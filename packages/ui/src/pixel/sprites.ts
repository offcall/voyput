/**
 * Original pixel sprites (ADR 0012). Each sprite is a grid of rows of equal
 * length; every character is one pixel, "." is transparent and every other
 * character is a key of PALETTE, so the art follows the theme tokens.
 */
export const PALETTE = {
	k: "var(--vp-pixel-ink)",
	w: "var(--vp-pixel-paper)",
	g: "var(--vp-accent)",
	G: "var(--vp-hill-shade)",
	r: "var(--vp-pixel-red)",
	b: "var(--vp-pixel-blue)",
	y: "var(--vp-pixel-gold)",
	n: "var(--vp-pixel-brown)",
	s: "var(--vp-pixel-grey)",
	c: "var(--vp-cloud)",
	C: "var(--vp-cloud-shade)",
	t: "var(--vp-twinkle)",
	u: "var(--vp-sun)",
} as const;

export type PaletteKey = keyof typeof PALETTE;

export const SPRITES = {
	passport: [
		".kkkkkkkkkk.",
		"kGggggggggwk",
		"kGggggggggwk",
		"kGggyyyyggwk",
		"kGgyggggygwk",
		"kGyggyyggywk",
		"kGyyyyyyyywk",
		"kGyggyyggywk",
		"kGgyggggygwk",
		"kGggyyyyggwk",
		"kGggggggggwk",
		"kGgyyyyyygwk",
		"kGggggggggwk",
		"kGggyyyyggwk",
		"kGggggggggwk",
		".kkkkkkkkkk.",
	],
	stamp: [
		".rrrrrrrrrrrrrr.",
		"r..............r",
		"r.rrrrrrrrrrrr.r",
		"r.r..........r.r",
		"r.r.....r....r.r",
		"r.r.rrrrrr...r.r",
		"r.r.....r....r.r",
		"r.r..........r.r",
		"r.r.rr.rr.rr.r.r",
		"r.r..........r.r",
		"r.rrrrrrrrrrrr.r",
		"r..............r",
		".rrrrrrrrrrrrrr.",
	],
	plane: [
		"kk................",
		"kgk...............",
		"kggkkkkkkkkkkkk...",
		"kwwwwbwbwbwbwwbkk.",
		".kwwwwwwwwwwwwwwwk",
		"..kkkkkwwwwkkkkkk.",
		"......kwwwwk......",
		".......kwwk.......",
		"........kk........",
	],
	globe: [
		"....kkkkkk....",
		"..kkbbbbggkk..",
		".kbbbbbggggbk.",
		".kbggbbbggbbk.",
		"kbgggggbbbbbbk",
		"kbggggbbbbggbk",
		"kbbgggbbbggggk",
		"kbbbggbbbgggbk",
		"kbbbbgbbbbggbk",
		"kbbbbbbbbgbbbk",
		".kbbbggbbbbbk.",
		".kbbggggbbbbk.",
		"..kkbbbbbbkk..",
		"....kkkkkk....",
	],
	suitcase: [
		"....kkkkkk....",
		"....k....k....",
		"kkkkkkkkkkkkkk",
		"knnnnnnnnnnnnk",
		"knnynnnnnnynnk",
		"knnynnnnnnynnk",
		"kyyyyyyyyyyyyk",
		"knnynnnnnnynnk",
		"knnynnnnnnynnk",
		"knnnnnnnnnnnnk",
		"kkkkkkkkkkkkkk",
		".kk........kk.",
	],
	trophy: [
		"..kkkkkkkkkk..",
		"kkkyywyyyyykkk",
		"k.kyywyyyyyk.k",
		"k.kyyyyyyyyk.k",
		".kkyyyyyyyykk.",
		"...kyyyyyyk...",
		"....kyyyyk....",
		".....kyyk.....",
		".....kyyk.....",
		"....kkyykk....",
		"...knnnnnnk...",
		"...knnnnnnk...",
		"...kkkkkkkk...",
	],
	star: [
		"....y....",
		"....y....",
		"...yyy...",
		"yyyyyyyyy",
		".yyyyyyy.",
		"..yyyyy..",
		"..yy.yy..",
		".yy...yy.",
		".y.....y.",
	],
	sparkle: ["..t..", "..t..", "tt.tt", "..t..", "..t.."],
	cloud: [
		".....cccc.......",
		"...cccccccc.....",
		"..ccccccccccccc.",
		".cccccccccccccc.",
		"cccccccccccccccc",
		"CCCCCCCCCCCCCCCC",
	],
	sun: [
		"..uuuu..",
		".uuuuuu.",
		"uuuuuuuu",
		"uuuuuuuu",
		"uuuuuuuu",
		"uuuuuuuu",
		".uuuuuu.",
		"..uuuu..",
	],
	hills: [
		"..........gg....................",
		"........gggggg..................",
		"......gggggggggg..........gg....",
		"....gggggggggggggg.....gggggg...",
		"..gggggggGgggggggggggggggggggg..",
		".ggggggggggggggGgggggggggggggggg",
		"gggggGggggggggggggggggggGggggggg",
		"gggggggggggggggggGgggggggggggggg",
		"GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
	],
} as const satisfies Record<string, readonly string[]>;

export type SpriteName = keyof typeof SPRITES;

export const SPRITE_NAMES = Object.keys(SPRITES) as SpriteName[];

/** One SVG path per colour: each horizontal run of a colour becomes a 1-pixel-high rectangle. */
export function spritePaths(
	rows: readonly string[],
): { key: PaletteKey; d: string }[] {
	const byKey = new Map<PaletteKey, string[]>();
	rows.forEach((row, y) => {
		let x = 0;
		while (x < row.length) {
			const char = row[x] ?? ".";
			let end = x + 1;
			while (row[end] === char) end++;
			if (char !== "." && char in PALETTE) {
				const key = char as PaletteKey;
				const parts = byKey.get(key) ?? [];
				parts.push(`M${x} ${y}h${end - x}v1h${x - end}z`);
				byKey.set(key, parts);
			}
			x = end;
		}
	});
	return [...byKey].map(([key, parts]) => ({ key, d: parts.join("") }));
}
