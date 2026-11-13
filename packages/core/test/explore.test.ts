import { describe, expect, it } from "vitest";
import {
	buildCountryScatter,
	buildStayCalendar,
	buildStayRoutes,
	buildStays,
	buildStayTimeline,
	buildYearRows,
	COUNTRY_CODES,
	defaultExploreFilters,
	deriveTrips,
	type ExploreFilters,
	exploreKpis,
	filterStays,
	firstVisits,
	groupByCountry,
	type LocationRow,
	pageRecords,
	recordsCsv,
	regionOf,
	type Stay,
	type StayEdge,
	sortRecords,
	summarizeStays,
	type TravelStay,
	yearRange,
} from "../src/index";

const edge = (
	date: string | null,
	source: StayEdge["source"],
	method: StayEdge["method"] = "unknown",
	stampId?: string,
): StayEdge => ({ date, source, method, ...(stampId ? { stampId } : {}) });

const stay = (
	id: string,
	countryCode: string,
	arrival: StayEdge,
	departure: StayEdge,
	extra: Partial<TravelStay> = {},
): TravelStay => ({
	id,
	countryCode,
	place: "",
	kind: "stay",
	arrival,
	departure,
	stampIds: [],
	photoIds: [],
	approved: false,
	...extra,
});

const photo = (
	uuid: string,
	date: string,
	countryCode: string,
): LocationRow => ({
	date: `${date}T12:00:00+02:00`,
	lat: 0,
	lon: 0,
	countryCode,
	country: countryCode,
	city: "",
	source: "apple",
	isVideo: false,
	filename: `${uuid}.jpg`,
	uuid,
});

const locations = [
	photo("ua1", "2016-05-13", "UA"),
	photo("ua2", "2016-05-14", "UA"),
	photo("ua3", "2016-05-14", "UA"),
	photo("ro1", "2016-05-16", "RO"),
	photo("ro2", "2016-05-20", "RO"),
];

/** A history with a "since birth" start, a trip of two countries, a transit and a gap. */
const history: TravelStay[] = [
	stay(
		"birth",
		"MD",
		edge(null, "estimated"),
		edge("2016-05-13", "stamp", "walk"),
	),
	stay(
		"ukraine-romania:0",
		"UA",
		edge("2016-05-13", "stamp", "walk", "s1"),
		edge("2016-05-16", "photos"),
		{
			place: "Odesa, Izmail",
			stampIds: ["s1"],
			photoIds: ["ua1", "ua2", "ua3"],
		},
	),
	stay(
		"ukraine-romania:1",
		"RO",
		edge("2016-05-16", "photos"),
		edge("2016-05-20", "stamp", "plane", "s3"),
		{ place: "Bucharest", stampIds: ["s2", "s3"], photoIds: ["ro1", "ro2"] },
	),
	stay(
		"home:2016-05-21",
		"MD",
		edge("2016-05-21", "stamp", "plane"),
		edge("2016-06-01", "manual", "car"),
	),
	stay(
		"istanbul:0",
		"TR",
		edge("2016-06-01", "manual", "car"),
		edge("2016-06-01", "estimated"),
		{ place: "Istanbul", kind: "transit" },
	),
	stay(
		"home:2016-06-02",
		"MD",
		edge("2016-06-02", "estimated"),
		edge("2016-06-30", "estimated"),
	),
	stay(
		"home:2016-07-11",
		"MD",
		edge("2016-07-11", "estimated"),
		edge("2017-01-01", "estimated"),
	),
	stay(
		"austria:0",
		"AT",
		edge("2017-01-01", "estimated"),
		edge("2017-01-03", "estimated"),
		{ place: "Vienna" },
	),
];

const trips = deriveTrips(history, "MD");
const options = {
	home: "MD",
	birth: null,
	today: "2030-01-01",
	trips,
	locations,
};
const stays = buildStays(history, options);
const all = defaultExploreFilters(stays);
const ids = (rows: readonly Stay[]) => rows.map((r) => r.id);
const run = (patch: Partial<ExploreFilters>) =>
	filterStays(stays, { ...all, ...patch });

describe("buildStays", () => {
	it("gives a border day to the next stay and leaves out an undated birth stay", () => {
		expect(
			stays.map((s) => [s.id, s.countryCode, s.start, s.end, s.days]),
		).toEqual([
			["ukraine-romania:0", "UA", "2016-05-13", "2016-05-15", 3],
			["ukraine-romania:1", "RO", "2016-05-16", "2016-05-20", 5],
			["home:2016-05-21", "MD", "2016-05-21", "2016-05-31", 11],
			["istanbul:0", "TR", "2016-06-01", "2016-06-01", 1],
			["home:2016-06-02", "MD", "2016-06-02", "2016-06-30", 29],
			["home:2016-07-11", "MD", "2016-07-11", "2016-12-31", 174],
			["austria:0", "AT", "2017-01-01", "2017-01-03", 3],
		]);
		expect(stays.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		const born = buildStays(history, { ...options, birth: "1990-02-03" });
		expect(born[0]).toMatchObject({
			id: "birth",
			start: "1990-02-03",
			end: "2016-05-12",
		});
	});

	it("keeps the history's edges and marks estimated ones", () => {
		const [ua, ro, home] = stays;
		expect(ua?.entry).toEqual({
			date: "2016-05-13",
			source: "stamp",
			method: "walk",
			stampId: "s1",
		});
		expect(ua?.exit).toEqual({
			date: "2016-05-16",
			source: "photos",
			method: "unknown",
		});
		expect(ro?.entry.source).toBe("photos");
		expect(ro?.exit).toMatchObject({ source: "stamp", method: "plane" });
		expect(home).toMatchObject({
			home: true,
			kind: "stay",
			tripId: null,
			entry: { source: "stamp", method: "plane", date: "2016-05-21" },
			exit: { source: "manual", method: "car", date: "2016-06-01" },
			estimated: false,
		});
	});

	it("carries trip, place, stamps, photo days and kind", () => {
		const [ua, ro, , tr] = stays;
		expect(ua).toMatchObject({
			tripId: "trip-ukraine-romania:0",
			tripTitle: "Ukraine → Romania",
			country: "Ukraine",
			region: "Europe",
			place: "Odesa, Izmail",
			stamps: 1,
			stopDays: 2,
			estimated: true,
		});
		expect(ro).toMatchObject({ place: "Bucharest", stamps: 2, stopDays: 2 });
		expect(tr).toMatchObject({ kind: "transit", region: "Asia" });
	});

	it("starts the next stay after a one-day stay that kept the border day", () => {
		const hop = buildStays(
			[
				stay(
					"at",
					"AT",
					edge("2019-08-01", "manual"),
					edge("2019-08-01", "photos"),
				),
				stay(
					"de",
					"DE",
					edge("2019-08-01", "photos"),
					edge("2019-08-03", "manual"),
				),
			],
			{ ...options, home: null, trips: [] },
		);
		expect(hop.map((s) => [s.countryCode, s.start, s.end])).toEqual([
			["AT", "2019-08-01", "2019-08-01"],
			["DE", "2019-08-02", "2019-08-03"],
		]);
	});

	it("ends a stay still going on today and marks no home without one", () => {
		const open = buildStays(
			[stay("x", "PL", edge("2029-12-30", "stamp"), edge(null, "estimated"))],
			{ ...options, home: null },
		);
		expect(open[0]).toMatchObject({ end: "2030-01-01", days: 3, home: false });
		expect(summarizeStays(trips, stays)).toEqual({
			trips: 3,
			stays: 7,
			countries: 5,
			firstDate: "2016-05-13",
			lastDate: "2017-01-03",
		});
	});
});

describe("filterStays", () => {
	it("keeps everything with the default filters", () => {
		expect(all).toMatchObject({ from: "2016-05-13", to: "2017-01-03" });
		expect(run({})).toHaveLength(stays.length);
	});

	it("applies home, countries, region, kind and method", () => {
		expect(run({ home: false }).some((r) => r.home)).toBe(false);
		expect(ids(run({ home: false }))).toHaveLength(4);
		expect(ids(run({ countries: ["RO", "AT"] }))).toEqual([
			"ukraine-romania:1",
			"austria:0",
		]);
		expect(ids(run({ region: "Asia" }))).toEqual(["istanbul:0"]);
		expect(ids(run({ kind: "transit" }))).toEqual(["istanbul:0"]);
		expect(ids(run({ method: "plane" }))).toEqual(["home:2016-05-21"]);
	});

	it("applies evidence: manual counts as exact", () => {
		expect(ids(run({ evidence: "exact" }))).toEqual(["home:2016-05-21"]);
		expect(ids(run({ evidence: "stamps" }))).toEqual([
			"ukraine-romania:0",
			"ukraine-romania:1",
			"home:2016-05-21",
		]);
		expect(run({ evidence: "estimated" })).toHaveLength(6);
	});

	it("applies duration buckets and search", () => {
		expect(ids(run({ duration: "day" }))).toEqual(["istanbul:0"]);
		expect(run({ duration: "short" })).toHaveLength(3);
		expect(ids(run({ duration: "medium" }))).toEqual([
			"home:2016-05-21",
			"home:2016-06-02",
		]);
		expect(ids(run({ duration: "long" }))).toEqual(["home:2016-07-11"]);
		expect(ids(run({ search: " BUCHAREST " }))).toEqual(["ukraine-romania:1"]);
		expect(ids(run({ search: "austria" }))).toEqual(["austria:0"]);
	});

	it("clips stays to the date range and the KPIs follow", () => {
		const rows = run({ from: "2016-05-18", to: "2016-06-10" });
		expect(
			rows.map((r) => [r.id, r.clipStart, r.clipEnd, r.clippedDays]),
		).toEqual([
			["ukraine-romania:1", "2016-05-18", "2016-05-20", 3],
			["home:2016-05-21", "2016-05-21", "2016-05-31", 11],
			["istanbul:0", "2016-06-01", "2016-06-01", 1],
			["home:2016-06-02", "2016-06-02", "2016-06-10", 9],
		]);
		const kpis = exploreKpis(rows);
		expect(kpis).toMatchObject({
			stays: 4,
			countries: 3,
			days: 24,
			daysAbroad: 4,
			oneDay: 1,
			transits: 1,
			estimated: 3,
		});
		expect(kpis.longest?.id).toBe("home:2016-05-21");
		expect(exploreKpis(run({ home: false })).daysAbroad).toBe(12);
	});

	it("gives a year range cut to the last stay", () => {
		expect(yearRange(2017, stays)).toEqual({
			from: "2017-01-01",
			to: "2017-01-03",
		});
	});
});

describe("aggregates", () => {
	it("routes only connect back-to-back stays in the original order", () => {
		const routes = buildStayRoutes(run({}));
		expect(routes.map((r) => `${r.from}>${r.to}`).sort()).toEqual([
			"MD>AT",
			"MD>TR",
			"RO>MD",
			"TR>MD",
			"UA>RO",
		]);
		expect(routes.find((r) => r.from === "UA")?.label).toBe(
			"Ukraine → Romania",
		);
		// Romania and Türkiye are adjacent after filtering, not in the history.
		expect(
			buildStayRoutes(run({ countries: ["UA", "RO", "TR"] })).map((r) => [
				r.from,
				r.to,
			]),
		).toEqual([["UA", "RO"]]);
	});

	it("groups clipped days per country", () => {
		const groups = groupByCountry(run({}));
		expect(groups[0]).toMatchObject({
			countryCode: "MD",
			visits: 3,
			days: 214,
			longest: 174,
		});
		expect(groups.find((g) => g.countryCode === "TR")?.transits).toBe(1);
		const scatter = buildCountryScatter(groups);
		expect(scatter.maxDays).toBe(214);
		expect(scatter.points[0]).toMatchObject({ x: 1, y: 1, labelled: true });
		expect(scatter.dayTicks).toEqual([0, 54, 107, 161, 214]);
	});

	it("splits year days across regions that add up to the year", () => {
		const years = buildYearRows(run({}), all.from, all.to);
		expect(years.map((y) => [y.year, y.days, y.visits])).toEqual([
			[2016, 223, 6],
			[2017, 3, 1],
		]);
		const y2016 = years[0];
		expect(y2016?.regions.reduce((n, r) => n + r.days, 0)).toBe(223);
		expect(y2016?.regions.find((r) => r.region === "Asia")?.days).toBe(1);
	});

	it("finds first visits over the whole history", () => {
		const rows = run({ from: "2016-06-01" });
		expect(ids(firstVisits(stays, rows))).toEqual(["istanbul:0", "austria:0"]);
	});
});

describe("views", () => {
	it("builds a Monday-first calendar with the stays of each day", () => {
		const months = buildStayCalendar(run({}), 2016);
		expect(months).toHaveLength(12);
		expect(months[0]?.offset).toBe(4); // 2016-01-01 was a Friday
		const may = months[4];
		expect(may?.days).toHaveLength(31);
		expect(may?.days[12]).toMatchObject({
			date: "2016-05-13",
			countryCode: "UA",
		});
		expect(may?.days[0]?.countryCode).toBeNull();
		expect(months[5]?.days[0]).toMatchObject({
			countryCode: "TR",
			oneDay: true,
		});
	});

	it("places timeline bars by clipped days within each year", () => {
		const years = buildStayTimeline(run({}));
		expect(years.map((y) => y.year)).toEqual([2016, 2017]);
		const at = years[1]?.bars[0];
		expect(at?.left).toBe(0);
		expect(at?.width).toBeCloseTo(3 / 365);
	});
});

describe("records", () => {
	it("sorts, pages and exports CSV", () => {
		const rows = run({});
		expect(ids(sortRecords(rows, "days", true)).slice(0, 2)).toEqual([
			"home:2016-07-11",
			"home:2016-06-02",
		]);
		expect(sortRecords(rows, "start", false)[0]?.id).toBe("ukraine-romania:0");
		expect(pageRecords(rows, 5, 3)).toMatchObject({ page: 2, pages: 3 });
		expect(pageRecords(rows, 2, 3).rows).toHaveLength(1);
		const csv = recordsCsv(rows.slice(0, 1)).split("\r\n");
		expect(csv[0]?.startsWith('﻿"country","code","start"')).toBe(true);
		expect(csv[1]).toContain('"Odesa, Izmail"');
		expect(csv[1]).toContain('"On foot","Stamp"');
	});
});

describe("regions", () => {
	it("places every country code and Kosovo in a region", () => {
		expect(COUNTRY_CODES.filter((c) => regionOf(c) === "Other")).toEqual([]);
		expect(regionOf("XK")).toBe("Europe");
		expect(regionOf("AQ")).toBe("Antarctica");
		expect(regionOf("ZZ")).toBe("Other");
	});
});
