import { WORLD_HEIGHT, WORLD_WIDTH } from "@voyput/core";

/** The point of the globe facing the viewer, in degrees. */
export interface GlobeView {
	lat: number;
	lon: number;
}

/** Highest |lat| the globe tilts to, so a pole never faces the viewer fully. */
export const MAX_TILT = 70;

const RAD = Math.PI / 180;

/**
 * Orthographic projection: `x` right and `y` down from the globe's centre,
 * for a globe of radius `r`. `front` is the cosine of the angle from the
 * view centre: > 0 on the near side, < 0 behind the globe.
 */
export function project(
	lat: number,
	lon: number,
	view: GlobeView,
	r: number,
): [x: number, y: number, front: number] {
	const phi = lat * RAD;
	const phi0 = view.lat * RAD;
	const dl = (lon - view.lon) * RAD;
	const cosPhi = Math.cos(phi);
	const x = r * cosPhi * Math.sin(dl);
	const y =
		r *
		(Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * cosPhi * Math.cos(dl));
	const front =
		Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * cosPhi * Math.cos(dl);
	return [x, -y, front];
}

/** Latitude and longitude under `x`, `y` (from the centre, `y` down), or `null` off the globe. */
export function invert(
	x: number,
	y: number,
	view: GlobeView,
	r: number,
): [lat: number, lon: number] | null {
	const up = -y;
	const rho = Math.hypot(x, up);
	if (rho > r) return null;
	if (rho === 0) return [view.lat, view.lon];
	const c = Math.asin(rho / r);
	const phi0 = view.lat * RAD;
	const sinC = Math.sin(c);
	const cosC = Math.cos(c);
	const lat = Math.asin(
		cosC * Math.sin(phi0) + (up * sinC * Math.cos(phi0)) / rho,
	);
	const lon =
		view.lon * RAD +
		Math.atan2(
			x * sinC,
			rho * cosC * Math.cos(phi0) - up * sinC * Math.sin(phi0),
		);
	return [lat / RAD, wrapLon(lon / RAD)];
}

/** Longitude in [−180, 180). */
export function wrapLon(lon: number): number {
	return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function clampTilt(lat: number): number {
	return Math.min(Math.max(lat, -MAX_TILT), MAX_TILT);
}

/**
 * Rings of an SVG path on the 1000 × 500 plate carrée box (`M x y L x y … Z`,
 * as `buildWorldShapes` writes them) back as `[lat, lon]`.
 */
export function ringsFromPath(d: string): [number, number][][] {
	const rings: [number, number][][] = [];
	for (const part of d.split("M")) {
		const body = part.replace(/Z\s*$/, "").trim();
		if (!body) continue;
		const ring: [number, number][] = [];
		for (const pair of body.split("L")) {
			const [xs, ys] = pair.trim().split(/\s+/);
			const x = Number(xs);
			const y = Number(ys);
			if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
			ring.push([90 - (y / WORLD_HEIGHT) * 180, (x / WORLD_WIDTH) * 360 - 180]);
		}
		if (ring.length >= 3) rings.push(ring);
	}
	return rings;
}

/** Whether `[lat, lon]` lies inside a `[lat, lon]` ring (even-odd ray cast on plain degrees). */
export function inRing(
	lat: number,
	lon: number,
	ring: readonly [number, number][],
): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const a = ring[i];
		const b = ring[j];
		if (!a || !b) continue;
		if (
			a[0] > lat !== b[0] > lat &&
			lon < ((b[1] - a[1]) * (lat - a[0])) / (b[0] - a[0]) + a[1]
		)
			inside = !inside;
	}
	return inside;
}

/**
 * Point `f` (0…1) of the way along the great circle from `a` to `b`, so
 * arcs between countries follow the globe instead of cutting across it.
 */
export function greatCircle(
	a: readonly [number, number],
	b: readonly [number, number],
	f: number,
): [number, number] {
	const toVec = ([lat, lon]: readonly [number, number]) => [
		Math.cos(lat * RAD) * Math.cos(lon * RAD),
		Math.cos(lat * RAD) * Math.sin(lon * RAD),
		Math.sin(lat * RAD),
	];
	const va = toVec(a);
	const vb = toVec(b);
	const dot = va.reduce((sum, v, i) => sum + v * (vb[i] ?? 0), 0);
	const omega = Math.acos(Math.min(1, Math.max(-1, dot)));
	if (omega < 1e-9) return [a[0], a[1]];
	const sa = Math.sin((1 - f) * omega) / Math.sin(omega);
	const sb = Math.sin(f * omega) / Math.sin(omega);
	const [x, y, z] = va.map((v, i) => sa * v + sb * (vb[i] ?? 0));
	return [
		Math.atan2(z ?? 0, Math.hypot(x ?? 0, y ?? 0)) / RAD,
		Math.atan2(y ?? 0, x ?? 0) / RAD,
	];
}
