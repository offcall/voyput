import type { DatedStamp } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { stampConflicts } from "../src/features/trips/conflicts";
import type { PhotoDays } from "../src/features/trips/photoDays";

const stamp = (countryCode: string, date: string): DatedStamp => ({
	id: `${countryCode}-${date}`,
	passportId: "p1",
	photoId: "ph1",
	direction: "entry",
	borderCrossing: "plane",
	dateText: date,
	date,
	country: countryCode,
	countryCode,
	location: null,
	confidence: 95,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: true,
});

const photos = (day: string, countryCode: string): PhotoDays =>
	new Map([[day, [{ countryCode, country: countryCode, photos: 3 }]]]);

describe("stampConflicts", () => {
	it("accepts photos from another Schengen country", () => {
		expect(
			stampConflicts([stamp("ES", "2019-07-01")], photos("2019-07-02", "IT")),
		).toEqual([]);
	});

	it("flags a stamp when nearby photos show another zone", () => {
		const conflicts = stampConflicts(
			[stamp("GE", "2018-10-12")],
			photos("2018-10-13", "TR"),
		);
		expect(conflicts.map((c) => c.seen)).toEqual([["TR"]]);
	});

	it("claims nothing without photos near the stamp", () => {
		expect(
			stampConflicts([stamp("GE", "2018-10-12")], photos("2018-10-20", "TR")),
		).toEqual([]);
	});
});
