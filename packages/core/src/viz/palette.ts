import { countryColor } from "./geo";

/** Slots of the UI kit's categorical palette (`--vp-cat-1` … `--vp-cat-10`). */
export const COUNTRY_PALETTE_SIZE = 10;

/** Colour of one country code; the same code always gets the same colour. */
export type CountryPalette = (code: string) => string;

/** Country codes (upper case) by count, most first; ties go by code. */
export function rankCountries(
	counts: Iterable<readonly [code: string, count: number]>,
): string[] {
	const totals = new Map<string, number>();
	for (const [raw, count] of counts) {
		const code = raw.toUpperCase();
		if (code) totals.set(code, (totals.get(code) ?? 0) + count);
	}
	return [...totals]
		.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
		.map(([code]) => code);
}

/**
 * Gives each country its own slot of the categorical palette, in the order of
 * `ranked` (e.g. from `rankCountries`), so countries shown together never share
 * a colour. Codes beyond the palette size, and codes not in the list, fall back
 * to the hashed `countryColor`.
 */
export function countryPalette(ranked: readonly string[]): CountryPalette {
	const slots = new Map<string, string>();
	for (const code of ranked.map((c) => c.toUpperCase())) {
		if (slots.size === COUNTRY_PALETTE_SIZE) break;
		if (code && !slots.has(code))
			slots.set(code, `var(--vp-cat-${slots.size + 1})`);
	}
	return (code) => slots.get(code.toUpperCase()) ?? countryColor(code);
}
