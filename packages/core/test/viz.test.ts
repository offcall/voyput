import { describe, expect, it } from "vitest";
import type { LocationRow } from "../src";
import { buildVizData, buildWorldShapes, splitRowsByRanges } from "../src";

function row(date: string, countryCode: string, lat = 0, lon = 0): LocationRow {
	return {
		date,
		lat,
		lon,
		countryCode,
		country: countryCode,
		city: "",
		source: "photo",
		isVideo: false,
		filename: "",
		uuid: date,
	};
}

// DE for two days, one day in FR (with a single DE photo that day), then back to DE.
const rows = [
	row("2024-05-01T10:00:00Z", "DE", 52.52, 13.4),
	row("2024-05-02T10:00:00Z", "DE", 52.52, 13.4),
	row("2024-05-03T09:00:00Z", "FR", 48.86, 2.35),
	row("2024-05-03T12:00:00Z", "FR", 48.86, 2.35),
	row("2024-05-03T20:00:00Z", "DE", 52.52, 13.4),
	row("2025-01-10T10:00:00Z", "DE", 52.52, 13.4),
];

describe("viz aggregates", () => {
	it("collapses days into country periods and counts transitions", () => {
		const data = buildVizData([rows]);

		expect(
			data.movements.map((m) => [m.code, m.start, m.end, m.photos]),
		).toEqual([
			["DE", "2024-05-01", "2024-05-02", 2],
			["FR", "2024-05-03", "2024-05-03", 3],
			["DE", "2025-01-10", "2025-01-10", 1],
		]);
		expect(data.transitions).toEqual([
			{ from: "DE", to: "FR", count: 1 },
			{ from: "FR", to: "DE", count: 1 },
		]);
		expect(data.countries.map((c) => [c.code, c.photos, c.years])).toEqual([
			["DE", 4, { "2024": 3, "2025": 1 }],
			["FR", 2, { "2024": 2 }],
		]);
		expect(data.years).toEqual(["2024", "2025"]);
		// Berlin → Paris → Berlin is about 2 × 877 km.
		expect(data.distances.totalKm).toBeGreaterThan(1740);
		expect(data.distances.totalKm).toBeLessThan(1770);
	});

	it("never joins two selected stays across the gap between them", () => {
		// Stay 1: two days in Berlin. Stay 2: the Paris day. The 2025 Berlin photo is in neither.
		const trips = [
			{ start: "2024-05-03", end: "2024-05-03" },
			{ start: "2024-05-01", end: "2024-05-02" },
			{ start: "2024-05-03", end: "2024-05-03" },
		];
		const ranges = splitRowsByRanges(rows, trips);
		expect(ranges.map((r) => r.length)).toEqual([2, 3]);

		const data = buildVizData(ranges);
		expect(data.movements.map((m) => [m.code, m.range])).toEqual([
			["DE", 0],
			["FR", 1],
		]);
		expect(data.moves).toEqual([]);
		expect(data.transitions).toEqual([]);
		// Only Paris → Berlin inside range 2 (~877 km), not Berlin → Paris across the gap.
		expect(data.distances.segmentCount).toBe(3);
		expect(data.distances.totalKm).toBeGreaterThan(870);
		expect(data.distances.totalKm).toBeLessThan(885);
	});

	it("keeps every row when no stay is selected", () => {
		expect(splitRowsByRanges(rows, [])).toEqual([rows]);
	});
});

describe("world shapes", () => {
	it("draws Polygon and MultiPolygon countries and skips other geometry", () => {
		const square = (lon: number, lat: number) => [
			[lon, lat],
			[lon + 1, lat],
			[lon + 1, lat + 1],
			[lon, lat + 1],
			[lon, lat],
		];
		const world = buildWorldShapes({
			features: [
				{
					properties: { name: "Germany" },
					geometry: { type: "Polygon", coordinates: [square(10, 50)] },
				},
				{
					properties: { name: "Japan" },
					geometry: {
						type: "MultiPolygon",
						coordinates: [[square(135, 35)], [square(140, 40)]],
					},
				},
				{
					properties: { name: "Nowhere" },
					geometry: { type: "Point", coordinates: [0, 0] },
				},
			],
		});
		expect(world.countryPaths.DE?.match(/M/g)).toHaveLength(1);
		expect(world.countryPaths.JP?.match(/M/g)).toHaveLength(2);
		expect(world.landPath.match(/M/g)).toHaveLength(3);
		expect(world.rings).toHaveLength(3);
		expect(world.rings[0]?.[0]).toEqual([50, 10]);
		// Lon 10, lat 50 on the 1000 × 500 box.
		expect(world.countryPaths.DE?.startsWith("M527.8 111.1")).toBe(true);
	});
});
