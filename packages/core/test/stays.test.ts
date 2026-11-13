import { describe, expect, it } from "vitest";
import {
	applyDismissed,
	clearStayIds,
	deriveTrips,
	homeOf,
	type LocationRow,
	legacyTripStays,
	mergeKept,
	type Stamp,
	stayCounts,
	stayHints,
	suggestStays,
	type TravelStay,
	usableStamps,
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

const suggest = (stamps: Stamp[], locations: LocationRow[] = [], home = "UA") =>
	suggestStays({ stamps: usableStamps(stamps), locations, home });

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
	it("starts at home since birth and returns home after a stamped trip", () => {
		const stays = suggest([
			stamp("a", "2016-08-10", "UA", "exit"),
			stamp("b", "2016-08-10", "ES", "entry"),
			stamp("c", "2016-08-24", "ES", "exit"),
			stamp("d", "2016-08-24", "UA", "entry"),
		]);
		expect(brief(stays)).toEqual([
			["UA", null, "2016-08-10", "estimated/stamp", "stay"],
			["ES", "2016-08-10", "2016-08-24", "stamp/stamp", "stay"],
			["UA", "2016-08-24", null, "stamp/estimated", "stay"],
		]);
		expect(stays[1]?.stampIds).toEqual(["b", "c"]);
		expect(stays[1]?.arrival).toMatchObject({ method: "plane", stampId: "b" });
	});

	it("splits a photos-only trip on the border day, which both stays share", () => {
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
			["UA", null, "2017-05-03", "estimated/photos", "stay"],
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
			["UA", null, "2023-04-27", "estimated/stamp", "stay"],
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
			["UA", null, "2018-10-12", "estimated/estimated", "stay"],
			["GE", "2018-10-12", "2018-10-20", "stamp/estimated", "stay"],
			["UA", "2018-10-20", null, "stamp/estimated", "stay"],
		]);
	});

	it("leaves the days after leaving home to the photos, or as a window", () => {
		const ferry = suggest([
			stamp("a", "2019-06-01", "UA", "exit", "ship"),
			stamp("b", "2019-06-03", "GE", "entry", "ship"),
		]);
		expect(brief(ferry).map((s) => s.slice(0, 3))).toEqual([
			["UA", null, "2019-06-01"],
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
		expect(brief(viaTurkey).map((s) => s.slice(0, 3))).toEqual([
			["UA", null, "2019-06-01"],
			["TR", "2019-06-01", "2019-06-05"],
			["GE", "2019-06-05", null],
		]);
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
			["UA", null, "2019-07-01", "estimated/estimated"],
			["IT", "2019-07-01", "2019-07-09", "stamp/photos"],
			["FR", "2019-07-09", "2019-07-15", "photos/stamp"],
			["UA", "2019-07-15", null, "estimated/estimated"],
		]);
		expect(stays[2]?.stampIds).toEqual(["b"]);
	});

	it("leaves the Schengen exit before the home entry of the same day", () => {
		const stays = suggest([
			stamp("a", "2019-07-01", "IT", "entry"),
			stamp("b", "2019-07-15", "UA", "entry"),
			stamp("c", "2019-07-15", "FR", "exit"),
		]);
		expect(brief(stays).map((s) => s.slice(0, 3))).toEqual([
			["UA", null, "2019-07-01"],
			["IT", "2019-07-01", "2019-07-15"],
			["FR", "2019-07-15", "2019-07-15"],
			["UA", "2019-07-15", null],
		]);
	});

	it("goes on from a foreign exit to photos abroad instead of assuming home", () => {
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
			["UA", null, "2020-01-01"],
			["FR", "2020-01-01", "2020-01-05"],
			["ES", "2020-01-05", "2020-01-12"],
			["UA", "2020-01-12", null],
		]);
		// Weeks later, photos abroad are a new trip after time at home.
		const later = suggest(
			[
				stamp("a", "2020-01-01", "FR", "entry"),
				stamp("b", "2020-01-05", "FR", "exit"),
			],
			[photo("2020-03-01", "ES")],
		);
		expect(brief(later).map((s) => s[0])).toEqual(["UA", "FR", "UA", "ES"]);
	});

	it("fills an unknown method from the other side of the same crossing", () => {
		const stays = suggest([
			stamp("a", "2020-01-01", "UA", "exit", "unknown"),
			stamp("b", "2020-01-01", "MD", "entry", "car"),
		]);
		expect(stays[0]?.departure.method).toBe("car");
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
	it("flags overlaps, gaps, reversed dates and missing dates as errors", () => {
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
			["gap", "order"],
			["missing-arrival", "missing-departure"],
			[],
		]);
		expect(hints[1]?.[0]).toMatchObject({ days: 2 });
		expect(hints[2]?.[0]).toMatchObject({ days: 7 });
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
			"gap",
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
	it("keeps home where the user deleted a trip", () => {
		const stays = suggest([
			stamp("a", "2016-08-10", "UA", "exit"),
			stamp("b", "2016-08-10", "ES", "entry"),
			stamp("c", "2016-08-24", "ES", "exit"),
			stamp("d", "2016-08-24", "UA", "entry"),
			stamp("e", "2017-05-03", "PL", "entry"),
			stamp("f", "2017-05-12", "UA", "entry"),
		]);
		const kept = applyDismissed(
			stays,
			[{ start: "2016-08-10", end: "2016-08-24" }],
			"UA",
		);
		expect(brief(kept).map((s) => s.slice(0, 3))).toEqual([
			["UA", null, "2017-05-03"],
			["PL", "2017-05-03", "2017-05-12"],
			["UA", "2017-05-12", null],
		]);
		expect(kept[0]?.stampIds).toEqual(["a", "d"]);
		// A period that only cuts a stay leaves its other days.
		const cut = applyDismissed(
			stays,
			[{ start: "2017-05-08", end: "2017-05-20" }],
			"UA",
		);
		expect(
			brief(cut)
				.slice(3)
				.map((s) => s.slice(0, 3)),
		).toEqual([
			["PL", "2017-05-03", "2017-05-08"],
			["UA", "2017-05-08", null],
		]);
	});
});

describe("trips from stays", () => {
	const stays = [
		stay("h1", "UA", null, "2019-07-01"),
		stay("it", "IT", "2019-07-01", "2019-07-09", { approved: true }),
		stay("qa", "QA", "2019-07-09", "2019-07-09", { kind: "transit" }),
		stay("fr", "FR", "2019-07-09", "2019-07-15"),
		stay("h2", "UA", "2019-07-15", null),
	];

	it("takes home from the country of most stays and a trip between home stays", () => {
		expect(homeOf(stays)).toBe("UA");
		expect(deriveTrips(stays, "UA")).toEqual([
			{
				id: "trip-it",
				title: "Italy → France",
				start: "2019-07-01",
				end: "2019-07-15",
				stayIds: ["it", "qa", "fr"],
				countries: ["IT", "QA", "FR"],
				visited: ["IT", "FR"],
				approved: false,
			},
		]);
		expect(deriveTrips(stays, null)).toEqual([]);
	});

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
