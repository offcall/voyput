import { describe, expect, it } from "vitest";
import {
	type LocationRow,
	type Stamp,
	suggestTrips,
	usableStamps,
} from "../src/index";

const photo = (
	date: string,
	countryCode: string,
	country: string,
	city = "",
): LocationRow => ({
	date: `${date}T12:00:00+02:00`,
	lat: 0,
	lon: 0,
	countryCode,
	country,
	city,
	source: "apple",
	isVideo: false,
	filename: `IMG_${date}.jpg`,
	uuid: `${date}-${countryCode}`,
});

const stamp = (
	id: string,
	date: string,
	countryCode: string,
	direction: Stamp["direction"],
): Stamp => ({
	id,
	passportId: "p1",
	photoId: "ph1",
	direction,
	borderCrossing: "plane",
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

describe("suggestTrips", () => {
	it("keeps a stamps-only stay open across silent weeks until its exit", () => {
		const stamps = usableStamps([
			stamp("a", "2017-03-01", "MD", "exit"),
			stamp("b", "2017-03-01", "RO", "entry"),
			stamp("c", "2017-03-25", "RO", "exit"),
			stamp("d", "2017-03-25", "MD", "entry"),
		]);
		const [trip, ...rest] = suggestTrips({ stamps, locations: [], home: "MD" });
		expect(rest).toEqual([]);
		expect(trip).toMatchObject({
			start: "2017-03-01",
			end: "2017-03-25",
			arrival: { source: "stamp", stampId: "a" },
			departure: { source: "stamp", stampId: "d" },
			stampIds: ["a", "b", "c", "d"],
		});
	});

	it("ends a photos-only trip at the last foreign day before home photos", () => {
		const locations = [
			photo("2024-05-01", "MD", "Moldova"),
			photo("2024-05-02", "MD", "Moldova"),
			photo("2024-05-02", "JP", "Japan", "Tokyo"),
			photo("2024-05-03", "JP", "Japan", "Osaka"),
			photo("2024-05-04", "SG", "Singapore"),
			photo("2024-05-05", "MD", "Moldova"),
		];
		const trips = suggestTrips({ stamps: [], locations, home: "MD" });
		expect(trips).toHaveLength(1);
		expect(trips[0]).toMatchObject({
			start: "2024-05-02",
			end: "2024-05-04",
			title: "Japan → Singapore",
			arrival: { source: "unknown" },
		});
		expect(trips[0]?.stops.map((s) => s.cities)).toEqual([
			["Tokyo"],
			["Osaka"],
			[],
		]);
	});
});
