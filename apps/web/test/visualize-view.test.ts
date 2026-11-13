import {
	buildVizData,
	type LocationRow,
	projectEquirect,
	WORLD_HEIGHT,
	WORLD_WIDTH,
} from "@voyput/core";
import { describe, expect, it } from "vitest";
import { monthPoints } from "../src/features/visualize/charts/CalendarChart";
import { fitLatLon, fitView } from "../src/features/visualize/charts/view";

const row = (
	day: string,
	lat: number,
	lon: number,
	n: number,
): LocationRow => ({
	date: `${day}T12:00:00+03:00`,
	lat,
	lon,
	countryCode: "RU",
	country: "Russia",
	city: "",
	source: "apple",
	isVideo: false,
	filename: `IMG_${n}.jpg`,
	uuid: `photo-${n}`,
});

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

	it("fits the heatmap to the photos, not to country centroids", () => {
		// Russia only: the centroid sits near Moscow, the photos reach Vladivostok.
		const points = Float32Array.from([
			55.75, 37.62, 59.94, 30.31, 43.12, 131.89, 53.0, 158.65,
		]);
		const [x, y, w, h] = fitLatLon(points);
		for (let i = 0; i < points.length; i += 2) {
			const [px, py] = projectEquirect(points[i] ?? 0, points[i + 1] ?? 0);
			expect(px).toBeGreaterThanOrEqual(x);
			expect(px).toBeLessThanOrEqual(x + w);
			expect(py).toBeGreaterThanOrEqual(y);
			expect(py).toBeLessThanOrEqual(y + h);
		}
	});
});

describe("photos per month", () => {
	it("keeps a year without photos as twelve empty months", () => {
		const data = buildVizData([
			[row("2022-03-10", 55.75, 37.62, 1), row("2024-07-01", 55.75, 37.62, 2)],
		]);
		const points = monthPoints(data);
		expect(points).toHaveLength(36);
		expect(points.map((p) => p.label).filter((l) => /^\d{4}$/.test(l))).toEqual(
			["2022", "2023", "2024"],
		);
		const year2023 = points.slice(12, 24);
		expect(year2023.every((p) => p.value === 0)).toBe(true);
		expect(points[2]?.value).toBe(1);
		expect(points[30]?.value).toBe(1);
	});
});
