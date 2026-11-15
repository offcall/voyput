import {
	COUNTRY_CENTROIDS,
	projectEquirect,
	WORLD_HEIGHT,
	WORLD_WIDTH,
} from "@voyput/core";

/** Rectangle in the 1000 × 500 world box. */
export type Box = [x: number, y: number, width: number, height: number];

const WHOLE: Box = [0, 0, WORLD_WIDTH, WORLD_HEIGHT];

/**
 * Rectangle of `aspect` (width / height, 2 : 1 by default) around world-box
 * points with a margin, so a trip through a few neighbours is not a dot on a
 * world map. Every point stays inside. Whole world when there are no points
 * or they span most of it.
 */
export function fitPoints(xy: readonly [number, number][], aspect = 2): Box {
	if (xy.length === 0) return WHOLE;
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const [x, y] of xy) {
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
		minY = Math.min(minY, y);
		maxY = Math.max(maxY, y);
	}
	const margin = 70;
	let w = maxX - minX + 2 * margin;
	let h = maxY - minY + 2 * margin;
	// The smallest box keeps the 320 × 160 area at any aspect.
	w = Math.max(w, aspect * h, 320 * Math.sqrt(aspect / 2));
	h = w / aspect;
	if (w >= WORLD_WIDTH * 0.8 || h >= WORLD_HEIGHT) return WHOLE;
	const x = Math.min(Math.max((minX + maxX) / 2 - w / 2, 0), WORLD_WIDTH - w);
	const y = Math.min(Math.max((minY + maxY) / 2 - h / 2, 0), WORLD_HEIGHT - h);
	return [x, y, w, h];
}

/** Box around the visited countries' centroids (the route map's marks). */
export function fitView(codes: readonly string[], aspect = 2): Box {
	return fitPoints(
		codes.flatMap((code) => {
			const c = COUNTRY_CENTROIDS[code];
			return c ? [projectEquirect(c[0], c[1])] : [];
		}),
		aspect,
	);
}

/** Box around photo coordinates given as flat `[lat, lon, lat, lon, …]`. */
export function fitLatLon(points: Float32Array): Box {
	const xy: [number, number][] = [];
	for (let i = 0; i + 1 < points.length; i += 2) {
		xy.push(projectEquirect(points[i] ?? 0, points[i + 1] ?? 0));
	}
	return fitPoints(xy);
}
