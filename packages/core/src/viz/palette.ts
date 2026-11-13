import { countryColor } from "./geo";

/** Slots of the UI kit's categorical palette (`--vp-cat-1` … `--vp-cat-10`). */
export const COUNTRY_PALETTE_SIZE = 10;

/** Colour of one country code; the same code always gets the same colour. */
export type CountryPalette = (code: string) => string;

/**
 * Gives each country its own slot of the categorical palette, so countries shown
 * together never share a colour. `codes` lists every occurrence (one per photo,
 * stamp, …): the most frequent countries get the slots, ties go by code. Codes
 * beyond the palette size, and codes not in the list, fall back to the hashed
 * `countryColor`.
 */
export function countryPalette(codes: Iterable<string>): CountryPalette {
	const counts = new Map<string, number>();
	for (const raw of codes) {
		const code = raw.toUpperCase();
		if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
	}
	const ranked = [...counts].sort(
		(a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
	);
	const slots = new Map<string, string>();
	ranked.slice(0, COUNTRY_PALETTE_SIZE).forEach(([code], index) => {
		slots.set(code, `var(--vp-cat-${index + 1})`);
	});
	return (code) => slots.get(code.toUpperCase()) ?? countryColor(code);
}
