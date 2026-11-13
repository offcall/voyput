import {
	COUNTRY_CENTROIDS,
	projectEquirect,
	WORLD_HEIGHT,
	WORLD_WIDTH,
} from "@voyput/core";

/**
 * World-box rectangle (2 : 1) around the visited countries' centroids with a
 * margin, so a trip through a few neighbours is not a dot on a world map.
 * Whole world when nothing has a centroid or the travels span most of it.
 */
export type Box = [x: number, y: number, width: number, height: number];

export function fitView(codes: readonly string[]): Box {
	const whole: Box = [0, 0, WORLD_WIDTH, WORLD_HEIGHT];
	const xy = codes.flatMap((code) => {
		const c = COUNTRY_CENTROIDS[code];
		return c ? [projectEquirect(c[0], c[1])] : [];
	});
	if (xy.length === 0) return whole;
	const xs = xy.map(([x]) => x);
	const ys = xy.map(([, y]) => y);
	const margin = 70;
	let w = Math.max(...xs) - Math.min(...xs) + 2 * margin;
	let h = Math.max(...ys) - Math.min(...ys) + 2 * margin;
	w = Math.max(w, 2 * h, 320);
	h = w / 2;
	if (w >= WORLD_WIDTH * 0.8) return whole;
	const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
	const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
	const x = Math.min(Math.max(cx - w / 2, 0), WORLD_WIDTH - w);
	const y = Math.min(Math.max(cy - h / 2, 0), WORLD_HEIGHT - h);
	return [x, y, w, h];
}
