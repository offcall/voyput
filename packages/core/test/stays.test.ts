import { describe, expect, it } from "vitest";
import {
	addStay,
	applyDismissed,
	canSplitAt,
	clearStayIds,
	gapBetween,
	type LocationRow,
	legacyTripStays,
	mergeKept,
	type Stamp,
	splitStay,
	stayCounts,
	stayHints,
	suggestStays,
	type TravelStay,
	usableStamps,
	withBirthStay,
	withoutTransitRows,
} from "../src/index";

const photo = (
	date: string,
	countryCode: string,
	time = "12:00",
	city = "",
): LocationRow => ({
	date: `${date}T${time}:00+02:00`,
	lat: 0,
	lon: 0,
	countryCode,
	country: countryCode,
	city,
	source: "apple",
	isVideo: false,
	filename: `IMG_${date}.jpg`,
	uuid: `${date}-${time}-${countryCode}`,
});

const stamp = (
	id: string,
	date: string,
	countryCode: string,
	direction: Stamp["direction"],
	borderCrossing: Stamp["borderCrossing"] = "plane",
): Stamp => ({
	id,
	passportId: "p1",
	photoId: "ph1",
	direction,
	borderCrossing,
	dateText: date,
	date,
	country: countryCode,
	countryCode,
	location: null,
	confidence: 90,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: true,
});

const suggest = (stamps: Stamp[], locations: LocationRow[] = []) =>
	suggestStays({ stamps: usableStamps(stamps), locations });

/** Country, arrival, departure, sources and kind, for short assertions. */
const brief = (stays: readonly TravelStay[]) =>
	stays.map((s) => [
		s.countryCode,
		s.arrival.date,
		s.departure.date,
		`${s.arrival.source}/${s.departure.source}`,
		s.kind,
	]);

describe("suggestStays", () => {
	it("suggests stays only where there is evidence: no home since birth, none after a trip", () => {
		const stays = suggest([
			stamp("a", "2016-08-10", "UA", "exit"),
			stamp("b", "2016-08-10", "ES", "entry"),
			stamp("c", "2016-08-24", "ES", "exit"),
			stamp("d", "2016-08-24", "UA", "entry"),
		]);
		expect(brief(stays)).toEqual([
			["UA", "2016-08-10", "2016-08-10", "estimated/stamp", "stay"],
			["ES", "2016-08-10", "2016-08-24", "stamp/stamp", "stay"],
			["UA", "2016-08-24", null, "stamp/estimated", "stay"],
		]);
		expect(stays[1]?.stampIds).toEqual(["b", "c"]);
		expect(stays[1]?.arrival).toMatchObject({ method: "plane", stampId: "b" });
		// Leaving a country is not coming back anywhere: what follows is a gap.
		expect(
			brief(
				suggest([
					stamp("a", "2016-08-10", "ES", "entry"),
					stamp("b", "2016-08-24", "ES", "exit"),
				]),
			),
		).toEqual([["ES", "2016-08-10", "2016-08-24", "stamp/stamp", "stay"]]);
	});

	it("splits photos on the border day, which both stays share, from the first photo on", () => {
		const stays = suggest(
			[],
			[
				photo("2017-05-01", "UA"),
				photo("2017-05-03", "UA", "08:00"),
				photo("2017-05-03", "PL", "15:00", "Kraków"),
				photo("2017-05-06", "PL", "10:00"),
				photo("2017-05-06", "UA", "20:00"),
				photo("2017-05-08", "UA"),
			],
		);
		expect(brief(stays)).toEqual([
			["UA", "2017-05-01", "2017-05-03", "photos/photos", "stay"],
			["PL", "2017-05-03", "2017-05-06", "photos/photos", "stay"],
			["UA", "2017-05-06", null, "photos/estimated", "stay"],
		]);
		expect(stays[1]?.place).toBe("Kraków");
		expect(stays[1]?.photoIds).toHaveLength(2);
	});

	it("suggests a same-day plane stay as a transit, followed by an overnight flight", () => {
		const stays = suggest([
			stamp("a", "2023-04-27", "UA", "exit"),
			stamp("b", "2023-04-27", "QA", "entry"),
			stamp("c", "2023-04-27", "QA", "exit"),
			stamp("d", "2023-04-28", "TH", "entry"),
		]);
		expect(brief(stays)).toEqual([
			["UA", "2023-04-27", "2023-04-27", "estimated/stamp", "stay"],
			["QA", "2023-04-27", "2023-04-27", "stamp/stamp", "transit"],
			["TH", "2023-04-28", null, "stamp/estimated", "stay"],
		]);
		const hints = stayHints(stays, { stamps: [], passports: [], birth: null });
		expect(hints[2]).toEqual([
			{
				kind: "overnight",
				severity: "info",
				from: "2023-04-27",
				to: "2023-04-28",
			},
		]);
	});

	it("estimates a missing exit from the next arrival", () => {
		const stays = suggest([
			stamp("a", "2018-10-12", "GE", "entry"),
			stamp("b", "2018-10-20", "UA", "entry"),
		]);
		expect(brief(stays)).toEqual([
			["GE", "2018-10-12", "2018-10-20", "stamp/estimated", "stay"],
			["UA", "2018-10-20", null, "stamp/estimated", "stay"],
		]);
	});

	it("leaves the days after an exit to the photos, as a window, or as a gap", () => {
		const ferry = suggest([
			stamp("a", "2019-06-01", "UA", "exit", "ship"),
			stamp("b", "2019-06-03", "GE", "entry", "ship"),
		]);
		expect(brief(ferry).map((s) => s.slice(0, 3))).toEqual([
			["UA", "2019-06-01", "2019-06-01"],
			["GE", "2019-06-03", null],
		]);
		const hints = stayHints(ferry, { stamps: [], passports: [], birth: null });
		expect(hints[1]?.map((h) => h.kind)).toEqual(["long-window"]);

		const viaTurkey = suggest(
			[
				stamp("a", "2019-06-01", "UA", "exit"),
				stamp("b", "2019-06-05", "GE", "entry"),
			],
			[photo("2019-06-02", "TR"), photo("2019-06-04", "TR")],
		);
		expect(brief(viaTurkey).map((s) => s.slice(0, 4))).toEqual([
			["UA", "2019-06-01", "2019-06-01", "estimated/stamp"],
			["TR", "2019-06-01", "2019-06-05", "estimated/estimated"],
			["GE", "2019-06-05", null, "stamp/estimated"],
		]);

		// Photos a week away from the stamps: their own days, gaps around them.
		const gaps = suggest(
			[
				stamp("a", "2019-06-01", "UA", "exit"),
				stamp("b", "2019-06-30", "GE", "entry"),
			],
			[photo("2019-06-10", "TR"), photo("2019-06-12", "TR")],
		);
		expect(brief(gaps).map((s) => s.slice(0, 4))).toEqual([
			["UA", "2019-06-01", "2019-06-01", "estimated/stamp"],
			["TR", "2019-06-10", "2019-06-12", "photos/photos"],
			["GE", "2019-06-30", null, "stamp/estimated"],
		]);
		const hinted = stayHints(gaps, { stamps: [], passports: [], birth: null });
		expect(hinted.flat()).toEqual([]);
		expect(gapBetween(gaps[0] as TravelStay, gaps[1] as TravelStay)).toEqual({
			from: "2019-06-01",
			to: "2019-06-10",
			days: 8,
		});
	});

	it("subdivides a Schengen stay by photos and keeps one stay per country", () => {
		const stays = suggest(
			[
				stamp("a", "2019-07-01", "IT", "entry"),
				stamp("b", "2019-07-15", "FR", "exit"),
			],
			[
				photo("2019-07-02", "IT"),
				photo("2019-07-09", "FR"),
				photo("2019-07-15", "FR"),
			],
		);
		expect(brief(stays).map((s) => s.slice(0, 4))).toEqual([
			["IT", "2019-07-01", "2019-07-09", "stamp/photos"],
			["FR", "2019-07-09", "2019-07-15", "photos/stamp"],
		]);
		expect(stays[1]?.stampIds).toEqual(["b"]);
	});

	it("leaves the Schengen exit before the entry of the same day", () => {
		const stays = suggest([
			stamp("a", "2019-07-01", "IT", "entry"),
			stamp("b", "2019-07-15", "UA", "entry"),
			stamp("c", "2019-07-15", "FR", "exit"),
		]);
		expect(brief(stays).map((s) => s.slice(0, 3))).toEqual([
			["IT", "2019-07-01", "2019-07-15"],
			["FR", "2019-07-15", "2019-07-15"],
			["UA", "2019-07-15", null],
		]);
	});

	it("goes on from an exit to the photos that follow", () => {
		const stays = suggest(
			[
				stamp("a", "2020-01-01", "FR", "entry"),
				stamp("b", "2020-01-05", "FR", "exit"),
			],
			[
				photo("2020-01-06", "ES"),
				photo("2020-01-09", "ES"),
				photo("2020-01-12", "UA"),
			],
		);
		expect(brief(stays).map((s) => s.slice(0, 3))).toEqual([
			["FR", "2020-01-01", "2020-01-05"],
			["ES", "2020-01-05", "2020-01-12"],
			["UA", "2020-01-12", null],
		]);
		// Weeks later, photos abroad are a stay of their own after a gap.
		const later = suggest(
			[
				stamp("a", "2020-01-01", "FR", "entry"),
				stamp("b", "2020-01-05", "FR", "exit"),
			],
			[photo("2020-03-01", "ES")],
		);
		expect(brief(later).map((s) => s.slice(0, 3))).toEqual([
			["FR", "2020-01-01", "2020-01-05"],
			["ES", "2020-03-01", null],
		]);
	});

	it("keeps repeated visits to one country apart across a gap", () => {
		const stays = suggest([
			stamp("a", "2020-01-01", "ES", "entry"),
			stamp("b", "2020-01-05", "ES", "exit"),
			stamp("c", "2020-03-01", "ES", "entry"),
			stamp("d", "2020-03-05", "ES", "exit"),
		]);
		expect(brief(stays).map((s) => s.slice(0, 3))).toEqual([
			["ES", "2020-01-01", "2020-01-05"],
			["ES", "2020-03-01", "2020-03-05"],
		]);
		expect(stays.map((s) => s.stampIds)).toEqual([
			["a", "b"],
			["c", "d"],
		]);
	});

	it("fills an unknown method from the other side of the same crossing", () => {
		const stays = suggest([
			stamp("a", "2020-01-01", "UA", "exit", "unknown"),
			stamp("b", "2020-01-01", "MD", "entry", "car"),
		]);
		expect(stays[0]?.departure.method).toBe("car");
	});
});

/** A photo at a local time with its own offset, as the CSV stores it. */
const shot = (
	date: string,
	time: string,
	offset: string,
	countryCode: string,
	city = "",
): LocationRow => ({
	...photo(date, countryCode, time, city),
	date: `${date}T${time}:00${offset}`,
	uuid: `${date}-${time}${offset}-${countryCode}`,
});

describe("transit photos on the day of the next entry stamp", () => {
	it("puts an airside Istanbul stop between Kyiv and Tokyo on one day", () => {
		const stays = suggest(
			[
				stamp("out", "2024-03-10", "UA", "exit"),
				stamp("in", "2024-03-10", "JP", "entry"),
			],
			[
				shot("2024-03-10", "06:00", "+02:00", "UA", "Kyiv"),
				shot("2024-03-10", "11:00", "+03:00", "TR", "Istanbul"),
				shot("2024-03-10", "13:30", "+03:00", "TR", "Istanbul"),
				shot("2024-03-10", "23:30", "+09:00", "JP", "Tokyo"),
				shot("2024-03-12", "10:00", "+09:00", "JP", "Tokyo"),
			],
		);
		expect(brief(stays)).toEqual([
			["UA", "2024-03-10", "2024-03-10", "estimated/stamp", "stay"],
			["TR", "2024-03-10", "2024-03-10", "estimated/estimated", "transit"],
			["JP", "2024-03-10", null, "stamp/estimated", "stay"],
		]);
		expect(stays[1]?.photoIds).toHaveLength(2);
		expect(stays[1]?.arrival.method).toBe("plane");
		expect(stays[2]?.stampIds).toEqual(["in"]);
		expect(stays[2]?.photoIds).toHaveLength(2);
	});

	it("keeps the transit when Tokyo has no photo on the entry day", () => {
		const stays = suggest(
			[
				stamp("out", "2024-03-10", "UA", "exit"),
				stamp("in", "2024-03-10", "JP", "entry"),
			],
			[
				shot("2024-03-10", "06:00", "+02:00", "UA"),
				shot("2024-03-10", "13:30", "+03:00", "TR"),
				shot("2024-03-12", "10:00", "+09:00", "JP"),
			],
		);
		expect(brief(stays).map((s) => [s[0], s[1], s[2], s[4]])).toEqual([
			["UA", "2024-03-10", "2024-03-10", "stay"],
			["TR", "2024-03-10", "2024-03-10", "transit"],
			["JP", "2024-03-10", null, "stay"],
		]);
	});

	it("makes an overnight Doha connection without stamps one transit", () => {
		const stays = suggest(
			[
				stamp("out", "2023-11-02", "UA", "exit"),
				stamp("in", "2023-11-03", "TH", "entry"),
			],
			[
				shot("2023-11-02", "09:00", "+02:00", "UA"),
				shot("2023-11-02", "22:40", "+03:00", "QA", "Doha"),
				shot("2023-11-03", "02:10", "+03:00", "QA", "Doha"),
				shot("2023-11-03", "14:00", "+07:00", "TH", "Bangkok"),
			],
		);
		expect(brief(stays)).toEqual([
			["UA", "2023-11-02", "2023-11-02", "estimated/stamp", "stay"],
			["QA", "2023-11-02", "2023-11-03", "estimated/estimated", "transit"],
			["TH", "2023-11-03", null, "stamp/estimated", "stay"],
		]);
		expect(stays[1]?.photoIds).toHaveLength(2);
	});

	it("keeps an overnight stop with its own stamps a stay", () => {
		const stays = suggest([
			stamp("a", "2023-11-02", "UA", "exit"),
			stamp("b", "2023-11-02", "QA", "entry"),
			stamp("c", "2023-11-03", "QA", "exit"),
			stamp("d", "2023-11-03", "TH", "entry"),
		]);
		expect(stays[1]).toMatchObject({ countryCode: "QA", kind: "stay" });
	});

	it("splits a day with photos in three countries by photo time", () => {
		const stays = suggest(
			[
				stamp("a", "2022-07-01", "RS", "exit", "car"),
				stamp("b", "2022-07-01", "HU", "entry", "car"),
			],
			[
				shot("2022-06-30", "12:00", "+02:00", "RS"),
				shot("2022-07-01", "08:00", "+02:00", "RS"),
				shot("2022-07-01", "11:00", "+02:00", "HU"),
				shot("2022-07-01", "18:00", "+02:00", "AT"),
				shot("2022-07-03", "10:00", "+02:00", "AT"),
			],
		);
		expect(brief(stays)).toEqual([
			["RS", "2022-06-30", "2022-07-01", "photos/stamp", "stay"],
			["HU", "2022-07-01", "2022-07-01", "stamp/photos", "stay"],
			["AT", "2022-07-01", null, "photos/estimated", "stay"],
		]);
	});

	it("does not move photos of a country left after the entry stamp's first photo", () => {
		// Entered Japan in the morning, took a ferry to Korea in the evening.
		const stays = suggest(
			[stamp("in", "2024-03-10", "JP", "entry")],
			[
				shot("2024-03-10", "09:00", "+09:00", "JP"),
				shot("2024-03-10", "20:00", "+09:00", "KR"),
			],
		);
		expect(brief(stays).map((s) => [s[0], s[1], s[2]])).toEqual([
			["JP", "2024-03-10", "2024-03-10"],
			["KR", "2024-03-10", null],
		]);
		expect(stays[0]?.stampIds).toEqual(["in"]);
	});
});

const stay = (
	id: string,
	countryCode: string,
	arrival: string | null,
	departure: string | null,
	extra: Partial<TravelStay> = {},
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
	...extra,
});

describe("stayHints", () => {
	it("flags overlaps, reversed dates and missing dates as errors; a gap is not one", () => {
		const stays = [
			stay("a", "UA", null, "2020-01-10"),
			stay("b", "PL", "2020-01-08", "2020-01-12"),
			stay("c", "UA", "2020-01-20", "2020-01-18"),
			stay("d", "TR", null, null),
			stay("e", "UA", "2020-03-01", null),
		];
		const hints = stayHints(stays, { stamps: [], passports: [], birth: null });
		expect(hints.map((list) => list.map((h) => h.kind))).toEqual([
			[],
			["overlap"],
			["order"],
			["missing-arrival", "missing-departure"],
			[],
		]);
		expect(hints[1]?.[0]).toMatchObject({ days: 2 });
		expect(gapBetween(stays[1] as TravelStay, stays[2] as TravelStay)).toEqual({
			from: "2020-01-12",
			to: "2020-01-20",
			days: 7,
		});
		// One day between is a travel window, not a gap.
		expect(
			gapBetween(
				stay("x", "UA", null, "2020-01-01"),
				stay("y", "PL", "2020-01-03", null),
			),
		).toBeNull();
		expect(stayCounts(stays, hints)).toEqual({
			left: 5,
			withErrors: 3,
			approved: 0,
		});
	});

	it("flags a stamp no stay in its country covers, and stamps outside the passport", () => {
		const stamps = usableStamps([
			stamp("x", "2020-01-05", "TR", "entry"),
			stamp("y", "2020-01-02", "PL", "entry"),
		]);
		const stays = [
			stay("a", "UA", null, "2020-01-01"),
			stay("b", "PL", "2020-01-01", "2020-01-10", { stampIds: ["y"] }),
		];
		const hints = stayHints(stays, {
			stamps,
			passports: [{ id: "p1", validFrom: "2020-01-03", validTo: null }],
			birth: "1990-01-01",
		});
		expect(hints[0]).toEqual([]);
		expect(hints[1]?.map((h) => h.kind)).toEqual([
			"passport-validity",
			"stamp-mismatch",
		]);
	});

	it("flags a stamp in a gap no stay covers on the stay after it", () => {
		const stamps = usableStamps([
			stamp("g", "2020-01-15", "TR", "entry"),
			stamp("z", "2020-03-01", "PL", "exit"),
		]);
		const stays = [
			stay("a", "UA", null, "2020-01-10"),
			stay("b", "PL", "2020-01-20", "2020-02-01"),
		];
		const hints = stayHints(stays, { stamps, passports: [], birth: null });
		expect(hints[0]).toEqual([]);
		expect(hints[1]?.map((h) => h.kind)).toEqual([
			"stamp-mismatch",
			"stamp-mismatch",
		]);
	});

	it("approves clear only exact, error-free stays", () => {
		const stays = [
			stay("a", "UA", null, "2020-01-01", {
				arrival: { date: null, source: "estimated", method: "unknown" },
			}),
			stay("b", "PL", "2020-01-01", "2020-01-10"),
			stay("c", "UA", "2020-01-10", "2020-02-01", {
				departure: { date: "2020-02-01", source: "photos", method: "unknown" },
			}),
			stay("d", "TR", "2020-02-01", null),
		];
		const hints = stayHints(stays, { stamps: [], passports: [], birth: null });
		expect(clearStayIds(stays, hints, null)).toEqual(["b", "d"]);
		expect(clearStayIds(stays, hints, "1990-01-01")).toEqual(["a", "b", "d"]);
	});
});

describe("mergeKept", () => {
	it("cuts suggestions back to the stays the user keeps", () => {
		const suggested = [stay("home", "UA", null, null)];
		const kept = [
			stay("es", "ES", "2016-08-10", "2016-08-24", { approved: true }),
		];
		expect(brief(mergeKept(suggested, kept)).map((s) => s.slice(0, 3))).toEqual(
			[
				["UA", null, "2016-08-10"],
				["ES", "2016-08-10", "2016-08-24"],
				["UA", "2016-08-24", null],
			],
		);
		const estimate = (date: string) =>
			({ date, source: "estimated", method: "unknown" }) as const;
		const longer = [
			stay("home", "UA", null, "2016-08-09", {
				departure: estimate("2016-08-09"),
			}),
			stay("es-guess", "ES", "2016-08-09", "2016-08-30", {
				arrival: estimate("2016-08-09"),
				departure: estimate("2016-08-30"),
			}),
			stay("back", "UA", "2016-08-30", null, {
				arrival: estimate("2016-08-30"),
			}),
		];
		expect(brief(mergeKept(longer, kept)).map((s) => s.slice(0, 3))).toEqual([
			["UA", null, "2016-08-10"],
			["ES", "2016-08-10", "2016-08-24"],
			["UA", "2016-08-24", null],
		]);
		const inside = [stay("pl", "ES", "2016-08-12", "2016-08-14")];
		expect(mergeKept(inside, kept).map((s) => s.id)).toEqual(["es"]);
	});
});

describe("rebuilding around kept stays", () => {
	it("keeps one copy of an approved same-day transit", () => {
		const stays = suggest([
			stamp("a", "2023-04-27", "UA", "exit"),
			stamp("b", "2023-04-27", "QA", "entry"),
			stamp("c", "2023-04-27", "QA", "exit"),
			stamp("d", "2023-04-28", "TH", "entry"),
		]);
		const transit = { ...(stays[1] as TravelStay), approved: true };
		const rebuilt = mergeKept(stays, [transit]);
		expect(rebuilt.map((s) => s.countryCode)).toEqual(["UA", "QA", "TH"]);
		expect(rebuilt[1]?.approved).toBe(true);
		// Under another id (a stay the user edited), it still replaces the suggestion.
		const renamed = mergeKept(stays, [{ ...transit, id: "mine" }]);
		expect(renamed.map((s) => s.id)).toEqual([
			stays[0]?.id,
			"mine",
			stays[2]?.id,
		]);
	});
});

describe("applyDismissed", () => {
	it("drops the stays of a trip the user deleted and joins what it separated", () => {
		const stays = suggest([
			stamp("a", "2016-08-10", "UA", "exit"),
			stamp("b", "2016-08-10", "ES", "entry"),
			stamp("c", "2016-08-24", "ES", "exit"),
			stamp("d", "2016-08-24", "UA", "entry"),
			stamp("e", "2017-05-03", "PL", "entry"),
			stamp("f", "2017-05-12", "UA", "entry"),
		]);
		const kept = applyDismissed(stays, [
			{ start: "2016-08-10", end: "2016-08-24" },
		]);
		expect(brief(kept).map((s) => s.slice(0, 3))).toEqual([
			["UA", "2016-08-10", "2017-05-03"],
			["PL", "2017-05-03", "2017-05-12"],
			["UA", "2017-05-12", null],
		]);
		expect(kept[0]?.stampIds).toEqual(["a", "d"]);
		// A period that only crosses a stay's edge leaves it.
		expect(
			applyDismissed(stays, [{ start: "2017-05-08", end: "2017-05-20" }]),
		).toEqual(stays);
	});
});

describe("transit photos", () => {
	const stays = [
		stay("it", "IT", "2019-07-01", "2019-07-09"),
		stay("qa", "QA", "2019-07-09", "2019-07-09", { kind: "transit" }),
		stay("fr", "FR", "2019-07-09", "2019-07-15"),
	];

	it("drops photos taken in a transit country during the transit", () => {
		const rows = [photo("2019-07-09", "QA"), photo("2019-07-09", "FR")];
		expect(withoutTransitRows(rows, stays).map((r) => r.countryCode)).toEqual([
			"FR",
		]);
	});
});

describe("legacyTripStays", () => {
	it("turns a stored trip into one stay per country, keeping its edges", () => {
		const stays = legacyTripStays({
			id: "t1",
			title: "Italy → France",
			start: "2019-07-01",
			end: "2019-07-15",
			confirmed: true,
			arrival: { date: "2019-07-01", source: "manual", method: "foot" },
			departure: { date: "2019-07-15", source: "unknown", method: "unknown" },
			stops: [
				{
					id: "1",
					day: "2019-07-02",
					countryCode: "IT",
					country: "Italy",
					cities: ["Rome"],
					kind: "stay",
				},
				{
					id: "2",
					day: "2019-07-09",
					countryCode: "FR",
					country: "France",
					cities: [],
					kind: "stay",
				},
			],
			stampIds: ["s1"],
		});
		expect(brief(stays)).toEqual([
			["IT", "2019-07-01", "2019-07-09", "manual/photos", "stay"],
			["FR", "2019-07-09", "2019-07-15", "photos/estimated", "stay"],
		]);
		expect(stays[0]).toMatchObject({
			place: "Rome",
			approved: true,
			arrival: { method: "walk" },
		});
	});
});

describe("editing stays", () => {
	const days = {
		stamps: new Map([
			["in", "2020-01-01"],
			["mid", "2020-01-10"],
			["out", "2020-01-20"],
		]),
		photos: new Map([
			["p1", "2020-01-05"],
			["p2", "2020-01-10"],
			["p3", "2020-01-15"],
		]),
	};
	const es = stay("es", "ES", "2020-01-01", "2020-01-20", {
		arrival: {
			date: "2020-01-01",
			source: "stamp",
			method: "plane",
			stampId: "in",
		},
		departure: {
			date: "2020-01-20",
			source: "stamp",
			method: "car",
			stampId: "out",
		},
		stampIds: ["in", "mid", "out"],
		photoIds: ["p1", "p2", "p3"],
		place: "Madrid",
		approved: true,
	});

	it("splits a stay at a day inside it into two of its country", () => {
		const list = [stay("fr", "FR", "2019-12-20", "2020-01-01"), es];
		const out = splitStay(list, "es", "2020-01-10", days);
		expect(brief(out).map((s) => s.slice(0, 4))).toEqual([
			["FR", "2019-12-20", "2020-01-01", "stamp/stamp"],
			["ES", "2020-01-01", "2020-01-10", "stamp/manual"],
			["ES", "2020-01-10", "2020-01-20", "manual/stamp"],
		]);
		const [, first, second] = out;
		expect(first).toMatchObject({
			id: "es",
			stampIds: ["in", "mid"],
			photoIds: ["p1"],
			approved: false,
			edited: true,
		});
		expect(second).toMatchObject({
			id: "es-2020-01-10",
			place: "Madrid",
			stampIds: ["out"],
			photoIds: ["p2", "p3"],
			departure: { method: "car", stampId: "out" },
			edited: true,
		});
	});

	it("splits only inside the stay", () => {
		expect(canSplitAt(es, "2020-01-01")).toBe(false);
		expect(canSplitAt(es, "2020-01-02")).toBe(true);
		expect(canSplitAt(es, "2020-01-20")).toBe(false);
		expect(
			canSplitAt(
				{ ...es, departure: { ...es.departure, date: null } },
				"2024-01-01",
			),
		).toBe(true);
		expect(splitStay([es], "es", "2020-01-20", days)).toEqual([es]);
	});

	it("adds a stay set by hand in date order", () => {
		const list = [
			stay("a", "UA", "2020-01-01", "2020-01-05"),
			stay("b", "PL", "2020-02-01", null),
		];
		const { stays, id } = addStay(list, {
			countryCode: "TR",
			arrival: "2020-01-05",
			departure: "2020-02-01",
		});
		expect(id).toBe("stay-2020-01-05-tr-added");
		expect(brief(stays)).toEqual([
			["UA", "2020-01-01", "2020-01-05", "stamp/stamp", "stay"],
			["TR", "2020-01-05", "2020-02-01", "manual/manual", "stay"],
			["PL", "2020-02-01", null, "stamp/stamp", "stay"],
		]);
		expect(stays[1]).toMatchObject({ approved: false, edited: true });
	});

	it("starts the history since birth only with a birth country and date", () => {
		const list = [stay("es", "ES", "2016-08-10", "2016-08-24")];
		const md = { birthCountry: "MD", birth: "1997-05-21" };
		expect(withBirthStay(list, { birthCountry: "MD", birth: null })).toEqual(
			list,
		);
		expect(
			withBirthStay(list, { birthCountry: null, birth: "1997-05-21" }),
		).toEqual(list);
		const born = withBirthStay(list, md);
		expect(brief(born).map((s) => s.slice(0, 4))).toEqual([
			["MD", null, "2016-08-10", "estimated/estimated"],
			["ES", "2016-08-10", "2016-08-24", "stamp/stamp"],
		]);
		expect(born[0]?.sinceBirth).toBe(true);
		// The same setting again changes nothing.
		expect(withBirthStay(born, md)).toEqual(born);
		// The generated stay follows a new country and goes with the setting.
		const ro = withBirthStay(born, { ...md, birthCountry: "RO" });
		expect(ro.map((s) => [s.id, s.countryCode])).toEqual([
			[born[0]?.id, "RO"],
			["es", "ES"],
		]);
		expect(withBirthStay(ro, { ...md, birth: null })).toEqual(list);
		// Once the user edits it, it is theirs.
		const edited = [{ ...(born[0] as TravelStay), edited: true }, ...list];
		expect(withBirthStay(edited, { ...md, birthCountry: "RO" })).toEqual(
			edited,
		);
		expect(withBirthStay(edited, { birthCountry: null, birth: null })).toEqual(
			edited,
		);
		// A stay of the user's own since birth is left alone.
		const own = [stay("mine", "UA", null, "2016-08-10"), ...list];
		expect(withBirthStay(own, md)).toEqual(own);
	});
});

