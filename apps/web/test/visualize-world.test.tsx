import { render, screen } from "@testing-library/react";
import {
	buildVizData,
	buildWorldShapes,
	COUNTRY_CENTROIDS,
	COUNTRY_CODES,
	journeyWaypoints,
	type LocationRow,
	legsPathD,
	WORLD_NAME_TO_CODE,
} from "@voyput/core";
import { describe, expect, it } from "vitest";
import { deriveWorldTable, interiorPoint } from "../../../scripts/world/derive";
import { ALPHA3_TO_ALPHA2 } from "../../../scripts/world/iso3";
import { POINT_CENTROIDS } from "../../../scripts/world/points";
import worldText from "../src/features/visualize/assets/world-countries.geojson?raw";
import {
	inRing,
	ringsFromPath,
} from "../src/features/visualize/charts/globeProjection";
import { MapChart } from "../src/features/visualize/charts/MapChart";

const geoJson: unknown = JSON.parse(worldText);
const world = buildWorldShapes(geoJson);
const ALL_CODES = [...COUNTRY_CODES, "XK"].sort();

/** Countries far from the ~50 of the old exports; MV has no outline at 110m. */
const SAMPLE = [
	["PE", "Peru"],
	["KE", "Kenya"],
	["NZ", "New Zealand"],
	["IS", "Iceland"],
	["MN", "Mongolia"],
	["FJ", "Fiji"],
	["XK", "Kosovo"],
	["MV", "Maldives"],
] as const;

describe("world table", () => {
	it("is what the generator derives from the vendored outlines", () => {
		const derived = deriveWorldTable(geoJson);
		expect(WORLD_NAME_TO_CODE).toEqual(derived.nameToCode);
		expect(COUNTRY_CENTROIDS).toEqual(derived.centroids);
	});

	it("maps every ISO 3166-1 code and XK from alpha-3", () => {
		expect([...new Set(Object.values(ALPHA3_TO_ALPHA2))].sort()).toEqual(
			ALL_CODES,
		);
	});

	it("has a centroid for every ISO code a stamp or photo can have", () => {
		expect(Object.keys(COUNTRY_CENTROIDS).sort()).toEqual(ALL_CODES);
	});

	it("keeps hand points only for countries without an outline", () => {
		for (const code of Object.keys(POINT_CENTROIDS))
			expect(world.countryPaths[code], code).toBeUndefined();
	});

	it("gives every outline a code, with the Natural Earth oddities", () => {
		expect(Object.keys(WORLD_NAME_TO_CODE)).toHaveLength(180);
		expect(WORLD_NAME_TO_CODE.Kosovo).toBe("XK");
		expect(WORLD_NAME_TO_CODE["Northern Cyprus"]).toBe("CY");
		expect(WORLD_NAME_TO_CODE.Somaliland).toBe("SO");
		expect(WORLD_NAME_TO_CODE.France).toBe("FR");
		expect(WORLD_NAME_TO_CODE.Norway).toBe("NO");
		expect(new Set(Object.values(WORLD_NAME_TO_CODE)).size).toBe(178);
		expect(Object.keys(world.countryPaths)).toHaveLength(178);
	});

	it("puts every outline country's centroid on its own land", () => {
		for (const code of new Set(Object.values(WORLD_NAME_TO_CODE))) {
			const c = COUNTRY_CENTROIDS[code];
			const rings = ringsFromPath(world.countryPaths[code] ?? "");
			expect(c && rings.some((ring) => inRing(c[0], c[1], ring)), code).toBe(
				true,
			);
		}
	});

	it("moves a bent country's centroid back onto its land", () => {
		// A "C" open to the east: the area centroid falls in the gap.
		const c: [number, number][] = [
			[0, 0],
			[10, 0],
			[10, 2],
			[2, 2],
			[2, 8],
			[10, 8],
			[10, 10],
			[0, 10],
			[0, 0],
		];
		const [lat, lon] = interiorPoint(c);
		expect(lat).toBeCloseTo(5);
		expect(lon).toBeCloseTo(1);
	});
});

let n = 0;
const photo = (
	countryCode: string,
	country: string,
	day: number,
): LocationRow => {
	const [lat, lon] = COUNTRY_CENTROIDS[countryCode] ?? [0, 0];
	return {
		date: `2024-03-${String(day).padStart(2, "0")}T12:00:00Z`,
		lat,
		lon,
		countryCode,
		country,
		city: "",
		source: "apple",
		isVideo: false,
		filename: `IMG_${++n}.jpg`,
		uuid: `photo-${n}`,
	};
};

describe("every country on the flat map", () => {
	const data = buildVizData([
		SAMPLE.map(([code, name], i) => photo(code, name, i + 1)),
	]);

	it("fills each visited outline and marks MV with a spot", () => {
		render(<MapChart data={data} world={world} />);
		for (const [code, name] of SAMPLE) {
			const mark = screen.getByRole("img", { name: `${name}: 1 photos` });
			expect(mark.tagName, code).toBe(code === "MV" ? "rect" : "path");
			if (code !== "MV")
				expect(mark.getAttribute("d")).toBe(world.countryPaths[code]);
		}
	});

	it("draws an arc for every move between them", () => {
		render(<MapChart data={data} world={world} />);
		for (let i = 1; i < SAMPLE.length; i++) {
			const [fromCode, from] = SAMPLE[i - 1] ?? ["", ""];
			const [toCode, to] = SAMPLE[i] ?? ["", ""];
			expect(
				screen.getByRole("img", {
					name: `${from} → ${to}: ${fromCode} → ${toCode}`,
				}).tagName,
			).toBe("path");
		}
	});
});

describe("journey legs to every country", () => {
	it("anchors stays without photos at the centroid and joins them", () => {
		const stays = SAMPLE.map(([code], i) => ({
			id: code,
			countryCode: code,
			start: `2024-0${i + 1}-01`,
			end: `2024-0${i + 1}-05`,
		}));
		const { waypoints, skipped } = journeyWaypoints(stays, []);
		expect(skipped).toBe(0);
		expect(waypoints.map((w) => w.countryCode)).toEqual(
			SAMPLE.map(([code]) => code),
		);
		expect(waypoints[7]?.lat).toBe(COUNTRY_CENTROIDS.MV?.[0]);
		expect(legsPathD(waypoints, 0, waypoints.length).split("M")).toHaveLength(
			SAMPLE.length,
		);
	});
});
