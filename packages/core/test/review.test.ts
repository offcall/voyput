import { describe, expect, it } from "vitest";
import {
	buildDayRuns,
	buildPhotoIndex,
	checkStamp,
	type LocationRow,
	nearbyPhotos,
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
