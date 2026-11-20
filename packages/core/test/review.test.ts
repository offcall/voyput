import { describe, expect, it } from "vitest";
import {
	buildDayRuns,
	buildPhotoIndex,
	checkStamp,
	type LocationRow,
	nearbyPhotos,
	needsAttention,
	parseValidateResponse,
	photoMatches,
	type Stamp,
	usableStamps,
} from "../src/index";

const row = (
	day: string,
	countryCode: string,
	country: string,
): LocationRow => ({
	date: `${day}T12:00:00+02:00`,
	lat: 0,
	lon: 0,
	countryCode,
	country,
	city: "",
	source: "apple",
	isVideo: false,
	filename: `IMG_${day}_${countryCode}.jpg`,
	uuid: `${day}-${countryCode}`,
});

// Home in Moldova, then 10–14 March in Romania. Rows are deliberately unsorted.
const index = buildPhotoIndex([
	row("2024-03-12", "RO", "Romania"),
	row("2024-03-01", "MD", "Moldova"),
	row("2024-03-05", "MD", "Moldova"),
	row("2024-03-10", "RO", "Romania"),
	row("2024-03-14", "RO", "Romania"),
	row("2024-03-14", "RO", "Romania"),
	row("2024-03-14", "MD", "Moldova"),
	row("2024-03-20", "MD", "Moldova"),
]);

describe("review checks", () => {
	it("lists the photos closest to a date, nearest first", () => {
		expect(
			nearbyPhotos(index, "2024-03-11", 3).map((p) => [p.date, p.gap]),
		).toEqual([
			["2024-03-10", 1],
			["2024-03-12", 1],
			["2024-03-14", 3],
		]);
	});

	it("passes a stamp that matches the photos", () => {
		expect(
			checkStamp(index, { date: "2024-03-10", countryCode: "RO" }),
		).toEqual({ icloudCheck: "", suggestion: "" });
	});

	it("flags a stamp near photos in another country and suggests a date", () => {
		// Read as 2 March, but the Romanian photos start on the 10th.
		const check = checkStamp(index, { date: "2024-03-02", countryCode: "RO" });
		expect(check.icloudCheck).toContain("taken in Moldova, not Romania");
		expect(check.suggestion).toContain("around 2024-03-10");
	});

	it("warns only within the given window of days", () => {
		// The nearest photo, in Moldova on 20 March, is 6 days from the 26th.
		const stamp = { date: "2024-03-26", countryCode: "RO" };
		expect(checkStamp(index, stamp).icloudCheck).toContain("6 day(s) away");
		expect(checkStamp(index, stamp, 5)).toEqual({
			icloudCheck: "",
			suggestion: "",
		});
	});

	it("says when the stamp's country has no photos at all", () => {
		const check = checkStamp(index, { date: "2024-03-05", countryCode: "JP" });
		expect(check.suggestion).toContain("No photos in JP within 30 days");
	});

	it("collapses photo days into country runs by majority", () => {
		expect(buildDayRuns(index)).toEqual([
			{ start: "2024-03-01", end: "2024-03-05", countryCode: "MD" },
			{ start: "2024-03-10", end: "2024-03-14", countryCode: "RO" },
			{ start: "2024-03-20", end: "2024-03-20", countryCode: "MD" },
		]);
	});
});

describe("needsAttention", () => {
	const item = (
		overrides: Partial<Stamp>,
		icloudCheck = "",
	): Parameters<typeof needsAttention>[0] => ({
		stamp: {
			id: "s1",
			passportId: "p1",
			photoId: "ph1",
			direction: "entry",
			borderCrossing: "plane",
			dateText: "",
			date: "2024-03-01",
			country: "France",
			countryCode: "FR",
			location: null,
			confidence: null,
			notes: "",
			problem: null,
			source: "ai",
			reviewed: true,
			...overrides,
		},
		check: { icloudCheck, suggestion: "" },
	});

	it("holds an unreviewed stamp, even without a warning", () => {
		expect(needsAttention(item({ reviewed: false }))).toBe(true);
	});

	it("lets a reviewed stamp without open warnings go", () => {
		expect(needsAttention(item({ reviewed: true }))).toBe(false);
		expect(
			needsAttention(
				item(
					{
						reviewed: true,
						problem: "date unclear",
						dismissed: { problem: true, icloudCheck: true },
					},
					"no photos in FR",
				),
			),
		).toBe(false);
	});

	it("holds a reviewed stamp with an open problem or photo-location warning", () => {
		expect(
			needsAttention(item({ reviewed: true, problem: "date unclear" })),
		).toBe(true);
		expect(needsAttention(item({ reviewed: true }, "no photos in FR"))).toBe(
			true,
		);
	});
	it("counts a stamp with an overlapping stay under the problem filter", () => {
		const overlap = { ...item({}), overlap: "you are also in Turkey" };
		expect(photoMatches([item({})], "problem")).toBe(false);
		expect(photoMatches([item({}), overlap], "problem")).toBe(true);
		expect(photoMatches([{ ...overlap, overlap: "" }], "problem")).toBe(false);
	});
});

describe("checkStamp on border days", () => {
	const NAMES: Record<string, string> = {
		UA: "Ukraine",
		MD: "Moldova",
		ES: "Spain",
		TH: "Thailand",
		PL: "Poland",
		TR: "Turkey",
		RU: "Russia",
		AT: "Austria",
		US: "United States",
	};
	// `at` is local time; the uuid puts each row in the order the app reads them back.
	let seq = 0;
	const photo = (at: string, countryCode: string): LocationRow => ({
		date: `${at.replace(" ", "T")}:00+02:00`,
		lat: 0,
		lon: 0,
		countryCode,
		country: NAMES[countryCode] ?? countryCode,
		city: "",
		source: "apple",
		isVideo: false,
		filename: `IMG_${String(++seq).padStart(4, "0")}.jpg`,
		uuid: `${String(seq).padStart(4, "0")}`,
	});
	const ok = { icloudCheck: "", suggestion: "" };

	it("passes all four stamps of a same-day trip out and back", () => {
		// Rows read back with the trip's photos first, so the first row of the
		// day is abroad: the old nearest-photo check warned on the Ukrainian stamps.
		const index = buildPhotoIndex([
			photo("2024-05-04 13:00", "MD"),
			photo("2024-05-03 18:00", "UA"),
			photo("2024-05-04 08:00", "UA"),
			photo("2024-05-04 20:00", "UA"),
			photo("2024-05-05 10:00", "UA"),
		]);
		const day = "2024-05-04";
		for (const stamp of [
			{ countryCode: "UA", direction: "exit" as const },
			{ countryCode: "MD", direction: "entry" as const },
			{ countryCode: "MD", direction: "exit" as const },
			{ countryCode: "UA", direction: "entry" as const },
		])
			expect(checkStamp(index, { ...stamp, date: day })).toEqual(ok);
	});

	it("passes a morning flight out with home photos before it", () => {
		const index = buildPhotoIndex([
			photo("2024-06-01 07:00", "UA"),
			photo("2024-06-01 16:00", "ES"),
			photo("2024-05-31 19:00", "UA"),
			photo("2024-06-02 11:00", "ES"),
		]);
		const date = "2024-06-01";
		expect(
			checkStamp(index, { date, countryCode: "UA", direction: "exit" }),
		).toEqual(ok);
		expect(
			checkStamp(index, { date, countryCode: "ES", direction: "entry" }),
		).toEqual(ok);
	});

	it("passes a 01:50 departure whose last photos are from the day before", () => {
		// Bangkok: last photo 23:10 on the 10th, the exit stamp is dated the 11th.
		const index = buildPhotoIndex([
			photo("2023-02-11 09:30", "PL"),
			photo("2023-02-09 15:00", "TH"),
			photo("2023-02-10 23:10", "TH"),
			photo("2023-02-12 12:00", "PL"),
		]);
		const date = "2023-02-11";
		expect(
			checkStamp(index, { date, countryCode: "TH", direction: "exit" }),
		).toEqual(ok);
		expect(
			checkStamp(index, { date, countryCode: "PL", direction: "entry" }),
		).toEqual(ok);
	});

	it("passes a late arrival whose first photos are from the next day", () => {
		const index = buildPhotoIndex([
			photo("2024-07-10 09:00", "UA"),
			photo("2024-07-11 10:00", "ES"),
		]);
		expect(
			checkStamp(index, {
				date: "2024-07-10",
				countryCode: "ES",
				direction: "entry",
			}),
		).toEqual(ok);
	});

	it("does not count a transit country's photos against the stamps", () => {
		// Spain → Istanbul airside → Kyiv, the transit photos first in the day.
		const index = buildPhotoIndex([
			photo("2024-08-21 06:30", "TR"),
			photo("2024-08-21 07:15", "TR"),
			photo("2024-08-20 18:00", "ES"),
			photo("2024-08-21 15:00", "UA"),
		]);
		expect(
			checkStamp(index, {
				date: "2024-08-20",
				countryCode: "ES",
				direction: "exit",
			}),
		).toEqual(ok);
		expect(
			checkStamp(index, {
				date: "2024-08-21",
				countryCode: "UA",
				direction: "entry",
			}),
		).toEqual(ok);
	});

	it("warns on a misread date and suggests the day the photos show", () => {
		// Entered Spain on the 10th; the stamp was read as the 7th, still at home.
		const index = buildPhotoIndex([
			photo("2024-09-06 12:00", "UA"),
			photo("2024-09-07 12:00", "UA"),
			photo("2024-09-08 12:00", "UA"),
			photo("2024-09-09 12:00", "UA"),
			photo("2024-09-10 15:00", "ES"),
			photo("2024-09-11 15:00", "ES"),
		]);
		const check = checkStamp(index, {
			date: "2024-09-07",
			countryCode: "ES",
			direction: "entry",
		});
		expect(check.icloudCheck).toContain("taken in Ukraine, not Spain");
		expect(check.suggestion).toContain("around 2024-09-10");
		expect(check.fixDate).toBe("2024-09-10");
	});

	it("uses the direction: an entry is not confirmed by the day before", () => {
		// Spanish photos end on the 9th; an entry dated the 10th is off.
		const index = buildPhotoIndex([
			photo("2024-09-09 12:00", "ES"),
			photo("2024-09-10 12:00", "UA"),
		]);
		const stamp = { date: "2024-09-10", countryCode: "ES" };
		expect(
			checkStamp(index, { ...stamp, direction: "entry" }).icloudCheck,
		).toContain("taken in Ukraine, not Spain");
		expect(checkStamp(index, { ...stamp, direction: "exit" })).toEqual(ok);
		expect(checkStamp(index, { ...stamp, direction: "unknown" })).toEqual(ok);
	});

	it("counts other-country photos only on the side the direction contradicts", () => {
		// Last Russian photos 5 days before the exit; Austria 3 days after it.
		const after = buildPhotoIndex([
			photo("2024-10-05 12:00", "RU"),
			photo("2024-10-13 12:00", "AT"),
		]);
		const exit = {
			date: "2024-10-10",
			countryCode: "RU",
			direction: "exit" as const,
		};
		expect(checkStamp(after, exit)).toEqual(ok);
		// Austria 3 days before the exit contradicts it.
		const before = buildPhotoIndex([
			photo("2024-10-07 12:00", "AT"),
			photo("2024-10-15 12:00", "RU"),
		]);
		expect(checkStamp(before, exit).icloudCheck).toContain(
			"(3 day(s) away) is in Austria",
		);
		// The mirror for an entry: Austria before it is expected, after it is not.
		const entry = { ...exit, direction: "entry" as const };
		expect(checkStamp(before, entry)).toEqual(ok);
		expect(checkStamp(after, entry).icloudCheck).toContain(
			"(3 day(s) away) is in Austria",
		);
		// Unknown direction keeps both sides.
		expect(
			checkStamp(after, { ...exit, direction: "unknown" }).icloudCheck,
		).toContain("(3 day(s) away) is in Austria");
	});

	it("stays quiet when there are no photos around the stamp", () => {
		const index = buildPhotoIndex([
			photo("2024-01-01 12:00", "UA"),
			photo("2024-03-01 12:00", "UA"),
		]);
		expect(
			checkStamp(index, {
				date: "2024-02-01",
				countryCode: "ES",
				direction: "entry",
			}),
		).toEqual(ok);
		expect(
			checkStamp(buildPhotoIndex([]), {
				date: "2024-02-01",
				countryCode: "ES",
				direction: "entry",
			}),
		).toEqual(ok);
	});

	describe("a year read wrong", () => {
		const usa2017 = [
			photo("2017-08-12 12:00", "US"),
			photo("2017-08-13 12:00", "US"),
			photo("2017-08-15 12:00", "US"),
		];
		const stamp = {
			date: "2016-08-12",
			countryCode: "US",
			direction: "entry" as const,
		};

		it("suggests the year the photos in the stamp's country show", () => {
			// Home in Ukraine around the stamp date, far enough not to warn.
			const index = buildPhotoIndex([
				photo("2016-07-01 12:00", "UA"),
				...usa2017,
			]);
			expect(checkStamp(index, stamp)).toEqual({
				icloudCheck: "",
				suggestion:
					"Maybe 2017? Photos in United States from 2017-08-12 to 2017-08-15",
				fixDate: "2017-08-12",
			});
		});

		it("suggests it beside a warning instead of a country misread", () => {
			const index = buildPhotoIndex([
				photo("2016-08-13 12:00", "UA"),
				...usa2017,
			]);
			const check = checkStamp(index, stamp);
			expect(check.icloudCheck).toContain(
				"taken in Ukraine, not United States",
			);
			expect(check.suggestion).toContain("Maybe 2017?");
			expect(check.fixDate).toBe("2017-08-12");
		});

		it("says nothing when the stamp's country has photos around its date", () => {
			const index = buildPhotoIndex([
				photo("2016-08-20 12:00", "US"),
				...usa2017,
			]);
			expect(checkStamp(index, stamp)).toEqual(ok);
			// Confirmed on its own day: no year check at all.
			const confirmed = buildPhotoIndex([
				photo("2016-08-12 12:00", "US"),
				...usa2017,
			]);
			expect(checkStamp(confirmed, stamp)).toEqual(ok);
		});

		it("looks a year earlier too, within 3 days", () => {
			const within = buildPhotoIndex([photo("2015-08-09 12:00", "US")]);
			expect(checkStamp(within, stamp)).toMatchObject({
				suggestion: "Maybe 2015? Photos in United States on 2015-08-09",
				fixDate: "2015-08-12",
			});
			const beyond = buildPhotoIndex([
				photo("2015-08-08 12:00", "US"),
				photo("2017-08-16 12:00", "US"),
			]);
			expect(checkStamp(beyond, stamp)).toEqual(ok);
			// Photos of another country a year off say nothing about this one.
			expect(
				checkStamp(buildPhotoIndex([photo("2017-08-12 12:00", "UA")]), stamp),
			).toEqual(ok);
		});

		it("moves 29 February to 28 February in the other year", () => {
			const index = buildPhotoIndex([photo("2017-03-02 12:00", "US")]);
			expect(checkStamp(index, { ...stamp, date: "2016-02-29" })).toMatchObject(
				{
					suggestion: "Maybe 2017? Photos in United States on 2017-03-02",
					fixDate: "2017-02-28",
				},
			);
		});
	});
});

describe("review results reach other sections safely", () => {
	const stamp = (patch: Partial<Stamp>): Stamp => ({
		id: "s1",
		passportId: "p1",
		photoId: "ph1",
		direction: "entry",
		borderCrossing: "plane",
		dateText: "10.03.24 5",
		date: "2024-03-10",
		country: "Romania",
		countryCode: "RO",
		location: null,
		confidence: 90,
		notes: "",
		problem: "date 2024-03-10 is outside passport validity",
		source: "ai",
		reviewed: true,
		...patch,
	});

	it("lets a reviewed stamp with a hidden problem into trips", () => {
		expect(usableStamps([stamp({})])).toHaveLength(0);
		expect(
			usableStamps([stamp({ dismissed: { problem: true } })]),
		).toHaveLength(1);
	});

	it("keeps only valid fields of a validate correction", () => {
		const result = parseValidateResponse(
			JSON.stringify({
				ok: false,
				explanation: "day misread",
				correction: {
					direction: "sideways",
					date: "2024-02-31",
					countryCode: "ro",
					location: "",
					date2: 1,
					country: "Romania",
				},
			}),
		);
		expect(result.correction).toEqual({ country: "Romania" });
		expect(
			parseValidateResponse(
				JSON.stringify({
					ok: false,
					explanation: "",
					correction: { date: "bad" },
				}),
			).correction,
		).toBeNull();
	});
});
