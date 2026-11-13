import type { Waypoint } from "./waypoints";

/** A country bubble: what the route has shown of one country so far. */
export interface RevealedGroup {
	countryCode: string;
	/** Sum of the waypoints' `days`. Clusters on the same day count that day once each. */
	days: number;
	/** Waypoints in the country. */
	visits: number;
	photos: number;
}

/**
 * Bubbles after `legsDone` legs: waypoints `0 … legsDone` summed per country,
 * in first-visit order. During playback pass the current `legIndex`; pass
 * `waypoints.length - 1` (or more) for the whole route.
 */
export function revealedGroups(
	waypoints: readonly Waypoint[],
	legsDone: number,
): RevealedGroup[] {
	const upto = Math.min(waypoints.length, Math.max(0, legsDone) + 1);
	const groups = new Map<string, RevealedGroup>();
	for (let i = 0; i < upto; i++) {
		const w = waypoints[i];
		if (!w) continue;
		const group = groups.get(w.countryCode) ?? {
			countryCode: w.countryCode,
			days: 0,
			visits: 0,
			photos: 0,
		};
		group.days += w.days;
		group.visits += 1;
		group.photos += w.photos;
		groups.set(w.countryCode, group);
	}
	return [...groups.values()];
}

/** Smallest bubble radius and growth on top of it, in `projectEquirect` units (prototype 2.4 and 6 on a 560-wide map). */
export const BUBBLE_MIN_RADIUS = 4.3;
export const BUBBLE_GROWTH_RADIUS = 10.7;

/**
 * Radius of a bubble at the full-map view. `max` is the largest value of the
 * whole route (not of what is revealed), so bubbles grow towards their final
 * size and never past it. Scale by `view width / WORLD_WIDTH` when zoomed.
 */
export function bubbleRadius(value: number, max: number): number {
	const share = max > 0 ? Math.min(1, Math.max(0, value) / max) : 0;
	return BUBBLE_MIN_RADIUS + Math.sqrt(share) * BUBBLE_GROWTH_RADIUS;
}
