import { dayNumber } from "../days";
import type { LocationRow } from "../locations/types";
import { COUNTRY_CENTROIDS, haversineKm, projectEquirect } from "../viz/geo";
import type { PhotoCluster } from "./clusters";
import { computeLegDurations, computePhotoLegDurations } from "./timing";

/** "By countries": one waypoint per stay. "Exact by photos": one per photo cluster. */
export type RouteMode = "countries" | "photos";

/**
 * Minimal stay the "by countries" mode needs: a run of days in one country.
 * ISO dates (`YYYY-MM-DD`), sorted by `start`. Explore's `Stay` fits it.
 */
export interface RouteStay {
	countryCode: string;
	start: string;
	end: string;
}

/** One stop on the route, already projected with `projectEquirect`. */
export interface Waypoint {
	id: string;
	x: number;
	y: number;
	lat: number;
	lon: number;
	countryCode: string;
	/** `YYYY-MM-DD`. */
	start: string;
	end: string;
	/** Days from `start` to `end`, both counted. */
	days: number;
	/** Photos behind the waypoint; 0 for a stay. */
	photos: number;
}

export interface StayWaypoints {
	waypoints: Waypoint[];
	/** Stays dropped because their country has no centroid and no photo. */
	skipped: number;
}

const spanDays = (start: string, end: string): number => {
	const a = dayNumber(start);
	const b = dayNumber(end);
	return a === null || b === null ? 1 : Math.max(1, b - a + 1);
};

/** Mean photo coordinates per country, for countries `COUNTRY_CENTROIDS` lacks. */
function photoAnchors(
	rows: readonly LocationRow[],
): Map<string, [number, number]> {
	const sums = new Map<string, { lat: number; lon: number; n: number }>();
	for (const row of rows) {
		if (COUNTRY_CENTROIDS[row.countryCode]) continue;
		const sum = sums.get(row.countryCode) ?? { lat: 0, lon: 0, n: 0 };
		sum.lat += row.lat;
		sum.lon += row.lon;
		sum.n += 1;
		sums.set(row.countryCode, sum);
	}
	const anchors = new Map<string, [number, number]>();
	for (const [code, sum] of sums)
		anchors.set(code, [sum.lat / sum.n, sum.lon / sum.n]);
	return anchors;
}

/**
 * "By countries" waypoints: one per stay, at the country's anchor. The anchor
 * is `COUNTRY_CENTROIDS`, else the mean of that country's photo coordinates in
 * `rows`; a stay with neither is skipped and counted.
 */
export function stayWaypoints(
	stays: readonly RouteStay[],
	rows: readonly LocationRow[],
): StayWaypoints {
	const fallback = photoAnchors(rows);
	const waypoints: Waypoint[] = [];
	let skipped = 0;
	stays.forEach((stay, index) => {
		const anchor =
			COUNTRY_CENTROIDS[stay.countryCode] ?? fallback.get(stay.countryCode);
		if (!anchor) {
			skipped += 1;
			return;
		}
		const [lat, lon] = anchor;
		const [x, y] = projectEquirect(lat, lon);
		waypoints.push({
			id: `stay${index}`,
			x,
			y,
			lat,
			lon,
			countryCode: stay.countryCode,
			start: stay.start,
			end: stay.end,
			days: spanDays(stay.start, stay.end),
			photos: 0,
		});
	});
	return { waypoints, skipped };
}

/** "Exact by photos" waypoints: one per cluster, at its centroid. */
export function clusterWaypoints(
	clusters: readonly PhotoCluster[],
): Waypoint[] {
	return clusters.map((cluster) => {
		const [x, y] = projectEquirect(cluster.lat, cluster.lon);
		const start = cluster.firstDate.slice(0, 10);
		const end = cluster.lastDate.slice(0, 10);
		return {
			id: cluster.id,
			x,
			y,
			lat: cluster.lat,
			lon: cluster.lon,
			countryCode: cluster.countryCode,
			start,
			end,
			days: spanDays(start, end),
			photos: cluster.photos,
		};
	});
}

/** Great-circle length of each leg; `waypoints.length - 1` entries. */
export function legDistancesKm(waypoints: readonly Waypoint[]): number[] {
	const distances: number[] = [];
	for (let i = 1; i < waypoints.length; i++) {
		const a = waypoints[i - 1];
		const b = waypoints[i];
		if (a && b) distances.push(haversineKm(a.lat, a.lon, b.lat, b.lon));
	}
	return distances;
}

/**
 * Leg durations at 1× for a mode. "By countries" water-fills the whole budget;
 * "by photos" treats a leg whose ends are in different countries as a border
 * leg (`computePhotoLegDurations`).
 */
export function routeLegDurations(
	waypoints: readonly Waypoint[],
	mode: RouteMode,
	totalMs?: number,
): number[] {
	const distances = legDistancesKm(waypoints);
	if (mode === "countries") return computeLegDurations(distances, totalMs);
	const isBorder = distances.map(
		(_, i) => waypoints[i]?.countryCode !== waypoints[i + 1]?.countryCode,
	);
	return computePhotoLegDurations(distances, isBorder, totalMs);
}
