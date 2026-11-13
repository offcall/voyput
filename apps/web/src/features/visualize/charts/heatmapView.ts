import {
	type CityPoint,
	projectEquirect,
	WORLD_HEIGHT,
	WORLD_WIDTH,
} from "@voyput/core";
import type { Box } from "./view";

/** Camera over the 1000 × 500 world box: centre and world units per CSS pixel. */
export interface HeatView {
	cx: number;
	cy: number;
	k: number;
}

/** Side of one heat square in CSS pixels, at every zoom. */
export const CELL_PX = 8;
/** The shorter side of the deepest zoom, in world units (about 4° of longitude). */
const MIN_SPAN = 12;

/** Whole world fits the canvas at this scale; the widest a view may get. */
function maxScale(width: number, height: number): number {
	return Math.max(WORLD_WIDTH / width, WORLD_HEIGHT / height);
}

function clamp(value: number, lo: number, hi: number): number {
	return Math.min(Math.max(value, lo), hi);
}

/** Keeps a view between full zoom and the whole world, and inside the world box. */
export function clampView(
	view: HeatView,
	width: number,
	height: number,
): HeatView {
	const k = clamp(
		view.k,
		MIN_SPAN / Math.min(width, height),
		maxScale(width, height),
	);
	const halfW = (width * k) / 2;
	const halfH = (height * k) / 2;
	const cx =
		halfW * 2 >= WORLD_WIDTH
			? WORLD_WIDTH / 2
			: clamp(view.cx, halfW, WORLD_WIDTH - halfW);
	const cy =
		halfH * 2 >= WORLD_HEIGHT
			? WORLD_HEIGHT / 2
			: clamp(view.cy, halfH, WORLD_HEIGHT - halfH);
	return { cx, cy, k };
}

/** View showing all of `box` on a `width` × `height` canvas. */
export function viewForBox(box: Box, width: number, height: number): HeatView {
	const [x, y, w, h] = box;
	return clampView(
		{ cx: x + w / 2, cy: y + h / 2, k: Math.max(w / width, h / height) },
		width,
		height,
	);
}

/** Zooms by `factor` (> 1 is in) keeping the world point under canvas pixel `px`, `py` in place. */
export function zoomAt(
	view: HeatView,
	factor: number,
	px: number,
	py: number,
	width: number,
	height: number,
): HeatView {
	const wx = view.cx + (px - width / 2) * view.k;
	const wy = view.cy + (py - height / 2) * view.k;
	const k = view.k / factor;
	return clampView(
		{ cx: wx - (px - width / 2) * k, cy: wy - (py - height / 2) * k, k },
		width,
		height,
	);
}

/** Moves the map by `dx`, `dy` CSS pixels (a drag to the right shows more of the west). */
export function panBy(
	view: HeatView,
	dx: number,
	dy: number,
	width: number,
	height: number,
): HeatView {
	return clampView(
		{ cx: view.cx - dx * view.k, cy: view.cy - dy * view.k, k: view.k },
		width,
		height,
	);
}

export function sameView(a: HeatView, b: HeatView): boolean {
	const eps = 1e-6;
	return (
		Math.abs(a.cx - b.cx) < eps &&
		Math.abs(a.cy - b.cy) < eps &&
		Math.abs(a.k - b.k) < eps * a.k
	);
}

/** `[lat, lon, …]` → world-box `[x, y, …]`, once per data so pans and zooms only bin. */
export function toWorldXY(latLon: Float32Array): Float32Array {
	const out = new Float32Array(latLon.length);
	for (let i = 0; i + 1 < latLon.length; i += 2) {
		const [x, y] = projectEquirect(latLon[i] ?? 0, latLon[i + 1] ?? 0);
		out[i] = x;
		out[i + 1] = y;
	}
	return out;
}

/** Photo counts per screen square for one view. */
export interface HeatGrid {
	cols: number;
	rows: number;
	/** Row-major, `rows × cols`. */
	counts: Uint32Array;
	max: number;
}

/** Counts photos per `CELL_PX` square of the canvas; points outside the view are skipped. */
export function binView(
	xy: Float32Array,
	view: HeatView,
	width: number,
	height: number,
): HeatGrid {
	const cols = Math.max(1, Math.ceil(width / CELL_PX));
	const rows = Math.max(1, Math.ceil(height / CELL_PX));
	const counts = new Uint32Array(cols * rows);
	const left = view.cx - (width / 2) * view.k;
	const top = view.cy - (height / 2) * view.k;
	const cellWorld = CELL_PX * view.k;
	let max = 0;
	for (let i = 0; i + 1 < xy.length; i += 2) {
		const gx = Math.floor(((xy[i] ?? 0) - left) / cellWorld);
		const gy = Math.floor(((xy[i + 1] ?? 0) - top) / cellWorld);
		if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
		const at = gy * cols + gx;
		const n = (counts[at] ?? 0) + 1;
		counts[at] = n;
		if (n > max) max = n;
	}
	return { cols, rows, counts, max };
}

const NICE = [1, 2, 3, 5];

/** Nearest 1-2-3-5 × 10ⁿ number to `value`, in log space. */
function nice(value: number): number {
	const exp = Math.floor(Math.log10(value));
	let best = 1;
	let bestGap = Number.POSITIVE_INFINITY;
	for (const e of [exp, exp + 1]) {
		for (const m of NICE) {
			const candidate = m * 10 ** e;
			const gap = Math.abs(Math.log(candidate) - Math.log(value));
			if (gap < bestGap) {
				bestGap = gap;
				best = candidate;
			}
		}
	}
	return best;
}

/**
 * Lower bounds of up to `classes` colour classes from 1 to `max`, evenly
 * spread on a log scale and rounded to readable numbers: 1, 3, 10, 30, …
 */
export function niceBreaks(max: number, classes = 6): number[] {
	const breaks = [1];
	for (let i = 1; i < classes; i++) {
		const b = nice(max ** (i / classes));
		const last = breaks[breaks.length - 1] ?? 1;
		if (b > last && b <= max) breaks.push(b);
	}
	return breaks;
}

/** Index of the class a count falls in; −1 for no photos. */
export function classOf(count: number, breaks: readonly number[]): number {
	if (count <= 0) return -1;
	let at = 0;
	for (let i = 0; i < breaks.length; i++) {
		if (count >= (breaks[i] ?? 0)) at = i;
	}
	return at;
}

/** Ramp slot (of `slots`) for a class, spread so few classes still span light to hot. */
export function rampSlot(
	index: number,
	classes: number,
	slots: number,
): number {
	if (classes <= 1) return slots - 1;
	return Math.round((index * (slots - 1)) / (classes - 1));
}

/** Legend text of each class: its lower bound, the last one open (`1`, `3`, …, `300+`). */
export function breakLabels(breaks: readonly number[]): string[] {
	return breaks.map((b, i) =>
		i > 0 && i === breaks.length - 1 ? `${b}+` : String(b),
	);
}

/** The square under canvas pixel `px`, `py` and its world-box centre. */
export function cellAt(
	grid: HeatGrid,
	view: HeatView,
	px: number,
	py: number,
	width: number,
	height: number,
): { index: number; count: number; x: number; y: number } | null {
	const gx = Math.floor(px / CELL_PX);
	const gy = Math.floor(py / CELL_PX);
	if (gx < 0 || gy < 0 || gx >= grid.cols || gy >= grid.rows) return null;
	const index = gy * grid.cols + gx;
	const sx = (gx + 0.5) * CELL_PX;
	const sy = (gy + 0.5) * CELL_PX;
	return {
		index,
		count: grid.counts[index] ?? 0,
		x: view.cx + (sx - width / 2) * view.k,
		y: view.cy + (sy - height / 2) * view.k,
	};
}

/** Busiest square of a grid as canvas pixels of its centre, or `null` when empty. */
export function hottestCell(grid: HeatGrid): { px: number; py: number } | null {
	let best = -1;
	let bestCount = 0;
	for (let i = 0; i < grid.counts.length; i++) {
		const n = grid.counts[i] ?? 0;
		if (n > bestCount) {
			bestCount = n;
			best = i;
		}
	}
	if (best < 0) return null;
	return {
		px: ((best % grid.cols) + 0.5) * CELL_PX,
		py: (Math.floor(best / grid.cols) + 0.5) * CELL_PX,
	};
}

/** Photo spot nearest to a world-box point within `radius` world units, for the tip's place name. */
export function nearestCity(
	cities: readonly CityPoint[],
	x: number,
	y: number,
	radius: number,
): CityPoint | null {
	let best: CityPoint | null = null;
	let bestD = radius * radius;
	for (const city of cities) {
		const [cx, cy] = projectEquirect(city.lat, city.lon);
		const d = (cx - x) ** 2 + (cy - y) ** 2;
		if (d <= bestD) {
			bestD = d;
			best = city;
		}
	}
	return best;
}
