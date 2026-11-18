import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	buildCountryLocator,
	type CountryOutline,
	decodeCountryOutlines,
	OUTLINE_SCALE,
} from "../src";

const square = (lon: number, lat: number, size: number): [number, number][] => [
	[lon, lat],
	[lon + size, lat],
	[lon + size, lat + size],
	[lon, lat + size],
	[lon, lat],
];

/**
 * FR: a 10° square with a 2° hole and an island; DE beside it; SM an
 * enclave inside FR's square drawn without a hole for it; FJ across ±180°.
 */
const OUTLINES: CountryOutline[] = [
	{
		code: "FR",
		rings: [square(0, 40, 10), square(4, 44, 2), square(20, 0, 1)],
	},
	{ code: "DE", rings: [square(10, 40, 10)] },
	{ code: "SM", rings: [square(1, 41, 0.1)] },
	{ code: "FJ", rings: [square(179, -17, 1), square(-180, -17, 0.5)] },
];

describe("country at a point", () => {
	const countryAt = buildCountryLocator(OUTLINES);

	it("finds the outline a point is in, islands and enclaves included", () => {
		expect(countryAt(42, 2)).toBe("FR");
		expect(countryAt(45, 15)).toBe("DE");
		expect(countryAt(0.5, 20.5)).toBe("FR");
		expect(countryAt(41.05, 1.05)).toBe("SM");
		expect(countryAt(-16.5, 179.5)).toBe("FJ");
	});

	it("gives the nearest country within 50 km and nothing further out", () => {
		// 0.3° north of FR's edge is ~33 km.
		expect(countryAt(50.3, 5)).toBe("FR");
		expect(countryAt(51, 5)).toBeNull();
		// Inside the hole, about 1° (~80 km at 45°N) from every edge.
		expect(countryAt(45, 5)).toBeNull();
		// 0.2° west of FJ's part east of -180°, across the antimeridian.
		expect(countryAt(-16.8, 178.8)).toBe("FJ");
		expect(countryAt(-16.8, -179.3)).toBe("FJ");
		expect(buildCountryLocator([])(42, 2)).toBeNull();
	});

	it("decodes integer deltas and leaves malformed rings out", () => {
		const ring = [0, 0, 10, 0, 0, 10, -10, 0].map((v) => v * OUTLINE_SCALE);
		expect(
			decodeCountryOutlines({
				scale: OUTLINE_SCALE,
				countries: { AB: [ring, [1, 2, 3]], cd: [ring], EF: "x", GH: [["a"]] },
			}),
		).toEqual([
			{
				code: "AB",
				rings: [
					[
						[0, 0],
						[10, 0],
						[10, 10],
						[0, 10],
					],
				],
			},
		]);
		expect(decodeCountryOutlines(null)).toEqual([]);
	});
});

describe("country at a point, with the outlines the app ships", () => {
	const countryAt = buildCountryLocator(
		decodeCountryOutlines(
			JSON.parse(
				readFileSync(
					"apps/web/src/features/import/csv/assets/country-outlines.json",
					"utf8",
				),
			),
		),
	);

	it.each([
		["Paris", 48.8566, 2.3522, "FR"],
		["Tokyo", 35.6762, 139.6503, "JP"],
		["Sydney Opera House", -33.8568, 151.2153, "AU"],
		["Singapore, Marina Bay", 1.2834, 103.8607, "SG"],
		["Johor Bahru, across the strait", 1.4655, 103.7578, "MY"],
		["Hong Kong, Central", 22.2819, 114.1582, "HK"],
		["Shenzhen, across the river", 22.5431, 114.0579, "CN"],
		["Macau", 22.1987, 113.5439, "MO"],
		["Manama", 26.2285, 50.586, "BH"],
		["Monaco, Monte Carlo", 43.7397, 7.4275, "MC"],
		["Andorra la Vella", 42.5063, 1.5218, "AD"],
		["Vatican, St Peter's Basilica", 41.9033, 12.4535, "VA"],
		["Rome", 41.8933, 12.4829, "IT"],
		["San Marino", 43.9356, 12.4473, "SM"],
		["Vaduz", 47.141, 9.5209, "LI"],
		["Malé", 4.1755, 73.5093, "MV"],
		["Port Louis", -20.1609, 57.5012, "MU"],
		["Maseru", -29.3151, 27.4869, "LS"],
		["Geneva", 46.2044, 6.1432, "CH"],
		["Annemasse", 46.1934, 6.2342, "FR"],
		["Strasbourg", 48.5734, 7.7521, "FR"],
		["Kehl, across the Rhine", 48.5726, 7.8155, "DE"],
		["El Paso", 31.7619, -106.485, "US"],
		["Ciudad Juárez", 31.6904, -106.4245, "MX"],
		["Nicosia, north", 35.1856, 33.3823, "CY"],
		["Reykjavík harbour", 64.1505, -21.9406, "IS"],
		["Saint-Denis, Réunion", -20.8823, 55.4504, "RE"],
		["Pointe-à-Pitre, Guadeloupe", 16.2411, -61.5331, "GP"],
		["Longyearbyen, Svalbard", 78.2232, 15.6267, "SJ"],
		["Cayenne, French Guiana", 4.9224, -52.3135, "GF"],
		["Kralendijk, Bonaire", 12.1443, -68.2655, "BQ"],
		["Oslo", 59.9139, 10.7522, "NO"],
		["Amsterdam", 52.3676, 4.9041, "NL"],
		["Simferopol, Crimea", 44.9521, 34.1024, "UA"],
		["Sevastopol, Crimea", 44.6166, 33.5254, "UA"],
		["Krasnodar, across the Kerch Strait", 45.0355, 38.9753, "RU"],
	])("%s is %s", (_place, lat, lon, code) => {
		expect(countryAt(lat, lon)).toBe(code);
	});

	it("leaves the open sea without a country", () => {
		expect(countryAt(30, -40)).toBeNull();
	});
});
