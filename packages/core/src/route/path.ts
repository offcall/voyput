import { arcControlPoint } from "./curve";
import type { Waypoint } from "./waypoints";

const num = (n: number): string => String(Math.round(n * 10) / 10);

/** SVG path data for legs `from … to - 1`, one `M … Q …` arc per leg, space separated. */
export function legsPathD(
	waypoints: readonly Waypoint[],
	from: number,
	to: number,
): string {
	const parts: string[] = [];
	const end = Math.min(to, waypoints.length - 1);
	for (let i = Math.max(0, from); i < end; i++) {
		const a = waypoints[i];
		const b = waypoints[i + 1];
		if (!a || !b) continue;
		const [cx, cy] = arcControlPoint(a.x, a.y, b.x, b.y);
		parts.push(
			`M${num(a.x)},${num(a.y)} Q${num(cx)},${num(cy)} ${num(b.x)},${num(b.y)}`,
		);
	}
	return parts.join(" ");
}

/** Path of everything flown so far, kept between frames. */
export interface FlownPath {
	/** Path data of legs `0 … upto - 1` of `waypoints`. */
	update(waypoints: readonly Waypoint[], upto: number): string;
}

/**
 * A flown-path builder that appends only the legs flown since the last call,
 * so a route of thousands of legs is not re-serialised every frame. It rebuilds
 * from scratch when `waypoints` is a different array or `upto` goes back
 * (scrubbing). The result always equals `legsPathD(waypoints, 0, upto)`.
 */
export function createFlownPath(): FlownPath {
	let cached: readonly Waypoint[] | null = null;
	let cachedUpto = 0;
	let d = "";
	return {
		update(waypoints, upto) {
			const target = Math.max(0, Math.min(upto, waypoints.length - 1));
			if (cached !== waypoints || target < cachedUpto) {
				d = legsPathD(waypoints, 0, target);
			} else if (target > cachedUpto) {
				const more = legsPathD(waypoints, cachedUpto, target);
				d = d && more ? `${d} ${more}` : d || more;
			}
			cached = waypoints;
			cachedUpto = target;
			return d;
		},
	};
}
