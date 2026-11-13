export type Point = readonly [number, number];

/**
 * Highest an arc bulges, in `projectEquirect` units (1000 × 500 map). The
 * prototype capped it at 35 on a 560 × 220 map; 35 × 500 / 220 ≈ 80.
 */
export const ARC_MAX_BULGE = 80;

/** Share of a leg's on-screen length that its arc bulges, before the cap. */
const ARC_BULGE_RATIO = 0.22;

/**
 * Control point of a leg's quadratic arc: above the midpoint (towards the north,
 * smaller y), by a share of the leg's length, capped at `maxBulge`. The map
 * draws the arc and places the flying dot with the same point.
 */
export function arcControlPoint(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	maxBulge: number = ARC_MAX_BULGE,
): [number, number] {
	const bulge = Math.min(
		maxBulge,
		Math.hypot(x1 - x0, y1 - y0) * ARC_BULGE_RATIO,
	);
	return [(x0 + x1) / 2, (y0 + y1) / 2 - bulge];
}

export function quadraticBezierPoint(
	x0: number,
	y0: number,
	cx: number,
	cy: number,
	x1: number,
	y1: number,
	t: number,
): [number, number] {
	const u = 1 - t;
	return [
		u * u * x0 + 2 * u * t * cx + t * t * x1,
		u * u * y0 + 2 * u * t * cy + t * t * y1,
	];
}

/** Point at curve parameter `t` (not eased) on the arc from `a` to `b`. */
export function arcPoint(a: Point, b: Point, t: number): [number, number] {
	const [cx, cy] = arcControlPoint(a[0], a[1], b[0], b[1]);
	return quadraticBezierPoint(a[0], a[1], cx, cy, b[0], b[1], t);
}
