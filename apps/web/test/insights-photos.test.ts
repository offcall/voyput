import {
	buildStays,
	defaultExploreFilters,
	type ExploreFilters,
	filterStays,
	type LocationRow,
	type TravelStay,
} from "@voyput/core";
import { describe, expect, it } from "vitest";
import { photosInStays } from "../src/features/visualize/filterPhotos";

const edge = (date: string | null) => ({
	date,
	source: "manual" as const,
	method: "plane" as const,
});

const stay = (
	id: string,
	countryCode: string,
	arrival: string,
	departure: string,
	kind: "stay" | "transit" = "stay",
): TravelStay => ({
	id,
	countryCode,
	place: "",
	kind,
	arrival: edge(arrival),
	departure: edge(departure),
	stampIds: [],
	photoIds: [],
	approved: true,
});

const photo = (day: string, countryCode: string): LocationRow => ({
	date: `${day}T12:00:00+02:00`,
	lat: 45,
	lon: 27,
	countryCode,
	country: countryCode,
	city: "",
	source: "apple",
	isVideo: false,
	filename: `${day}-${countryCode}.jpg`,
	uuid: `${day}-${countryCode}`,
});

/** Romania until 5 March, a layover in Turkey that day, then Japan from 5 March. */
const history = [
	stay("ro", "RO", "2024-03-01", "2024-03-05"),
	stay("tr", "TR", "2024-03-05", "2024-03-05", "transit"),
	stay("jp", "JP", "2024-03-05", "2024-03-09"),
];
const rows = [
	photo("2024-03-02", "RO"),
	photo("2024-03-05", "RO"),
	photo("2024-03-05", "TR"),
	photo("2024-03-06", "JP"),
];
const stays = buildStays(history, {
	birthCountry: null,
	birth: null,
	today: "2030-01-01",
});
const defaults = defaultExploreFilters(stays);

const photosFor = (patch: Partial<ExploreFilters>) => {
	const filters = { ...defaults, ...patch };
	return photosInStays({
		rows,
		filtered: filterStays(stays, filters),
		history,
		filters,
		birth: null,
		today: "2030-01-01",
	})
		.flat()
		.map((r) => r.uuid);
};

describe("photos inside filtered stays", () => {
	it("keeps the departure day of a stay whose border day went to the next one", () => {
		// Explore ends Romania on 4 March; its photos still run to the 5th.
		expect(stays.find((s) => s.id === "ro")?.end).toBe("2024-03-04");
		expect(photosFor({ stayIds: ["ro"] })).toEqual([
			"2024-03-02-RO",
			"2024-03-05-RO",
		]);
	});

	it("cuts the stay's own days to the filter's dates", () => {
		expect(
			photosFor({ stayIds: ["ro"], from: "2024-03-03", to: "2024-03-10" }),
		).toEqual(["2024-03-05-RO"]);
	});

	it("leaves out a layover's photos inside a selected stay unless transits are asked for", () => {
		expect(photosFor({ countries: ["RO", "JP"] })).toEqual([
			"2024-03-02-RO",
			"2024-03-05-RO",
			"2024-03-06-JP",
		]);
		// A picked layover keeps its day, with its country's photos.
		const layoverDay = ["2024-03-05-RO", "2024-03-05-TR"];
		expect(photosFor({ kind: "transit" })).toEqual(layoverDay);
		expect(photosFor({ stayIds: ["tr"] })).toEqual(layoverDay);
	});

	it("finds nothing when no stay passes", () => {
		expect(photosFor({ countries: ["FR"] })).toEqual([]);
	});
});
