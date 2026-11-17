import { projectEquirect } from "./geo";
import { WORLD_NAME_TO_CODE } from "./worldTable.generated";

export { WORLD_NAME_TO_CODE };

/** Land outlines ready to draw: SVG paths on the 1000 × 500 plate carrée box, rings for the globe. */
export interface WorldShapes {
	landPath: string;
	/** SVG path per ISO country code, for every outline. */
	countryPaths: Record<string, string>;
	/** Decimated outlines as `[lat, lon]` for the globe. */
	rings: [number, number][][];
}

const GLOBE_RING_POINTS = 60;

/** A closed outline as `[lon, lat]` points, as in GeoJSON. */
export type Ring = [number, number][];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asRing(value: unknown): Ring | null {
	if (!Array.isArray(value)) return null;
	const ring: Ring = [];
	for (const point of value) {
		if (!Array.isArray(point)) return null;
		const [lon, lat] = point;
		if (typeof lon !== "number" || typeof lat !== "number") return null;
		ring.push([lon, lat]);
	}
	return ring;
}

/** Rings of a Polygon or MultiPolygon geometry as `[lon, lat]`; anything else yields none. */
export function geometryRings(geometry: unknown): Ring[] {
	if (!isRecord(geometry) || !Array.isArray(geometry.coordinates)) return [];
	const polygons: unknown[] =
		geometry.type === "MultiPolygon"
			? geometry.coordinates
			: geometry.type === "Polygon"
				? [geometry.coordinates]
				: [];
	const rings: Ring[] = [];
	for (const polygon of polygons) {
		if (!Array.isArray(polygon)) continue;
		for (const raw of polygon) {
			const ring = asRing(raw);
			if (ring?.length) rings.push(ring);
		}
	}
	return rings;
}

/** Turns a GeoJSON FeatureCollection of countries into drawable shapes. */
export function buildWorldShapes(geoJson: unknown): WorldShapes {
	const features =
		isRecord(geoJson) && Array.isArray(geoJson.features)
			? geoJson.features
			: [];
	const landParts: string[] = [];
	const countryPaths: Record<string, string> = {};
	const rings: [number, number][][] = [];
	for (const feature of features) {
		if (!isRecord(feature)) continue;
		const name = isRecord(feature.properties) ? feature.properties.name : "";
		const code =
			typeof name === "string" ? WORLD_NAME_TO_CODE[name] : undefined;
		for (const ring of geometryRings(feature.geometry)) {
			const d = `M${ring
				.map(([lon, lat]) => {
					const [x, y] = projectEquirect(lat, lon);
					return `${x.toFixed(1)} ${y.toFixed(1)}`;
				})
				.join("L")}Z`;
			landParts.push(d);
			if (code) countryPaths[code] = (countryPaths[code] ?? "") + d;

			const step = Math.max(1, Math.ceil(ring.length / GLOBE_RING_POINTS));
			const decimated: [number, number][] = [];
			for (let i = 0; i < ring.length; i += step) {
				const point = ring[i];
				if (point) decimated.push([point[1], point[0]]);
			}
			if (decimated.length >= 4) rings.push(decimated);
		}
	}
	return { landPath: landParts.join(""), countryPaths, rings };
}
