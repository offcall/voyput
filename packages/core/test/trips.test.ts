import { describe, expect, it } from "vitest";
import {
	type LocationRow,
	type Stamp,
	suggestTrips,
	type Trip,
	usableStamps,
	visibleTrips,
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

	const periods = (stamps: Stamp[], locations: LocationRow[] = []) =>
		suggestTrips({ stamps: usableStamps(stamps), locations, home: "MD" }).map(
			(t) => [t.start, t.end],
		);

	it("ends a Schengen trip (entry IT, exit DE) when home is left again", () => {
		expect(
			periods([
				stamp("a", "2017-03-01", "MD", "exit"),
				stamp("b", "2017-03-01", "IT", "entry"),
				stamp("c", "2017-03-10", "DE", "exit"),
				stamp("d", "2017-06-01", "MD", "exit"),
				stamp("e", "2017-06-01", "FR", "entry"),
				stamp("f", "2017-06-05", "FR", "exit"),
				stamp("g", "2017-06-05", "MD", "entry"),
			]),
		).toEqual([
			["2017-03-01", "2017-03-10"],
			["2017-06-01", "2017-06-05"],
		]);
	});

	it("treats a day's stamps as a set, whatever their order", () => {
		expect(
			periods([
				stamp("d", "2017-05-01", "MD", "entry"),
				stamp("c", "2017-05-01", "UA", "exit"),
				stamp("b", "2017-05-01", "UA", "entry"),
				stamp("a", "2017-05-01", "MD", "exit"),
				stamp("e", "2017-09-01", "RO", "entry"),
				stamp("f", "2017-09-04", "RO", "exit"),
			]),
		).toEqual([
			["2017-05-01", "2017-05-01"],
			["2017-09-01", "2017-09-04"],
		]);
	});

	it("waits for an explicit return home over days without photos", () => {
		expect(
			periods(
				[
					stamp("a", "2024-05-01", "MD", "exit"),
					stamp("b", "2024-05-10", "MD", "entry"),
				],
				[
					photo("2024-05-02", "JP", "Japan"),
					photo("2024-05-12", "MD", "Moldova"),
				],
			),
		).toEqual([["2024-05-01", "2024-05-10"]]);
	});

	it("keeps a photos-only trip whole over a few days without photos", () => {
		expect(
			periods(
				[],
				[
					photo("2024-05-02", "JP", "Japan"),
					photo("2024-05-08", "JP", "Japan"),
					photo("2024-05-10", "MD", "Moldova"),
				],
			),
		).toEqual([["2024-05-02", "2024-05-08"]]);
	});

	it("keeps a trip with only home stamps as an unknown destination", () => {
		const trips = suggestTrips({
			stamps: usableStamps([
				stamp("a", "2017-07-01", "MD", "exit"),
				stamp("b", "2017-07-08", "MD", "entry"),
			]),
			locations: [],
			home: "MD",
		});
		expect(trips).toHaveLength(1);
		expect(trips[0]).toMatchObject({
			start: "2017-07-01",
			end: "2017-07-08",
			title: "Unknown destination",
			stops: [],
		});
	});
});

describe("visibleTrips", () => {
	it("hides suggestions overlapping a dismissed period even with a new id", () => {
		const trip = (id: string, start: string, end: string) =>
			({ id, start, end }) as Trip;
		const shown = visibleTrips(
			[],
			[
				trip("x2", "2024-03-02", "2024-03-06"),
				trip("y", "2024-05-01", "2024-05-03"),
			],
			[{ start: "2024-03-01", end: "2024-03-05" }],
		);
		expect(shown.map((t) => t.trip.id)).toEqual(["y"]);
	});
});
