import { describe, expect, it } from "vitest";
import type { LocationRow } from "../src";
import { buildVizData, filterRowsByTrips } from "../src";

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
		const data = buildVizData(rows);

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

	it("keeps only rows inside the selected trips", () => {
		const trip = { start: "2024-05-03", end: "2024-05-03" };
		expect(filterRowsByTrips(rows, [trip])).toHaveLength(3);
		expect(filterRowsByTrips(rows, [])).toHaveLength(rows.length);
	});
});
