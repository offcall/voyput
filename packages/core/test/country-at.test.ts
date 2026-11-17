import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCountryLocator } from "../src";

const square = (lon: number, lat: number, size: number): [number, number][] => [
	[lon, lat],
	[lon + size, lat],
	[lon + size, lat + size],
	[lon, lat + size],
	[lon, lat],
];

/** France: a 10° square with a 2° hole and an island; Germany beside it. */
const WORLD = {
	type: "FeatureCollection",
	features: [
		{
			properties: { name: "France" },
			geometry: {
				type: "MultiPolygon",
				coordinates: [
					[square(0, 40, 10), square(4, 44, 2)],
					[square(20, 0, 1)],
				],
			},
		},
		{
			properties: { name: "Germany" },
			geometry: { type: "Polygon", coordinates: [square(10, 40, 10)] },
		},
		{
			properties: { name: "Nowhere Land" },
			geometry: { type: "Polygon", coordinates: [square(-50, -50, 10)] },
		},
		{ properties: { name: "Spain" }, geometry: { type: "Point" } },
	],
};

describe("country at a point", () => {
	const countryAt = buildCountryLocator(WORLD);

	it("finds the outline a point is in, islands included", () => {
		expect(countryAt(42, 2)).toBe("FR");
		expect(countryAt(45, 15)).toBe("DE");
		expect(countryAt(0.5, 20.5)).toBe("FR");
	});

	it("gives the nearest country within 50 km and nothing further out", () => {
		// 0.3° north of France's edge is ~33 km.
		expect(countryAt(50.3, 5)).toBe("FR");
		expect(countryAt(51, 5)).toBeNull();
		// Inside the hole, about 1° (~80 km at 45°N) from every edge.
		expect(countryAt(45, 5)).toBeNull();
		// Outlines without a known name or without polygons are ignored.
		expect(countryAt(-45, -45)).toBeNull();
		expect(buildCountryLocator(null)(42, 2)).toBeNull();
	});

	it("knows real places from the outlines the app ships", () => {
		const real = buildCountryLocator(
			JSON.parse(
				readFileSync(
					"apps/web/src/features/visualize/assets/world-countries.geojson",
					"utf8",
				),
			),
		);
		expect(real(48.8566, 2.3522)).toBe("FR");
		expect(real(52.52, 13.405)).toBe("DE");
		expect(real(35.6762, 139.6503)).toBe("JP");
		expect(real(38.7223, -9.1393)).toBe("PT");
		expect(real(-33.8688, 151.2093)).toBe("AU");
		expect(real(40.7128, -74.006)).toBe("US");
		expect(real(64.1466, -21.9426)).toBe("IS");
		expect(real(30, -40)).toBeNull();
	});
});
