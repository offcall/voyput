import { describe, expect, it } from "vitest";
import {
	dateMatchesText,
	findConflicts,
	isValidDate,
	pairVisits,
	parsePhotoResponse,
	type Stamp,
} from "../src/index";

const stamp = (overrides: Partial<Stamp> & Pick<Stamp, "id">): Stamp => ({
	passportId: "p1",
	photoId: "photo-1",
	direction: "entry",
	borderCrossing: "car",
	dateText: "",
	date: "2022-05-17",
	country: null,
	countryCode: "RO",
	location: null,
	confidence: 90,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: false,
	...overrides,
});

describe("pairVisits and findConflicts", () => {
	it("joins Schengen countries into one visit, keeps pre-accession Romania apart and spots an overlap", () => {
		const stamps = [
			// Enter Spain, leave through Italy: one Schengen visit.
			stamp({ id: "es-in", countryCode: "ES", date: "2019-07-01" }),
			stamp({
				id: "it-out",
				countryCode: "IT",
				direction: "exit",
				date: "2019-07-20",
			}),
			// Romania in 2019 is not Schengen yet: its own zone, overlapping the trip above.
			stamp({ id: "ro-in", countryCode: "RO", date: "2019-07-10" }),
			stamp({
				id: "ro-out",
				countryCode: "RO",
				direction: "exit",
				date: "2019-07-12",
			}),
			// Two Ukrainian entries in a row: the first stays open, the second closes on the same
			// day Romania began, which is allowed.
			stamp({ id: "ua-in-1", countryCode: "UA", date: "2019-06-01" }),
			stamp({ id: "ua-in-2", countryCode: "UA", date: "2019-07-05" }),
			stamp({
				id: "ua-out",
				countryCode: "UA",
				direction: "exit",
				date: "2019-07-10",
			}),
			// Flagged and unknown-direction stamps never pair.
			stamp({
				id: "bad",
				countryCode: "UA",
				direction: "exit",
				date: "2019-06-02",
				problem: "misread",
			}),
			stamp({
				id: "unk",
				countryCode: "UA",
				direction: "unknown",
				date: "2019-06-03",
			}),
		];

		const visits = pairVisits(stamps);
		expect(visits.map((v) => [v.zone, v.entryStampId, v.exitStampId])).toEqual([
			["Schengen", "es-in", "it-out"],
			["RO", "ro-in", "ro-out"],
			["UA", "ua-in-1", null],
			["UA", "ua-in-2", "ua-out"],
		]);

		const conflicts = findConflicts(visits, stamps);
		expect(
			conflicts.map(({ first, second }) => [first.zone, second.zone]),
		).toEqual([
			["Schengen", "RO"],
			["Schengen", "UA"],
		]);
	});
});

describe("Schengen join dates", () => {
	const zones = (stamps: Stamp[]) =>
		pairVisits(stamps).map((v) => [v.zone, v.entryStampId, v.exitStampId]);

	it("keeps Poland before 2007-12-21 its own zone", () => {
		expect(
			zones([
				stamp({ id: "pl-in", countryCode: "PL", date: "2006-05-01" }),
				stamp({
					id: "pl-out",
					countryCode: "PL",
					direction: "exit",
					date: "2006-05-03",
				}),
				stamp({
					id: "de-out",
					countryCode: "DE",
					direction: "exit",
					date: "2006-05-10",
				}),
			]),
		).toEqual([
			["PL", "pl-in", "pl-out"],
			["Schengen", null, "de-out"],
		]);
	});

	it("counts a country as Schengen from its join date, whatever the crossing", () => {
		const zoneOn = (
			countryCode: string,
			date: string,
			borderCrossing: Stamp["borderCrossing"],
		) =>
			pairVisits([stamp({ id: "x", countryCode, date, borderCrossing })])[0]
				?.zone;
		expect(zoneOn("PL", "2007-12-20", "car")).toBe("PL");
		expect(zoneOn("PL", "2008-01-15", "car")).toBe("Schengen");
		expect(zoneOn("PL", "2008-01-15", "plane")).toBe("Schengen");
		expect(zoneOn("CH", "2008-06-01", "car")).toBe("CH");
		expect(zoneOn("CH", "2009-01-15", "plane")).toBe("Schengen");
		expect(zoneOn("LI", "2011-12-19", "car")).toBe("Schengen");
		expect(zoneOn("HR", "2022-12-31", "car")).toBe("HR");
		expect(zoneOn("HR", "2023-02-01", "plane")).toBe("Schengen");
		expect(zoneOn("RO", "2024-03-30", "plane")).toBe("RO");
		expect(zoneOn("RO", "2024-06-01", "car")).toBe("Schengen");
		expect(zoneOn("BG", "2024-06-01", "ship")).toBe("Schengen");
	});

	it("pairs an external-border stamp of Romania in 2024 with a plane entry", () => {
		expect(
			zones([
				stamp({
					id: "ro-in",
					countryCode: "RO",
					borderCrossing: "plane",
					date: "2024-06-01",
				}),
				stamp({
					id: "ro-out",
					countryCode: "RO",
					direction: "exit",
					borderCrossing: "car",
					date: "2024-06-10",
				}),
			]),
		).toEqual([["Schengen", "ro-in", "ro-out"]]);
	});

	it("pairs an external-border stamp of Croatia in 2023 with an entry elsewhere", () => {
		expect(
			zones([
				stamp({
					id: "hr-in",
					countryCode: "HR",
					borderCrossing: "plane",
					date: "2023-02-01",
				}),
				stamp({
					id: "it-out",
					countryCode: "IT",
					direction: "exit",
					borderCrossing: "plane",
					date: "2023-02-10",
				}),
			]),
		).toEqual([["Schengen", "hr-in", "it-out"]]);
	});
});

describe("same-day stamps", () => {
	const pairs = (stamps: Stamp[]) =>
		pairVisits(stamps).map((v) => [v.entryStampId, v.exitStampId]);
	const ua = (id: string, date: string, direction: Stamp["direction"]) =>
		stamp({ id, countryCode: "UA", date, direction });

	it("closes an open stay before a same-day re-entry (a visa run)", () => {
		expect(
			pairs([
				ua("in-1", "2019-01-01", "entry"),
				ua("in-2", "2019-03-01", "entry"),
				ua("out-1", "2019-03-01", "exit"),
				ua("out-2", "2019-05-01", "exit"),
			]),
		).toEqual([
			["in-1", "out-1"],
			["in-2", "out-2"],
		]);
	});

	it("pairs same-day stamps of one direction by id, whatever the input order", () => {
		const day = [
			ua("in", "2019-01-01", "entry"),
			ua("out-b", "2019-03-01", "exit"),
			ua("out-a", "2019-03-01", "exit"),
		];
		const expected = [
			["in", "out-a"],
			[null, "out-b"],
		];
		expect(pairs(day)).toEqual(expected);
		expect(pairs([...day].reverse())).toEqual(expected);
	});

	it("pairs an entry and an exit on one day when nothing is open (a transit)", () => {
		expect(
			pairs([ua("out", "2019-03-01", "exit"), ua("in", "2019-03-01", "entry")]),
		).toEqual([["in", "out"]]);
	});
});

describe("parsePhotoResponse", () => {
	it("uses a flagged stamp once its problem is hidden", () => {
		const visits = pairVisits([
			stamp({ id: "in", countryCode: "UA", date: "2019-06-01" }),
			stamp({
				id: "out",
				countryCode: "UA",
				direction: "exit",
				date: "2019-06-09",
				problem: "misread",
				dismissed: { problem: true },
			}),
		]);
		expect(visits.map((v) => [v.entryStampId, v.exitStampId])).toEqual([
			["in", "out"],
		]);
	});

	it("fails a non-empty stamps array without one stamp object, so a re-extract keeps old stamps", () => {
		expect(() =>
			parsePhotoResponse(JSON.stringify({ stamps: [null, "unreadable"] }), {
				from: null,
				to: null,
			}),
		).toThrow();
	});

	it("reads a missing date as unknown and keeps the other stamps", () => {
		const { stamps } = parsePhotoResponse(
			JSON.stringify({
				stamps: [
					{ direction: "entry", countryCode: "RO", dateText: "" },
					{
						direction: "exit",
						countryCode: "RO",
						date: "2021-10-25",
						dateText: "25 10 21",
					},
				],
			}),
			{ from: null, to: null },
		);
		expect(stamps.map((s) => s.date)).toEqual([null, "2021-10-25"]);
	});

	it("keeps model text from splitting the joined warnings", () => {
		const { stamps } = parsePhotoResponse(
			JSON.stringify({
				stamps: [
					{
						direction: "x;y",
						countryCode: "R; O",
						date: "2021-10-25",
						dateText: "MAR; 01",
					},
				],
			}),
			{ from: null, to: null },
		);
		expect(stamps[0]?.problem?.split("; ")).toHaveLength(3);
	});

	it("flags a date that is outside the passport or does not match the printed text", () => {
		const raw = `\`\`\`json
${JSON.stringify({
	notes: "two stamps",
	stamps: [
		{
			direction: "exit",
			dateText: "◁ 14 06 21 03",
			date: "2021-06-03",
			country: "Ukraine",
			countryCode: "UA",
			location: null,
			confidence: 80,
		},
		{
			direction: "entry",
			dateText: "17.05.12 41",
			date: "2012-05-17",
			country: "Romania",
			countryCode: "RO",
			location: null,
			confidence: 80,
			borderCrossing: "plane",
		},
	],
})}
\`\`\``;
		const { stamps } = parsePhotoResponse(raw, {
			from: "2014-01-01",
			to: null,
		});
		expect(stamps.map((s) => s.problem)).toEqual([
			'date 2021-06-03 does not match printed "◁ 14 06 21 03"',
			"date 2012-05-17 is outside passport validity",
		]);
		expect(stamps.map((s) => s.borderCrossing)).toEqual(["unknown", "plane"]);
	});
	it("reads a bad field as unknown with a warning and keeps the other stamps", () => {
		const good = {
			direction: "entry",
			dateText: "2 DEC 2019",
			date: "2019-12-02",
			country: "Romania",
			countryCode: "ro",
			location: "Siret",
			confidence: 90,
		};
		const raw = JSON.stringify({
			notes: "page",
			stamps: [
				good,
				{ ...good, countryCode: "Unknown", country: "" },
				{ ...good, countryCode: "??", direction: "in", confidence: "high" },
				{ ...good, date: "2019-02-30", dateText: 7, location: 3 },
				"not a stamp",
			],
		});
		const { notes, stamps } = parsePhotoResponse(raw, { from: null, to: null });
		expect(notes).toBe("page Skipped 1 entry that is not a stamp.");
		expect(
			stamps.map((s) => [
				s.countryCode,
				s.country,
				s.direction,
				s.date,
				s.dateText,
				s.location,
				s.confidence,
				s.problem,
			]),
		).toEqual([
			["RO", "Romania", "entry", "2019-12-02", "2 DEC 2019", "Siret", 90, null],
			[
				null,
				null,
				"entry",
				"2019-12-02",
				"2 DEC 2019",
				"Siret",
				90,
				'unreadable country code "Unknown"',
			],
			[
				null,
				"Romania",
				"unknown",
				"2019-12-02",
				"2 DEC 2019",
				"Siret",
				0,
				'unreadable direction "in"; unreadable country code "??"',
			],
			[
				"RO",
				"Romania",
				"entry",
				null,
				"",
				null,
				90,
				'unreadable date "2019-02-30"',
			],
		]);
	});

	it.each([
		["not JSON", "I could not read this page."],
		["no stamps array", JSON.stringify({ notes: "x", stamps: {} })],
		["not an object", "[]"],
	])("fails the photo when the output is %s", (_, raw) => {
		expect(() => parsePhotoResponse(raw, { from: null, to: null })).toThrow(
			/^invalid model output/,
		);
	});
});

/** Printed date lines and the dates they show; every one must pass the check. */
const ACCEPTED: [date: string, text: string][] = [
	["2021-06-14", "◁ 14 06 21 03"],
	["2022-05-17", "17.05.22 41"],
	["2020-02-28", "28 02 20 9 <"],
	["2019-12-02", "2 DEC 2019"],
	["2019-07-15", "1 5 07 1 9 9 <"],
	["2023-03-24", "MAR 24 2023"],
	["2023-03-24", "Mar 24, 23"],
	["2026-06-06", "2026/06/06"],
	["2026-06-07", "2026-6-7 12"],
	["2019-12-02", "DECEMBER 2 2019"],
	["2019-09-02", "2 SEPT 2019"],
	// Digits printed apart.
	["2019-07-15", "15 07 1 9 9"],
	["2021-06-14", "1 4 0 6 21 03"],
	// Month names in other languages, with or without accents.
	["2019-07-12", "12 JUIL 2019"],
	["2019-02-03", "3 FÉVR. 2019"],
	["2019-08-15", "15 AOUT 2019"],
	["2019-03-04", "04 MÄR 2019"],
	["2019-10-05", "5 OKT 2019"],
	["2019-12-06", "06.DEZ.2019"],
	["2019-01-07", "7 ENE 2019"],
	["2019-04-08", "08 ABR 19"],
	["2019-06-09", "9 GIU 2019"],
	["2019-07-10", "10 LUG 2019"],
	["2019-10-11", "11 OUT 2019"],
	["2019-10-12", "12 OUT 2019"],
	["2019-05-12", "OUT 12 05 19"],
	["2018-11-05", "IN 05 11 2018"],
	["2023-03-24", "MAR 24 2 0 2 3"],
	["2005-09-05", "5 9 05 4"],
	["2019-09-12", "12 SET 2019"],
	["2019-02-13", "13 ŞUB 2019"],
	["2019-10-14", "14 Eki 2019"],
	["2019-11-15", "15 KAS 2019"],
	["2019-08-16", "16 AĞU 2019"],
	["2019-10-17", "17 ОКТ 2019"],
	["2019-05-18", "18 МАЯ 2019"],
	["2019-11-19", "19 ЛИС 2019"],
	["2019-07-20", "20 ЛИПНЯ 2019"],
	// Roman months.
	["2019-07-12", "12.VII.2019"],
	["2019-11-03", "3 XI 19"],
	["2019-04-01", "2019-IV-01"],
	["1998-06-21", "21 JUN 1998"],
	// Commons sample stamps (apps/web/public/demo/samples.json) that warned before.
	["2004-07-17", "JUL 1 7 2004"],
	["2005-05-31", "3 1 MAY 2005"],
	["2005-11-06", "2005 -11- 0 6"],
	["2006-12-19", "DEC 1 9 2006"],
	["2005-07-23", "23 JUIL. 2005"],
	["2008-12-30", "DEC 3 0 2008"],
];

/**
 * Each printed digit of the day, the month and the year moved up and down by
 * one: 07 → 17, 2019 → 2020. A two-digit year cannot show its century.
 */
const oneDigitOff = (date: string, text: string): string[] => {
	const yearFrom = text.includes(date.slice(0, 4)) ? 0 : 2;
	const positions = [0, 1, 2, 3, 5, 6, 8, 9].filter((p) => p >= yearFrom);
	return positions
		.flatMap((position) =>
			[1, 9].map((step) => {
				const digit = (Number(date[position]) + step) % 10;
				return `${date.slice(0, position)}${digit}${date.slice(position + 1)}`;
			}),
		)
		.filter(isValidDate);
};

describe("dateMatchesText", () => {
	it.each(ACCEPTED)("accepts %s for %j", (date, text) => {
		expect(dateMatchesText(date, text)).toBe(true);
	});

	it.each([
		// The officer number read as the year.
		["2021-06-03", "◁ 14 06 21 03"],
		["2016-03-24", "MAR 24 23 16"],
		// Month first only with a month name.
		["2023-03-24", "03 24 23"],
		// Words that only start like a month are not month names.
		["2023-03-24", "03 24 23 JUNIOR"],
		["2023-03-24", "MAYOR 03 24 23"],
		["2023-03-24", "DECLARATION 03 24 23"],
		["2019-05-02", "2 MAYOR 2019"],
		// Year first only with all four digits.
		["2026-06-07", "26/06/07"],
		["2023-03-24", ""],
		// Spaced digits still have to match: printed 17, read 07.
		["2004-07-07", "JUL 1 7 2004"],
		["2008-12-03", "DEC 3 0 2008"],
		["2005-11-16", "2005 -11- 0 6"],
		// A part never starts inside a run of spaced digits: "3 1" is 31, not 1.
		["2005-05-01", "3 1 MAY 2005"],
		["2019-07-05", "1 5 07 1 9 9 <"],
		// Wrong month in another language or in Roman numerals.
		["2005-06-23", "23 JUIL. 2005"],
		["2019-11-12", "12.VII.2019"],
		// French "JUI" could be juin or juillet.
		["2019-07-12", "12 JUI 2019"],
		// A Roman numeral counts only between numbers.
		["2019-05-12", "V 12 2019"],
		// An "OUT"/"IN" exit or entry label is not a month (Portuguese "OUT" is October).
		["2005-10-12", "OUT 12 05 19"],
		["2005-10-12", "OUT 12.05.19"],
		["2019-12-05", "OUT 12 05 19"],
		["2018-05-11", "IN 05 11 2018"],
		// A month word only fills the month.
		["2019-12-07", "12 JUL 2019"],
		// A year never stops inside a run of spaced digits.
		["2020-03-24", "MAR 24 2 0 2 3"],
		// The year of a month-name date is its own number, not part of a packed run.
		["2020-07-23", "23 JUIL. 2005"],
		["2020-07-12", "12.VII.2019"],
		// Digits are never joined across a separator.
		["2023-12-03", "2023/1/2 3"],
		// OUT followed by a whole numeric date is the exit label.
		["2005-10-12", "01 OUT 12.05.19"],
		["2019-10-12", "12 OUT 1 2 2019"],
	])("rejects %s for %j", (date, text) => {
		expect(dateMatchesText(date, text)).toBe(false);
	});

	it.each(ACCEPTED)(
		"rejects every date one digit off %s for %j",
		(date, text) => {
			const passing = oneDigitOff(date, text).filter((wrong) =>
				dateMatchesText(wrong, text),
			);
			expect(passing).toEqual([]);
		},
	);
});
