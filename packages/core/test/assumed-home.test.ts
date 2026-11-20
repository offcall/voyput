import { describe, expect, it } from "vitest";
import {
	assumedHomeGaps,
	buildStays,
	defaultExploreFilters,
	exploreKpis,
	filterStays,
	summarizeStays,
	type TravelStay,
} from "../src/index";

const stay = (
	id: string,
	countryCode: string,
	arrival: string | null,
	departure: string | null,
): TravelStay => ({
	id,
	countryCode,
	place: "",
	kind: "stay",
	arrival: { date: arrival, source: "stamp", method: "plane" },
	departure: { date: departure, source: "stamp", method: "plane" },
	stampIds: [],
	photoIds: [],
	approved: false,
});

const TODAY = "2030-03-01";
const history = [
	stay("a", "AA", "2030-01-01", "2030-01-05"),
	// One day between: a travel window, not a gap.
	stay("b", "BB", "2030-01-07", "2030-01-10"),
	stay("c", "CC", "2030-01-20", "2030-02-01"),
];

describe("assumedHomeGaps", () => {
	it("assumes nothing without a home country", () => {
		expect(assumedHomeGaps(history, null, [], TODAY)).toEqual([]);
	});

	it("fills the gaps between stays and the days after the last one up to today", () => {
		expect(assumedHomeGaps(history, "HH", [], TODAY)).toEqual([
			{
				from: "2030-01-10",
				to: "2030-01-20",
				days: 9,
				countryCode: "HH",
				after: 1,
			},
			{
				from: "2030-02-01",
				to: "2030-03-02",
				days: 28,
				countryCode: "HH",
				after: 2,
			},
		]);
	});

	it("leaves a gap with a stamp inside as a gap", () => {
		expect(
			assumedHomeGaps(history, "HH", [{ date: "2030-01-15" }], TODAY),
		).toEqual([
			{
				from: "2030-02-01",
				to: "2030-03-02",
				days: 28,
				countryCode: "HH",
				after: 2,
			},
		]);
	});

	it("adds nothing after a stay still open or one that ends yesterday", () => {
		const open = [stay("a", "AA", "2030-01-01", null)];
		const yesterday = [stay("a", "AA", "2030-01-01", "2030-02-28")];
		expect(assumedHomeGaps(open, "HH", [], TODAY)).toEqual([]);
		expect(assumedHomeGaps(yesterday, "HH", [], TODAY)).toEqual([]);
	});
});

describe("buildStays with assumed days", () => {
	const options = { birthCountry: "AA", birth: null, today: TODAY };

	it("gives today's stays exactly when nothing is assumed", () => {
		expect(buildStays(history, { ...options, assumed: [] })).toEqual(
			buildStays(history, options),
		);
	});

	it("adds the assumed days at home after their stay, never abroad", () => {
		const assumed = assumedHomeGaps(history, "HH", [], TODAY);
		const stays = buildStays(history, { ...options, assumed });
		expect(
			stays.map((s) => [
				s.id,
				s.countryCode,
				s.start,
				s.end,
				s.assumed ?? false,
			]),
		).toEqual([
			["a", "AA", "2030-01-01", "2030-01-05", false],
			["b", "BB", "2030-01-07", "2030-01-10", false],
			["assumed-2030-01-11", "HH", "2030-01-11", "2030-01-19", true],
			["c", "CC", "2030-01-20", "2030-02-01", false],
			["assumed-2030-02-02", "HH", "2030-02-02", "2030-03-01", true],
		]);
		expect(stays.map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
		const without = buildStays(history, options);
		expect(summarizeStays(stays).daysAbroad).toBe(
			summarizeStays(without).daysAbroad,
		);
		const kpis = exploreKpis(filterStays(stays, defaultExploreFilters(stays)));
		expect(kpis.stays).toBe(3);
		expect(kpis.days).toBe(
			exploreKpis(filterStays(without, defaultExploreFilters(without))).days +
				9 +
				28,
		);
	});
});
