import { describe, expect, it } from "vitest";
import type { LocationRow } from "../../src/locations/types";
import {
	advanceElapsed,
	bubbleRadius,
	buildTimeline,
	clusterByProximity,
	clusterWaypoints,
	createFlownPath,
	currentWaypoint,
	elapsedAt,
	filterRouteRows,
	legsDone,
	legsPathD,
	legValue,
	panView,
	pointOnRoute,
	positionAt,
	positionFromLegValue,
	revealedGroups,
	routeLegDurations,
	stayWaypoints,
	stopPosition,
	trailPoints,
	type Waypoint,
	ZOOM_PRESETS,
	zoomView,
} from "../../src/route";
import {
	COUNTRY_CENTROIDS,
	projectEquirect,
	WORLD_WIDTH,
} from "../../src/viz/geo";

const row = (overrides: Partial<LocationRow>): LocationRow => ({
	date: "2024-01-01T10:00:00",
	lat: 0,
	lon: 0,
	countryCode: "MD",
	country: "",
	city: "",
	source: "apple",
	isVideo: false,
	filename: "",
	uuid: "u",
	...overrides,
});

const waypoint = (x: number, y: number, countryCode = "MD"): Waypoint => ({
	id: `${x},${y}`,
	x,
	y,
	lat: 0,
	lon: 0,
	countryCode,
	start: "2024-01-01",
	end: "2024-01-01",
	days: 1,
	photos: 0,
});

describe("clusterByProximity", () => {
	it("merges consecutive photos within the radius and keeps country, dates and count", () => {
		const clusters = clusterByProximity(
			[
				row({ date: "2024-01-01T10:00", lat: 47.0, lon: 28.0 }),
				row({ date: "2024-01-02T10:00", lat: 47.001, lon: 28.001 }),
				row({ date: "2024-01-03T10:00", lat: 47.002, lon: 28.0 }),
			],
			1,
		);
		expect(clusters).toHaveLength(1);
		expect(clusters[0]).toMatchObject({
			countryCode: "MD",
			photos: 3,
			firstDate: "2024-01-01T10:00",
			lastDate: "2024-01-03T10:00",
		});
		expect(clusters[0]?.lat).toBeCloseTo(47.001, 9);
	});

	it("sorts by date and gives a later return to the same place its own waypoint", () => {
		const clusters = clusterByProximity(
			[
				row({ date: "2024-12-01", lat: 47, lon: 28 }),
				row({ date: "2024-01-01", lat: 47, lon: 28 }),
				row({ date: "2024-06-01", lat: 10, lon: 10, countryCode: "TH" }),
			],
			1,
		);
		expect(clusters.map((c) => [c.firstDate, c.countryCode])).toEqual([
			["2024-01-01", "MD"],
			["2024-06-01", "TH"],
			["2024-12-01", "MD"],
		]);
	});

	it("clusters 30k rows in one pass into the expected shape", () => {
		const rows: LocationRow[] = [];
		for (let i = 0; i < 30_000; i++) {
			const spot = Math.floor(i / 100);
			const day = String(1 + (spot % 28)).padStart(2, "0");
			const year = 2000 + Math.floor(spot / 28);
			rows.push(
				row({
					date: `${year}-01-${day}T${String(i % 100).padStart(5, "0")}`,
					lat: (spot % 2) * 10 + (i % 100) * 1e-6,
					lon: spot * 0.5,
				}),
			);
		}
		const clusters = clusterByProximity(rows);
		expect(clusters).toHaveLength(300);
		expect(clusters.every((c) => c.photos === 100)).toBe(true);
	});
});

describe("filterRouteRows", () => {
	it("keeps rows in the inclusive day range and the chosen countries", () => {
		const rows = [
			row({ uuid: "in", date: "2020-06-01T23:00", countryCode: "MD" }),
			row({ uuid: "early", date: "2010-01-01", countryCode: "MD" }),
			row({ uuid: "ro", date: "2020-06-01", countryCode: "RO" }),
			row({ uuid: "last-day", date: "2026-01-01T10:00", countryCode: "RO" }),
		];
		const ids = (filter: Parameters<typeof filterRouteRows>[1]) =>
			filterRouteRows(rows, filter).map((r) => r.uuid);
		expect(ids({ from: "2016-01-01", to: "2026-01-01" })).toEqual([
			"in",
			"ro",
			"last-day",
		]);
		expect(ids({ from: "2016-01-01", excludeCountries: ["MD"] })).toEqual([
			"ro",
			"last-day",
		]);
		expect(ids({ countries: ["MD"] })).toEqual(["in", "early"]);
	});
});

describe("waypoints", () => {
	it("puts one waypoint per stay at the centroid, falls back to photo mean, skips the rest", () => {
		const { waypoints, skipped } = stayWaypoints(
			[
				{ countryCode: "MD", start: "2024-01-01", end: "2024-01-10" },
				{ countryCode: "ZY", start: "2024-01-11", end: "2024-01-12" },
				{ countryCode: "ZZ", start: "2024-01-13", end: "2024-01-13" },
				{ countryCode: "MD", start: "2024-01-14", end: "2024-01-20" },
			],
			[
				// ZY is unassigned, so it has no centroid; FJ now has one.
				row({ countryCode: "ZY", lat: -17, lon: 178 }),
				row({ countryCode: "ZY", lat: -18, lon: 179 }),
			],
		);
		expect(skipped).toBe(1);
		expect(waypoints.map((w) => [w.countryCode, w.days])).toEqual([
			["MD", 10],
			["ZY", 2],
			["MD", 7],
		]);
		expect([waypoints[0]?.lat, waypoints[0]?.lon]).toEqual(
			COUNTRY_CENTROIDS.MD,
		);
		expect(waypoints[1]).toMatchObject({ lat: -17.5, lon: 178.5 });
		expect([waypoints[1]?.x, waypoints[1]?.y]).toEqual(
			projectEquirect(-17.5, 178.5),
		);
	});

	it("turns clusters into waypoints and paces photo border legs separately", () => {
		const waypoints = clusterWaypoints(
			clusterByProximity([
				row({ date: "2024-01-01T09:00", lat: 47, lon: 28 }),
				row({ date: "2024-01-01T10:00", lat: 47.1, lon: 28 }),
				row({
					date: "2024-01-02T10:00",
					lat: 13.7,
					lon: 100.5,
					countryCode: "TH",
				}),
			]),
		);
		expect(waypoints.map((w) => [w.countryCode, w.start, w.photos])).toEqual([
			["MD", "2024-01-01", 1],
			["MD", "2024-01-01", 1],
			["TH", "2024-01-02", 1],
		]);
		const durations = routeLegDurations(waypoints, "photos");
		expect(durations[1]).toBeLessThanOrEqual(1000);
		expect((durations[0] ?? 0) + (durations[1] ?? 0)).toBeCloseTo(120_000, 6);
	});
});

describe("position", () => {
	const durations = [100, 300, 50, 550];
	const timeline = buildTimeline(durations);

	it("hits every leg start and the route end", () => {
		expect(timeline.totalMs).toBe(1000);
		expect(timeline.starts.map((t) => positionAt(timeline, t))).toEqual([
			{ legIndex: 0, legProgress: 0 },
			{ legIndex: 1, legProgress: 0 },
			{ legIndex: 2, legProgress: 0 },
			{ legIndex: 3, legProgress: 0 },
		]);
		expect(positionAt(timeline, 1000)).toEqual({ legIndex: 3, legProgress: 1 });
		expect(positionAt(timeline, 5000)).toEqual({ legIndex: 3, legProgress: 1 });
		expect(positionAt(timeline, -5)).toEqual({ legIndex: 0, legProgress: 0 });
		expect(positionAt(timeline, 250)).toEqual({
			legIndex: 1,
			legProgress: 0.5,
		});
	});

	it("is monotone in time and inverted by elapsedAt", () => {
		let previous = -1;
		for (let t = 0; t <= 1000; t += 7) {
			const position = positionAt(timeline, t);
			expect(legValue(position)).toBeGreaterThanOrEqual(previous);
			previous = legValue(position);
			expect(elapsedAt(timeline, position)).toBeCloseTo(t, 9);
		}
	});

	it("scales elapsed time by speed and clamps it to the route", () => {
		expect(advanceElapsed(timeline, 100, 16, 2)).toBe(132);
		expect(advanceElapsed(timeline, 990, 16, 4)).toBe(1000);
		expect(advanceElapsed(timeline, 0, 16, 0.5)).toBe(8);
	});

	it("maps slider values in leg units to positions", () => {
		expect(positionFromLegValue(2.25, 4)).toEqual({
			legIndex: 2,
			legProgress: 0.25,
		});
		expect(positionFromLegValue(9, 4)).toEqual({ legIndex: 3, legProgress: 1 });
		expect(positionFromLegValue(1, 0)).toEqual({ legIndex: 0, legProgress: 0 });
	});

	it("handles a route without legs", () => {
		const empty = buildTimeline([]);
		expect(positionAt(empty, 50)).toEqual({ legIndex: 0, legProgress: 0 });
		expect(elapsedAt(empty, { legIndex: 3, legProgress: 1 })).toBe(0);
		expect(
			pointOnRoute([waypoint(1, 1)], { legIndex: 0, legProgress: 0 }),
		).toBeNull();
	});

	it("puts the dot on the leg ends, the tail behind it, and the current stop halfway", () => {
		const route = [waypoint(0, 100), waypoint(100, 100), waypoint(200, 100)];
		expect(pointOnRoute(route, { legIndex: 1, legProgress: 0 })).toEqual([
			100, 100,
		]);
		expect(pointOnRoute(route, { legIndex: 1, legProgress: 1 })).toEqual([
			200, 100,
		]);
		const tail = trailPoints(route, { legIndex: 0, legProgress: 0.9 });
		expect(tail).toHaveLength(6);
		expect(tail.every(([x]) => x >= 0 && x < 100)).toBe(true);
		expect(currentWaypoint(route, { legIndex: 0, legProgress: 0.4 })).toBe(
			route[0],
		);
		expect(currentWaypoint(route, { legIndex: 0, legProgress: 0.6 })).toBe(
			route[1],
		);
	});

	it("counts a leg as done once landed and snaps to the last stop left", () => {
		expect(legsDone({ legIndex: 2, legProgress: 0.99 })).toBe(2);
		expect(legsDone({ legIndex: 2, legProgress: 1 })).toBe(3);
		expect(stopPosition({ legIndex: 2, legProgress: 0.7 })).toEqual({
			legIndex: 2,
			legProgress: 0,
		});
		expect(stopPosition({ legIndex: 2, legProgress: 1 })).toEqual({
			legIndex: 2,
			legProgress: 1,
		});
	});
});

describe("revealedGroups", () => {
	const route: Waypoint[] = [
		{ ...waypoint(0, 0, "MD"), days: 10 },
		{ ...waypoint(1, 0, "RO"), days: 3 },
		{ ...waypoint(2, 0, "MD"), days: 5 },
		{ ...waypoint(3, 0, "TH"), days: 7, photos: 4 },
	];

	it("grows bubbles with visits, in first-visit order, up to the final totals", () => {
		expect(revealedGroups(route, 0)).toEqual([
			{ countryCode: "MD", days: 10, visits: 1, photos: 0 },
		]);
		expect(revealedGroups(route, 2)).toEqual([
			{ countryCode: "MD", days: 15, visits: 2, photos: 0 },
			{ countryCode: "RO", days: 3, visits: 1, photos: 0 },
		]);
		expect(revealedGroups(route, 99)).toEqual(revealedGroups(route, 3));
		expect(revealedGroups(route, 3).at(-1)).toEqual({
			countryCode: "TH",
			days: 7,
			visits: 1,
			photos: 4,
		});
	});

	it("sizes bubbles against the whole route's max, never past full size", () => {
		expect(bubbleRadius(10, 15)).toBeLessThan(bubbleRadius(15, 15));
		expect(bubbleRadius(30, 15)).toBe(bubbleRadius(15, 15));
		expect(bubbleRadius(0, 0)).toBeGreaterThan(0);
	});
});

describe("flown path", () => {
	const route = Array.from({ length: 40 }, (_, i) =>
		waypoint((i * 37) % 1000, (i * 53) % 500),
	);

	it("equals a full rebuild after appending, scrubbing back and changing the route", () => {
		const path = createFlownPath();
		for (const upto of [0, 1, 2, 5, 5, 6, 20, 39, 39, 60]) {
			expect(path.update(route, upto)).toBe(legsPathD(route, 0, upto));
		}
		expect(path.update(route, 3)).toBe(legsPathD(route, 0, 3));
		const other = route.slice(0, 10);
		expect(path.update(other, 9)).toBe(legsPathD(other, 0, 9));
		expect(legsPathD(route, 0, 2).split("M")).toHaveLength(3);
	});
});

describe("view", () => {
	it("keeps the map's 2 : 1 shape in every preset and zooms around the centre", () => {
		for (const [, , w, h] of Object.values(ZOOM_PRESETS)) {
			expect(w / h).toBeCloseTo(2, 1);
		}
		expect(ZOOM_PRESETS.world[2]).toBe(WORLD_WIDTH);
		expect(zoomView([0, 0, 1000, 500], 0.5)).toEqual([250, 125, 500, 250]);
		expect(panView([100, 50, 500, 250], 50, -25, 1000, 500)).toEqual([
			75, 62.5, 500, 250,
		]);
	});
});
