import { describe, expect, it } from "vitest";
import {
	buildDayRuns,
	buildPhotoIndex,
	checkStamp,
	type LocationRow,
	nearbyPhotos,
	parseValidateResponse,
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
