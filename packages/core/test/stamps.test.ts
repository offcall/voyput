import { describe, expect, it } from "vitest";
import {
	dateMatchesText,
	findConflicts,
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

describe("dateMatchesText", () => {
	it.each([
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
	])("accepts %s for %j", (date, text) => {
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
	])("rejects %s for %j", (date, text) => {
		expect(dateMatchesText(date, text)).toBe(false);
	});
});
