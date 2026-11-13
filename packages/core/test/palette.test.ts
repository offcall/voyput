import { describe, expect, it } from "vitest";
import {
	COUNTRY_PALETTE_SIZE,
	countryColor,
	countryPalette,
	rankCountries,
} from "../src";

describe("country palette", () => {
	const demo: [string, number][] = [
		["FR", 81],
		["UA", 1943],
		["IT", 93],
		["ES", 154],
		["GE", 89],
		["PL", 107],
	];

	it("ranks countries by count, ties by code, merging case", () => {
		expect(rankCountries(demo)).toEqual(["UA", "ES", "PL", "IT", "GE", "FR"]);
		expect(
			rankCountries([
				["de", 2],
				["AT", 3],
				["DE", 1],
			]),
		).toEqual(["AT", "DE"]);
	});

	it("gives the demo countries distinct palette slots", () => {
		const colour = countryPalette(rankCountries(demo));
		const colours = ["UA", "ES", "PL", "IT", "GE", "FR"].map(colour);
		expect(new Set(colours).size).toBe(6);
		for (const c of colours) expect(c).toMatch(/^var\(--vp-cat-\d+\)$/);
		expect(colour("UA")).toBe("var(--vp-cat-1)");
		expect(colour("it")).toBe("var(--vp-cat-4)");
	});

	it("gives the same colours on every call with the same counts", () => {
		const a = countryPalette(rankCountries(demo));
		const b = countryPalette(rankCountries([...demo].reverse()));
		for (const [code] of demo) expect(a(code)).toBe(b(code));
	});

	it("falls back to the hashed colour beyond the palette and for unknown codes", () => {
		const codes = Array.from({ length: COUNTRY_PALETTE_SIZE + 2 }, (_, i) =>
			String.fromCharCode(65 + i).repeat(2),
		);
		const colour = countryPalette(codes);
		const slotted = codes.slice(0, COUNTRY_PALETTE_SIZE).map(colour);
		expect(new Set(slotted).size).toBe(COUNTRY_PALETTE_SIZE);
		const last = codes[COUNTRY_PALETTE_SIZE + 1] ?? "";
		expect(colour(last)).toBe(countryColor(last));
		expect(colour("ZZ")).toBe(countryColor("ZZ"));
	});
});
