import { describe, expect, it } from "vitest";
import type { LocationRow } from "../../src/locations/types";
import {
	adjacentTripStart,
	currentWaypointIndex,
	headingAt,
	type JourneyStay,
	journeyDayAt,
	journeyWaypoints,
	stayWaypoints,
	tripStarts,
	type Waypoint,
} from "../../src/route";

let n = 0;
const row = (
	date: string,
	countryCode: string,
	lat: number,
	lon: number,
): LocationRow => ({
	date,
	lat,
	lon,
	countryCode,
	country: "",
	city: "",
	source: "apple",
	isVideo: false,
	filename: "",
	uuid: `u${++n}`,
});

const stays: JourneyStay[] = [
	{ countryCode: "RO", start: "2024-03-01", end: "2024-03-05", tripId: "ro" },
	{ countryCode: "MD", start: "2024-03-06", end: "2024-06-08", tripId: null },
	{ countryCode: "JP", start: "2024-06-09", end: "2024-06-11", tripId: "asia" },
	{ countryCode: "KR", start: "2024-06-12", end: "2024-06-13", tripId: "asia" },
	{ countryCode: "TH", start: "2024-07-01", end: "2024-07-04", tripId: "th" },
	{ countryCode: "ZZ", start: "2024-08-01", end: "2024-08-02", tripId: "zz" },
];

const rows = [
	// Out of order on purpose; a home photo inside the home stay is not a stop.
	row("2024-06-11T09:00", "JP", 34.7, 135.5),
	row("2024-03-02T10:00", "RO", 44.4, 26.1),
	row("2024-03-03T10:00", "RO", 45.6, 25.6),
	row("2024-04-01T10:00", "MD", 47.0, 28.8),
	row("2024-06-10T09:00", "JP", 35.7, 139.7),
	// A border-day photo in the other country stays with its own country.
	row("2024-06-11T20:00", "KR", 37.6, 127.0),
];

const wp = (x: number, y: number, start: string): Waypoint => ({
	id: `${x}`,
	x,
	y,
	lat: 0,
	lon: 0,
	countryCode: "MD",
	start,
	end: start,
	days: 1,
	photos: 0,
});

describe("journeyWaypoints", () => {
	it("walks through the trip's photos and anchors home and photo-less stays", () => {
		const journey = journeyWaypoints(stays, rows);
		expect(journey.waypoints.map((w) => w.countryCode)).toEqual([
			"RO",
			"RO",
			"MD",
			"JP",
			"JP",
			"KR",
			"TH",
		]);
		expect(journey.tripIds).toEqual([
			"ro",
			"ro",
			null,
			"asia",
			"asia",
			"asia",
			"th",
		]);
		// KR's only photo is on 06-11, before its stay starts, and TH has none:
		// both fall back to the centroid. ZZ has neither and is skipped.
		expect(journey.waypoints.map((w) => w.photos)).toEqual([
			1, 1, 0, 1, 1, 0, 0,
		]);
		expect(journey.photos).toBe(4);
		expect(journey.skipped).toBe(1);
		expect(new Set(journey.waypoints.map((w) => w.id)).size).toBe(7);
	});

	it("without photos equals the by-countries waypoints, with trip ids", () => {
		const journey = journeyWaypoints(stays, rows, { photos: false });
		expect(journey.waypoints).toEqual(stayWaypoints(stays, rows).waypoints);
		expect(journey.tripIds).toEqual(["ro", null, "asia", "asia", "th"]);
		expect(journey.skipped).toBe(1);
		expect(journey.photos).toBe(0);
	});
});

describe("trip jumps", () => {
	const starts = tripStarts(["ro", "ro", null, "asia", "asia", "th"]);

	it("finds where each trip begins", () => {
		expect(starts).toEqual([0, 3, 5]);
		expect(tripStarts(["a", "b", "b"])).toEqual([0, 1]);
	});

	it("jumps to the next and the previous trip", () => {
		expect(adjacentTripStart(starts, 0, 1)).toBe(3);
		expect(adjacentTripStart(starts, 3, 1)).toBe(5);
		expect(adjacentTripStart(starts, 5, 1)).toBeNull();
		expect(adjacentTripStart(starts, 3.4, -1)).toBe(3);
		expect(adjacentTripStart(starts, 3, -1)).toBe(0);
		expect(adjacentTripStart(starts, 0, -1)).toBeNull();
	});
});

describe("player caption", () => {
	const route = [
		wp(0, 0, "2024-01-01"),
		wp(10, 0, "2024-01-11"),
		wp(10, 10, "2024-01-21"),
	];

	it("names the departure for the first half of a leg, the arrival after", () => {
		expect(currentWaypointIndex(3, { legIndex: 0, legProgress: 0.4 })).toBe(0);
		expect(currentWaypointIndex(3, { legIndex: 0, legProgress: 0.6 })).toBe(1);
		expect(currentWaypointIndex(3, { legIndex: 1, legProgress: 1 })).toBe(2);
		expect(currentWaypointIndex(1, { legIndex: 0, legProgress: 0 })).toBe(0);
	});

	it("moves the date from stop to stop with the leg's progress", () => {
		expect(journeyDayAt(route, { legIndex: 0, legProgress: 0 })).toBe(
			"2024-01-01",
		);
		expect(journeyDayAt(route, { legIndex: 0, legProgress: 0.5 })).toBe(
			"2024-01-06",
		);
		expect(journeyDayAt(route, { legIndex: 1, legProgress: 1 })).toBe(
			"2024-01-21",
		);
		expect(journeyDayAt([], { legIndex: 0, legProgress: 0 })).toBeNull();
	});

	it("points the traveller along the leg, also at take-off", () => {
		const east = headingAt(route, { legIndex: 0, legProgress: 0 });
		expect(east).not.toBeNull();
		expect(Math.abs(east ?? 99)).toBeLessThan(30);
		const south = headingAt(route, { legIndex: 1, legProgress: 0 }) ?? 0;
		expect(south).toBeGreaterThan(60);
		expect(south).toBeLessThan(120);
		expect(
			headingAt([wp(0, 0, "2024-01-01"), wp(0, 0, "2024-01-02")], {
				legIndex: 0,
				legProgress: 0.5,
			}),
		).toBeNull();
	});
});
