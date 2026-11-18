import { describe, expect, it } from "vitest";
import type { PhotoDays } from "../src/data/photoDays";
import { runStarts } from "../src/features/trips/DaysTimeline";

const day = (countryCode: string, photos = 1) => ({
	countryCode,
	country: countryCode,
	photos,
});

describe("timeline flags", () => {
	it("flags the first photo bar of each run of days in one country", () => {
		const photoDays: PhotoDays = new Map([
			["2024-01-01", [day("TH")]],
			["2024-01-02", [day("TH")]],
			// No photos on the 3rd: Thailand goes on after it without a new flag.
			["2024-01-04", [day("TH"), day("LA")]],
			["2024-01-05", [day("LA")]],
			["2024-01-06", [day("TH")]],
		]);
		const days = [1, 2, 3, 4, 5, 6].map((d) => `2024-01-0${d}`);
		expect([...runStarts(days, photoDays)]).toEqual([
			"2024-01-01|TH",
			"2024-01-04|LA",
			"2024-01-06|TH",
		]);
	});
});
