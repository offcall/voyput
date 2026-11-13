import type { LocationRow } from "../locations/types";
import { dayIso, dayNumber } from "../review/days";
import { clusterByProximity, DEFAULT_CLUSTER_RADIUS_KM } from "./clusters";
import { pointOnRoute, type RoutePosition } from "./position";
import {
	clusterWaypoints,
	type RouteStay,
	stayWaypoints,
	type Waypoint,
} from "./waypoints";

/** A stay as the journey reads it. */
export interface JourneyStay extends RouteStay {
	id: string;
}

export interface Journey {
	waypoints: Waypoint[];
	/** Stay of each waypoint, index for index. */
	stayIds: (string | null)[];
	/** Stays left out because they have no photo and no anchor on the map. */
	skipped: number;
	/** Photos behind the photo-cluster waypoints. */
	photos: number;
}

/** First index in date-sorted `rows` whose day is >= `day`. */
function firstRowOn(rows: readonly LocationRow[], day: string): number {
	let lo = 0;
	let hi = rows.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if ((rows[mid]?.date.slice(0, 10) ?? "") < day) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * The journey: one waypoint per photo cluster of each stay's country and
 * days, so the traveller flies between stays and walks through the photos
 * within them. A stay without photos falls back to its country anchor. With
 * `photos: false` every stay is one anchored waypoint, as `stayWaypoints`.
 *
 * Rows are sorted once and each stay reads only its own days, so 30k rows
 * cost one sort plus one pass.
 */
export function journeyWaypoints(
	stays: readonly JourneyStay[],
	rows: readonly LocationRow[],
	{
		photos = true,
		radiusKm = DEFAULT_CLUSTER_RADIUS_KM,
	}: { photos?: boolean; radiusKm?: number } = {},
): Journey {
	// `stayWaypoints` names each waypoint `stay<index into stays>`.
	const anchored = new Map(
		stayWaypoints(stays, rows).waypoints.map((w) => [w.id, w]),
	);
	const sorted = photos
		? [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
		: [];
	const journey: Journey = {
		waypoints: [],
		stayIds: [],
		skipped: 0,
		photos: 0,
	};
	stays.forEach((stay, index) => {
		let stops: Waypoint[] = [];
		if (photos) {
			const own: LocationRow[] = [];
			for (let i = firstRowOn(sorted, stay.start); i < sorted.length; i++) {
				const row = sorted[i] as LocationRow;
				if (row.date.slice(0, 10) > stay.end) break;
				if (row.countryCode === stay.countryCode) own.push(row);
			}
			journey.photos += own.length;
			stops = clusterWaypoints(clusterByProximity(own, radiusKm)).map((w) => ({
				...w,
				id: `stay${index}:${w.id}`,
			}));
		}
		if (stops.length === 0) {
			const anchor = anchored.get(`stay${index}`);
			if (!anchor) {
				journey.skipped += 1;
				return;
			}
			stops = [anchor];
		}
		for (const stop of stops) {
			journey.waypoints.push(stop);
			journey.stayIds.push(stay.id);
		}
	});
	return journey;
}

/** Waypoint indexes where a stay begins: a stay id that differs from the waypoint before. */
export function stayStarts(stayIds: readonly (string | null)[]): number[] {
	const starts: number[] = [];
	stayIds.forEach((id, i) => {
		if (id !== null && id !== stayIds[i - 1]) starts.push(i);
	});
	return starts;
}

/** Slider values (leg units) this close count as the same spot. */
const SAME_SPOT = 1e-6;

/**
 * The stay start to jump to from slider value `value`: the next one after it,
 * or the last one before it (a value just past a start goes to the stay
 * before, as a media player's "previous"). Null when there is none.
 */
export function adjacentStayStart(
	starts: readonly number[],
	value: number,
	direction: 1 | -1,
): number | null {
	if (direction === 1) return starts.find((s) => s > value + SAME_SPOT) ?? null;
	for (let i = starts.length - 1; i >= 0; i--) {
		const start = starts[i] as number;
		if (start < value - SAME_SPOT) return start;
	}
	return null;
}

/** Index of the waypoint `currentWaypoint` shows at `position`. */
export function currentWaypointIndex(
	count: number,
	position: RoutePosition,
): number {
	if (count < 2) return 0;
	const index = Math.max(0, Math.min(count - 2, position.legIndex));
	return position.legProgress < 0.5 ? index : index + 1;
}

/**
 * The date shown under the scrubber: from the leg's departure to its arrival
 * start day, linear in the leg's progress. Null without waypoints.
 */
export function journeyDayAt(
	waypoints: readonly Waypoint[],
	position: RoutePosition,
): string | null {
	const first = waypoints[0];
	if (!first) return null;
	const index = Math.max(0, Math.min(waypoints.length - 2, position.legIndex));
	const a = waypoints[index] ?? first;
	const b = waypoints[index + 1];
	const from = dayNumber(a.start);
	const to = b ? dayNumber(b.start) : from;
	if (from === null || to === null) return a.start;
	const t = Math.max(0, Math.min(1, position.legProgress));
	return dayIso(Math.round(from + (to - from) * t));
}

/**
 * Heading of the traveller in degrees (0 = east, 90 = south on the map), from
 * the arc just behind and ahead of the position, or the leg's chord where
 * the eased arc barely moves. Null on a leg of zero length or without legs.
 */
export function headingAt(
	waypoints: readonly Waypoint[],
	position: RoutePosition,
): number | null {
	const step = 0.01;
	const p = position.legProgress;
	const behind = pointOnRoute(waypoints, {
		legIndex: position.legIndex,
		legProgress: Math.max(0, p - step),
	});
	const ahead = pointOnRoute(waypoints, {
		legIndex: position.legIndex,
		legProgress: Math.min(1, p + step),
	});
	if (!behind || !ahead) return null;
	let dx = ahead[0] - behind[0];
	let dy = ahead[1] - behind[1];
	if (Math.hypot(dx, dy) < 1e-6) {
		// At take-off and landing the eased arc barely moves: use the chord.
		const index = Math.max(
			0,
			Math.min(waypoints.length - 2, position.legIndex),
		);
		const a = waypoints[index];
		const b = waypoints[index + 1];
		if (!a || !b) return null;
		dx = b.x - a.x;
		dy = b.y - a.y;
		if (Math.hypot(dx, dy) < 1e-9) return null;
	}
	return (Math.atan2(dy, dx) * 180) / Math.PI;
}
