/**
 * Derives the country tables the map and globe need from the vendored world
 * outlines: each feature's ISO 3166-1 alpha-2 code and one centroid per code.
 * Pure, so the generator writes it and a test checks the written file.
 */

import { ALPHA3_TO_ALPHA2 } from "./iso3.ts";
import { POINT_CENTROIDS } from "./points.ts";

/**
 * Features whose id is not an ISO alpha-3 code (`-99`, `CS-KM`). Northern
 * Cyprus and Somaliland have no ISO code; photo exports and stamps file them
 * under CY and SO, so their outlines fill as part of those countries.
 */
const NAME_ALIASES: Readonly<Record<string, string>> = {
	Kosovo: "XK",
	"Northern Cyprus": "CY",
	Somaliland: "SO",
};

type Ring = [number, number][];

export interface WorldTable {
	/** Feature name → alpha-2 code, for every feature in the outlines. */
	nameToCode: Record<string, string>;
	/** `[lat, lon]` per alpha-2 code: outlines first, then `POINT_CENTROIDS`. */
	centroids: Record<string, [number, number]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asRing(value: unknown): Ring | null {
	if (!Array.isArray(value) || value.length < 4) return null;
	const ring: Ring = [];
	for (const point of value) {
		if (!Array.isArray(point)) return null;
		const [lon, lat] = point;
		if (typeof lon !== "number" || typeof lat !== "number") return null;
		ring.push([lon, lat]);
	}
	return ring;
}

/** Outer rings (`[lon, lat]`) of a Polygon or MultiPolygon. */
function outerRings(geometry: unknown): Ring[] {
	if (!isRecord(geometry) || !Array.isArray(geometry.coordinates)) return [];
	const polygons: unknown[] =
		geometry.type === "MultiPolygon"
			? geometry.coordinates
			: geometry.type === "Polygon"
				? [geometry.coordinates]
				: [];
	return polygons.flatMap((polygon) => {
		const ring = Array.isArray(polygon) ? asRing(polygon[0]) : null;
		return ring ? [ring] : [];
	});
}

/** Shoelace area and centroid in the lon/lat plane. */
function areaCentroid(ring: Ring): { area: number; lon: number; lat: number } {
	let a = 0;
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < ring.length; i++) {
		const [x1, y1] = ring[i] ?? [0, 0];
		const [x2, y2] = ring[(i + 1) % ring.length] ?? [0, 0];
		const cross = x1 * y2 - x2 * y1;
		a += cross;
		cx += (x1 + x2) * cross;
		cy += (y1 + y2) * cross;
	}
	return a === 0
		? { area: 0, lon: ring[0]?.[0] ?? 0, lat: ring[0]?.[1] ?? 0 }
		: { area: Math.abs(a / 2), lon: cx / (3 * a), lat: cy / (3 * a) };
}

/** Longitudes where the ring crosses the parallel `lat`, sorted. */
function crossings(ring: Ring, lat: number): number[] {
	const xs: number[] = [];
	for (let i = 0; i < ring.length; i++) {
		const [x1, y1] = ring[i] ?? [0, 0];
		const [x2, y2] = ring[(i + 1) % ring.length] ?? [0, 0];
		if (y1 > lat !== y2 > lat)
			xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
	}
	return xs.sort((p, q) => p - q);
}

/**
 * A point inside the ring: its area centroid, or for a bent shape whose
 * centroid falls outside (Chile, Croatia, Vietnam) the middle of the widest
 * stretch of land along the centroid's parallel.
 */
export function interiorPoint(ring: Ring): [lat: number, lon: number] {
	const { lon, lat } = areaCentroid(ring);
	const xs = crossings(ring, lat);
	let best: [number, number] | null = null;
	for (let i = 0; i + 1 < xs.length; i += 2) {
		const west = xs[i] ?? 0;
		const east = xs[i + 1] ?? 0;
		if (lon >= west && lon <= east) return [lat, lon];
		if (!best || east - west > best[1] - best[0]) best = [west, east];
	}
	return best ? [lat, (best[0] + best[1]) / 2] : [lat, lon];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The country code of an outline feature: its alpha-3 id, else its name. */
export function featureCode(feature: unknown): string | undefined {
	if (!isRecord(feature)) return undefined;
	const id = typeof feature.id === "string" ? feature.id : "";
	const name = isRecord(feature.properties) ? feature.properties.name : "";
	return (
		ALPHA3_TO_ALPHA2[id] ??
		(typeof name === "string" ? NAME_ALIASES[name] : undefined)
	);
}

/** Codes and centroids for a GeoJSON FeatureCollection of countries. */
export function deriveWorldTable(geoJson: unknown): WorldTable {
	const features =
		isRecord(geoJson) && Array.isArray(geoJson.features)
			? geoJson.features
			: [];
	const nameToCode: Record<string, string> = {};
	const largest = new Map<string, { area: number; ring: Ring }>();
	for (const feature of features) {
		const code = featureCode(feature);
		const name =
			isRecord(feature) && isRecord(feature.properties)
				? feature.properties.name
				: undefined;
		if (!code || typeof name !== "string")
			throw new Error(`No country code for outline ${JSON.stringify(name)}`);
		nameToCode[name] = code;
		// A country's centroid sits in its largest piece of land, so Alaska,
		// Svalbard or Corsica do not pull it off the mainland.
		for (const ring of outerRings(
			isRecord(feature) ? feature.geometry : null,
		)) {
			const { area } = areaCentroid(ring);
			if (area > (largest.get(code)?.area ?? -1))
				largest.set(code, { area, ring });
		}
	}
	const centroids: Record<string, [number, number]> = {};
	for (const code of [...largest.keys()].sort()) {
		const piece = largest.get(code);
		if (!piece) continue;
		const [lat, lon] = interiorPoint(piece.ring);
		centroids[code] = [round(lat), round(lon)];
	}
	for (const [code, [lat, lon]] of Object.entries(POINT_CENTROIDS))
		centroids[code] ??= [lat, lon];
	return {
		nameToCode: Object.fromEntries(
			Object.entries(nameToCode).sort(([a], [b]) => (a < b ? -1 : 1)),
		),
		centroids: Object.fromEntries(
			Object.entries(centroids).sort(([a], [b]) => (a < b ? -1 : 1)),
		),
	};
}
