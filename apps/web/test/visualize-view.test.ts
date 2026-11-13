import { WORLD_HEIGHT, WORLD_WIDTH } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { fitView } from "../src/features/visualize/charts/view";

describe("map view", () => {
	it("shows the whole world without known countries", () => {
		expect(fitView([])).toEqual([0, 0, WORLD_WIDTH, WORLD_HEIGHT]);
		expect(fitView(["XX"])).toEqual([0, 0, WORLD_WIDTH, WORLD_HEIGHT]);
	});

	it("zooms to a 2 : 1 box around nearby countries", () => {
		const [x, y, w, h] = fitView(["ES", "FR"]);
		expect(w).toBe(2 * h);
		expect(w).toBeLessThan(WORLD_WIDTH / 2);
		// Both centroids (projected) fall inside the box.
		for (const [lat, lon] of [
			[40.0, -3.5],
			[46.6, 2.2],
		] as const) {
			const px = ((lon + 180) / 360) * WORLD_WIDTH;
			const py = ((90 - lat) / 180) * WORLD_HEIGHT;
			expect(px).toBeGreaterThan(x);
			expect(px).toBeLessThan(x + w);
			expect(py).toBeGreaterThan(y);
			expect(py).toBeLessThan(y + h);
		}
	});

	it("keeps the whole world when travels span most of it", () => {
		expect(fitView(["MX", "JP", "AU"])).toEqual([
			0,
			0,
			WORLD_WIDTH,
			WORLD_HEIGHT,
		]);
	});
});
