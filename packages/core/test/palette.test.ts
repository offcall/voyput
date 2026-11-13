import { describe, expect, it } from "vitest";
import { COUNTRY_PALETTE_SIZE, countryColor, countryPalette } from "../src";

describe("countryPalette", () => {
	const demo = ["UA", "UA", "UA", "ES", "ES", "PL", "IT", "IT", "GE", "FR"];

	it("gives the demo countries distinct palette slots", () => {
		const colour = countryPalette(demo);
		const colours = ["UA", "ES", "PL", "IT", "GE", "FR"].map(colour);
		expect(new Set(colours).size).toBe(6);
		for (const c of colours) expect(c).toMatch(/^var\(--vp-cat-\d+\)$/);
		expect(colour("UA")).toBe("var(--vp-cat-1)");
		expect(colour("ES")).toBe("var(--vp-cat-2)");
		expect(colour("IT")).toBe("var(--vp-cat-3)");
	});

	it("is deterministic: same input order or not, same colours", () => {
		const a = countryPalette(demo);
		const b = countryPalette([...demo].reverse());
		for (const code of demo) expect(a(code)).toBe(b(code));
		expect(a("ua")).toBe(a("UA"));
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
