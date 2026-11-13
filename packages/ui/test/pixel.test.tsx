import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PixelArt } from "../src/pixel/PixelArt";
import {
	PALETTE,
	SPRITE_NAMES,
	SPRITES,
	spritePaths,
} from "../src/pixel/sprites";

describe("pixel sprites", () => {
	it("are rectangular grids drawn only with palette colours", () => {
		for (const name of SPRITE_NAMES) {
			const rows = SPRITES[name];
			const width = rows[0]?.length ?? 0;
			expect(width, name).toBeGreaterThan(0);
			for (const row of rows) {
				expect(row.length, `${name}: ${row}`).toBe(width);
				for (const char of row)
					expect(char === "." || char in PALETTE, `${name}: ${char}`).toBe(
						true,
					);
			}
		}
	});

	it("merge each horizontal run into one rectangle per colour", () => {
		expect(spritePaths(["kk.g", "..gg"])).toEqual([
			{ key: "k", d: "M0 0h2v1h-2z" },
			{ key: "g", d: "M3 0h1v1h-1zM2 1h2v1h-2z" },
		]);
	});

	it("renders at the given scale and is decorative without a title", () => {
		const { container, rerender } = render(<PixelArt name="star" scale={3} />);
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("width")).toBe("27");
		expect(svg?.getAttribute("aria-hidden")).toBe("true");
		rerender(<PixelArt name="star" title="Star" />);
		expect(svg?.getAttribute("aria-label")).toBe("Star");
		expect(svg?.hasAttribute("aria-hidden")).toBe(false);
	});
});
