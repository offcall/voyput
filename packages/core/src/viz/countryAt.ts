/** The ISO code of the country at a point, or null when none is near enough. */
export type CountryLocator = (lat: number, lon: number) => string | null;

/** Outline coordinates are integers in units of 1 / OUTLINE_SCALE degree (~11 m). */
export const OUTLINE_SCALE = 10_000;

/** How far outside every outline a point may be and still get the nearest country. */
export const NEAREST_COUNTRY_KM = 50;

/** One country's outlines as `[lon, lat]` rings in degrees. */
export interface CountryOutline {
	code: string;
	rings: [number, number][][];
}

const KM_PER_DEGREE = 111.2;
/** Latitude band height for the inside test, in degrees. */
const BAND = 0.05;
/** Grid cell size for the nearest-edge search, in degrees. */
const CELL = 0.25;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

/**
 * Reads `{ scale, countries: { CODE: [ring, ...] } }`, each ring a flat list
 * of `[lon, lat]` integer deltas (scripts/world/outlines.ts). Anything
 * malformed is left out.
 */
export function decodeCountryOutlines(data: unknown): CountryOutline[] {
	if (!isRecord(data) || !isRecord(data.countries)) return [];
	const scale = typeof data.scale === "number" ? data.scale : OUTLINE_SCALE;
	const outlines: CountryOutline[] = [];
	for (const [code, rings] of Object.entries(data.countries)) {
		if (!/^[A-Z]{2}$/.test(code) || !Array.isArray(rings)) continue;
		const decoded: [number, number][][] = [];
		for (const ring of rings) {
			if (!Array.isArray(ring) || ring.length < 8 || ring.length % 2) continue;
			let x = 0;
			let y = 0;
			const points: [number, number][] = [];
			for (let i = 0; i < ring.length; i += 2) {
				const dx = ring[i];
				const dy = ring[i + 1];
				if (typeof dx !== "number" || typeof dy !== "number") break;
				x += dx;
				y += dy;
				points.push([x / scale, y / scale]);
			}
			if (points.length * 2 === ring.length) decoded.push(points);
		}
		if (decoded.length) outlines.push({ code, rings: decoded });
	}
	return outlines;
}

interface Edge {
	country: number;
	ax: number;
	ay: number;
	bx: number;
	by: number;
}

function push<K>(map: Map<K, number[]>, key: K, value: number) {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

/** Distance in km from the point to an edge, on a flat Earth around the point. */
function edgeKm(edge: Edge, lat: number, lon: number, scale: number): number {
	const wrap = (d: number) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
	const ax = wrap(edge.ax - lon) * scale;
	const ay = edge.ay - lat;
	const bx = wrap(edge.bx - lon) * scale;
	const by = edge.by - lat;
	const dx = bx - ax;
	const dy = by - ay;
	const length = dx * dx + dy * dy;
	const t =
		length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
	return Math.hypot(ax + t * dx, ay + t * dy) * KM_PER_DEGREE;
}

/**
 * Finds the country at a point: the outline it lies in (the smallest one
 * when outlines nest, such as an enclave drawn without its hole), else the
 * nearest outline within `maxKm` (a beach, a pier, a boat), else null.
 * Answers are cached per ~11 m, since photos cluster.
 */
export function buildCountryLocator(
	outlines: readonly CountryOutline[],
	maxKm = NEAREST_COUNTRY_KM,
): CountryLocator {
	const edges: Edge[] = [];
	const bands = new Map<number, number[]>();
	const cells = new Map<string, number[]>();
	const areas: number[] = [];
	outlines.forEach((outline, country) => {
		let minX = 180;
		let minY = 90;
		let maxX = -180;
		let maxY = -90;
		for (const ring of outline.rings)
			for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
				const a = ring[i];
				const b = ring[j];
				if (!a || !b) continue;
				const edge = { country, ax: a[0], ay: a[1], bx: b[0], by: b[1] };
				const index = edges.push(edge) - 1;
				minX = Math.min(minX, a[0]);
				maxX = Math.max(maxX, a[0]);
				minY = Math.min(minY, a[1]);
				maxY = Math.max(maxY, a[1]);
				const low = Math.min(edge.ay, edge.by);
				const high = Math.max(edge.ay, edge.by);
				for (
					let band = Math.floor(low / BAND);
					band <= Math.floor(high / BAND);
					band++
				)
					push(bands, band, index);
				const left = Math.floor(Math.min(edge.ax, edge.bx) / CELL);
				const right = Math.floor(Math.max(edge.ax, edge.bx) / CELL);
				for (
					let row = Math.floor(low / CELL);
					row <= Math.floor(high / CELL);
					row++
				)
					for (let column = left; column <= right; column++)
						push(cells, `${row},${column}`, index);
			}
		areas[country] = (maxX - minX) * (maxY - minY);
	});

	const inside = (lat: number, lon: number): string | null => {
		const crossings = new Map<number, number>();
		for (const index of bands.get(Math.floor(lat / BAND)) ?? []) {
			const edge = edges[index];
			if (!edge || edge.ay > lat === edge.by > lat) continue;
			const x =
				((edge.bx - edge.ax) * (lat - edge.ay)) / (edge.by - edge.ay) + edge.ax;
			if (lon < x)
				crossings.set(edge.country, (crossings.get(edge.country) ?? 0) + 1);
		}
		let best: number | null = null;
		for (const [country, count] of crossings)
			if (
				count % 2 === 1 &&
				(best === null || (areas[country] ?? 0) < (areas[best] ?? 0))
			)
				best = country;
		return best === null ? null : (outlines[best]?.code ?? null);
	};

	const nearest = (lat: number, lon: number): string | null => {
		const scale = Math.cos((lat * Math.PI) / 180);
		const latReach = maxKm / KM_PER_DEGREE;
		const lonReach = Math.min(180, latReach / Math.max(0.01, scale));
		let best: number | null = null;
		let bestKm = maxKm;
		const seen = new Set<number>();
		for (
			let row = Math.floor((lat - latReach) / CELL);
			row <= Math.floor((lat + latReach) / CELL);
			row++
		)
			for (
				let step = Math.floor((lon - lonReach) / CELL);
				step <= Math.floor((lon + lonReach) / CELL);
				step++
			) {
				// Columns past ±180° continue on the other side.
				const columns = 360 / CELL;
				const column =
					((((step + columns / 2) % columns) + columns) % columns) -
					columns / 2;
				for (const index of cells.get(`${row},${column}`) ?? []) {
					if (seen.has(index)) continue;
					seen.add(index);
					const edge = edges[index];
					if (!edge) continue;
					const km = edgeKm(edge, lat, lon, scale);
					if (km <= bestKm) {
						best = edge.country;
						bestKm = km;
					}
				}
			}
		return best === null ? null : (outlines[best]?.code ?? null);
	};

	const cache = new Map<string, string | null>();
	return (lat, lon) => {
		const key = `${Math.round(lat * OUTLINE_SCALE)},${Math.round(lon * OUTLINE_SCALE)}`;
		let code = cache.get(key);
		if (code === undefined) {
			code = inside(lat, lon) ?? nearest(lat, lon);
			cache.set(key, code);
		}
		return code;
	};
}
