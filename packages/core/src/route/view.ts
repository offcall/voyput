import { WORLD_HEIGHT, WORLD_WIDTH } from "../viz/geo";

/** SVG viewBox: `[x, y, width, height]` in `projectEquirect` units. */
export type MapView = readonly [number, number, number, number];

/**
 * Zoom presets for the 1000 × 500 map. The prototype's 560 × 220 boxes scaled
 * per axis (× 1000/560, × 500/220); each keeps the map's 2 : 1 shape.
 */
export const ZOOM_PRESETS = {
	world: [0, 0, WORLD_WIDTH, WORLD_HEIGHT],
	europe: [459, 66, 189, 95],
	asia: [575, 45, 411, 207],
	americas: [143, 111, 277, 139],
} as const satisfies Record<string, MapView>;

export type ZoomPreset = keyof typeof ZOOM_PRESETS;

/** Zooms around the view's centre; `factor` < 1 zooms in. */
export function zoomView(view: MapView, factor: number): MapView {
	const [x, y, w, h] = view;
	return [
		x + (w * (1 - factor)) / 2,
		y + (h * (1 - factor)) / 2,
		w * factor,
		h * factor,
	];
}

/** View after dragging by `(dx, dy)` screen pixels on an element of `width × height` pixels. */
export function panView(
	view: MapView,
	dx: number,
	dy: number,
	width: number,
	height: number,
): MapView {
	const [x, y, w, h] = view;
	if (width <= 0 || height <= 0) return view;
	return [x - (dx / width) * w, y - (dy / height) * h, w, h];
}
