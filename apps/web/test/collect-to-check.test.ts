import { buildPhotoIndex, type LocationRow, type Stamp } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { countToCheck } from "../src/data/plan/usePlan";

const row = (date: string, countryCode: string): LocationRow => ({
	date: `${date}T12:00:00Z`,
	lat: 0,
	lon: 0,
	countryCode,
	country: countryCode,
	city: "",
	source: "test",
	isVideo: false,
	filename: `${countryCode}-${date}.jpg`,
	uuid: `${countryCode}-${date}`,
});

const stamp = (id: string, extra: Partial<Stamp>): Stamp => ({
	id,
	passportId: "p",
	photoId: "page",
	direction: "entry",
	borderCrossing: "plane",
	dateText: "",
	date: "2016-08-10",
	country: "Spain",
	countryCode: "ES",
	location: null,
	confidence: null,
	notes: "",
	problem: null,
	source: "manual",
	reviewed: true,
	...extra,
});

describe("Collect's review count", () => {
	it("counts what the Review queue holds: unreviewed stamps and open warnings", () => {
		// On the stamp date the photos are in Ukraine, not Spain.
		const index = buildPhotoIndex([row("2016-08-10", "UA")]);
		const stamps = [
			stamp("clean", { date: "2017-01-01" }),
			stamp("unreviewed", { date: "2017-01-01", reviewed: false }),
			stamp("mismatch", {}),
			stamp("looks-right", { dismissed: { icloudCheck: true } }),
			stamp("problem", { date: "2017-01-01", problem: "date unreadable" }),
		];
		expect(countToCheck(stamps, index, 10)).toBe(3);
		// Without photo locations only unreviewed stamps and problems count.
		expect(countToCheck(stamps, undefined, 10)).toBe(2);
	});

	it("counts the reviewed stamps of stays that overlap", () => {
		const stamps = [
			stamp("tr-in", { date: "2024-07-03", countryCode: "TR" }),
			stamp("tr-out", {
				date: "2024-07-08",
				countryCode: "TR",
				direction: "exit",
			}),
			stamp("ge-in", { date: "2024-07-05", countryCode: "GE" }),
			stamp("ge-out", {
				date: "2024-07-10",
				countryCode: "GE",
				direction: "exit",
			}),
		];
		expect(countToCheck(stamps, undefined, 10)).toBe(4);
		expect(countToCheck(stamps.slice(0, 2), undefined, 10)).toBe(0);
	});
});
