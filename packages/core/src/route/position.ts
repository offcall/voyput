import { arcPoint, type Point } from "./curve";
import { easeInOutCubic } from "./timing";
import type { Waypoint } from "./waypoints";

/** Where playback is: on leg `legIndex`, `legProgress` (0–1, linear in time) of the way along it. */
export interface RoutePosition {
	legIndex: number;
	legProgress: number;
}

export const ROUTE_START: RoutePosition = { legIndex: 0, legProgress: 0 };

/** Leg durations with their start times, so a lookup is a binary search. */
export interface RouteTimeline {
	durations: readonly number[];
	/** `starts[i]` = sum of the durations before leg `i`. */
	starts: readonly number[];
	totalMs: number;
}

export function buildTimeline(durations: readonly number[]): RouteTimeline {
	const starts: number[] = [];
	let total = 0;
	for (const d of durations) {
		starts.push(total);
		total += d;
	}
	return { durations: [...durations], starts, totalMs: total };
}

/**
 * Position after `elapsedMs` of 1× playback, clamped to the route. At a leg's
 * start time the position is that leg at 0; at or past the end it is the last
 * leg at 1. A route without legs stays at the start.
 */
export function positionAt(
	timeline: RouteTimeline,
	elapsedMs: number,
): RoutePosition {
	const n = timeline.durations.length;
	if (n === 0) return ROUTE_START;
	if (!(elapsedMs < timeline.totalMs))
		return { legIndex: n - 1, legProgress: 1 };
	if (elapsedMs <= 0) return ROUTE_START;
	let lo = 0;
	let hi = n - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((timeline.starts[mid] ?? 0) <= elapsedMs) lo = mid;
		else hi = mid - 1;
	}
	const duration = timeline.durations[lo] ?? 0;
	const progress =
		duration > 0 ? (elapsedMs - (timeline.starts[lo] ?? 0)) / duration : 1;
	return { legIndex: lo, legProgress: Math.min(1, progress) };
}

/** Inverse of `positionAt`: elapsed 1× time of a position, e.g. after scrubbing. */
export function elapsedAt(
	timeline: RouteTimeline,
	position: RoutePosition,
): number {
	const n = timeline.durations.length;
	if (n === 0) return 0;
	const index = Math.max(0, Math.min(n - 1, position.legIndex));
	const progress = Math.max(0, Math.min(1, position.legProgress));
	return (
		(timeline.starts[index] ?? 0) + (timeline.durations[index] ?? 0) * progress
	);
}

/** Elapsed time after a frame of `frameMs` real time at `speed`×, clamped to [0, total]. */
export function advanceElapsed(
	timeline: RouteTimeline,
	elapsedMs: number,
	frameMs: number,
	speed: number,
): number {
	return Math.max(
		0,
		Math.min(timeline.totalMs, elapsedMs + frameMs * Math.max(0, speed)),
	);
}

/** Slider value in leg units (0 … legCount): leg index plus progress. */
export function legValue(position: RoutePosition): number {
	return position.legIndex + position.legProgress;
}

/** Position for a slider value in leg units, clamped to the route's `legCount` legs. */
export function positionFromLegValue(
	value: number,
	legCount: number,
): RoutePosition {
	if (legCount <= 0) return ROUTE_START;
	const v = Math.max(0, Math.min(legCount, value));
	if (v >= legCount) return { legIndex: legCount - 1, legProgress: 1 };
	const legIndex = Math.floor(v);
	return { legIndex, legProgress: v - legIndex };
}

/**
 * The flying dot on the drawn arc, eased, `back` (in eased curve units) behind
 * the position; a tail never reaches into the previous leg. Null without legs.
 */
export function pointOnRoute(
	waypoints: readonly Waypoint[],
	position: RoutePosition,
	back = 0,
): [number, number] | null {
	if (waypoints.length < 2) return null;
	const last = waypoints.length - 2;
	const index = Math.max(0, Math.min(last, position.legIndex));
	const a = waypoints[index];
	const b = waypoints[index + 1];
	if (!a || !b) return null;
	const t = Math.max(0, easeInOutCubic(position.legProgress) - back);
	const from: Point = [a.x, a.y];
	const to: Point = [b.x, b.y];
	return arcPoint(from, to, t);
}

/** Offsets of the comet tail behind the dot, in eased curve units. */
export const TRAIL_OFFSETS: readonly number[] = [
	0.05, 0.1, 0.16, 0.23, 0.31, 0.4,
];

export function trailPoints(
	waypoints: readonly Waypoint[],
	position: RoutePosition,
	offsets: readonly number[] = TRAIL_OFFSETS,
): [number, number][] {
	const points: [number, number][] = [];
	for (const offset of offsets) {
		const point = pointOnRoute(waypoints, position, offset);
		if (point) points.push(point);
	}
	return points;
}

/** The stop the player shows: the departure for the first half of a leg, the arrival after. */
export function currentWaypoint(
	waypoints: readonly Waypoint[],
	position: RoutePosition,
): Waypoint | undefined {
	if (waypoints.length < 2) return waypoints[0];
	const index = Math.max(0, Math.min(waypoints.length - 2, position.legIndex));
	return waypoints[position.legProgress < 0.5 ? index : index + 1];
}
