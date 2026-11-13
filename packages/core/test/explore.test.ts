import { describe, expect, it } from "vitest";
import {
	type Boundary,
	buildCountryScatter,
	buildStayCalendar,
	buildStayRoutes,
	buildStays,
	buildStayTimeline,
	buildYearRows,
	COUNTRY_CODES,
	defaultExploreFilters,
	type ExploreFilters,
	exploreKpis,
	filterStays,
	firstVisits,
	groupByCountry,
	pageRecords,
	recordsCsv,
	regionOf,
	type Stay,
	sortRecords,
	summarizeStays,
	type Trip,
	type TripStop,
	yearRange,
} from "../src/index";

const edge = (
	date: string,
	source: Boundary["source"],
	method: string,
	stampId?: string,
): Boundary => ({ date, source, method, ...(stampId ? { stampId } : {}) });

const stop = (
	day: string,
	countryCode: string,
	cities: string[] = [],
	kind: TripStop["kind"] = "stay",
): TripStop => ({
	id: `${day}|${countryCode}`,
	day,
	countryCode,
	country: countryCode,
	cities,
	kind,
});

const trip = (
	id: string,
	start: string,
	end: string,
	stops: TripStop[],
	arrival: Boundary,
	departure: Boundary,
	stampIds: string[] = [],
): Trip => ({
	id,
	title: id,
	start,
	end,
	confirmed: true,
	arrival,
	departure,
	stops,
	stampIds,
});

const trips: Trip[] = [
	// Listed out of order on purpose: stays come out chronological.
	trip(
		"austria",
		"2017-01-01",
		"2017-01-03",
		[stop("2017-01-02", "AT", ["Vienna"])],
		edge("2017-01-01", "unknown", "unknown"),
		edge("2017-01-03", "unknown", "unknown"),
	),
	trip(
		"ukraine-romania",
		"2016-05-13",
		"2016-05-20",
		[
			stop("2016-05-14", "UA", ["Odesa"]),
			stop("2016-05-13", "UA", ["Odesa", "Izmail"]),
			stop("2016-05-16", "RO", ["Bucharest"]),
			stop("2016-05-20", "RO"),
		],
		edge("2016-05-13", "stamp", "foot", "s1"),
		edge("2016-05-20", "stamp", "plane", "s3"),
		["s1", "s2", "s3"],
	),
	trip(
		"istanbul",
		"2016-06-01",
		"2016-06-01",
		[stop("2016-06-01", "TR", ["Istanbul"], "transit")],
		edge("2016-06-01", "manual", "car"),
		edge("2016-06-01", "unknown", "unknown"),
	),
	trip(
		"empty",
		"2016-07-01",
		"2016-07-10",
		[],
		edge("2016-07-01", "unknown", "unknown"),
		edge("2016-07-10", "unknown", "unknown"),
	),
];

const stamps = [
	{ id: "s1", date: "2016-05-13", countryCode: "UA" },
	{ id: "s2", date: "2016-05-16", countryCode: "RO" },
	{ id: "s3", date: "2016-05-20", countryCode: "RO" },
	{ id: "other", date: "2016-05-17", countryCode: "RO" },
];

const stays = buildStays(trips, "MD", stamps);
const all = defaultExploreFilters(stays);
const ids = (rows: readonly Stay[]) => rows.map((r) => r.id);
const run = (patch: Partial<ExploreFilters>) =>
	filterStays(stays, { ...all, ...patch });

describe("buildStays", () => {
	it("splits trips into country runs and fills home gaps between trips", () => {
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
	});

	it("takes outer edges from the trip boundaries and inner edges from photos", () => {
		const [ua, ro, home] = stays;
		expect(ua?.entry).toEqual({
			date: "2016-05-13",
			source: "stamp",
			method: "foot",
			stampId: "s1",
		});
		expect(ua?.exit).toEqual({
			date: "2016-05-15",
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
			exit: { source: "manual", method: "car", date: "2016-05-31" },
			estimated: false,
		});
	});

	it("carries trip, cities, stamps, stop days and kind", () => {
		const [ua, ro, , tr] = stays;
		expect(ua).toMatchObject({
			tripId: "ukraine-romania",
			tripTitle: "ukraine-romania",
			country: "Ukraine",
			region: "Europe",
			place: "Odesa, Izmail",
			stamps: 1,
			stopDays: 2,
			estimated: true,
		});
		// "other" is not one of the trip's stamps.
		expect(ro).toMatchObject({ place: "Bucharest", stamps: 2, stopDays: 2 });
		expect(tr).toMatchObject({ kind: "transit", region: "Asia" });
	});

	it("lets a border day with stops in two countries end one run and start the next", () => {
		const border = trip(
			"border",
			"2019-07-01",
			"2019-07-10",
			// France sorts before Italy, but Italy is the run already open on the 8th.
			[
				stop("2019-07-02", "IT"),
				stop("2019-07-08", "FR"),
				stop("2019-07-08", "IT"),
				stop("2019-07-09", "FR"),
			],
			edge("2019-07-01", "manual", "plane"),
			edge("2019-07-10", "manual", "plane"),
		);
		expect(
			buildStays([border], null).map((s) => [s.countryCode, s.start, s.end]),
		).toEqual([
			["IT", "2019-07-01", "2019-07-08"],
			["FR", "2019-07-08", "2019-07-10"],
		]);
	});

	it("gives no home stays without a home and counts trips without stops", () => {
		const away = buildStays(trips, null);
		expect(away.some((s) => s.home)).toBe(false);
		expect(away).toHaveLength(4);
		expect(away[1]?.stamps).toBe(0);
		expect(summarizeStays(trips, away)).toEqual({
			trips: 4,
			tripsWithoutStops: 1,
			stays: 4,
			countries: 4,
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
		// Without home stays, trips are next in order but days apart.
		const away = buildStays(trips, null);
		expect(
			buildStayRoutes(filterStays(away, defaultExploreFilters(away))).map(
				(r) => r.from,
			),
		).toEqual(["UA"]);
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
