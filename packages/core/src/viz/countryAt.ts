import { geometryRings, type Ring, WORLD_NAME_TO_CODE } from "./world";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

/** The ISO code of the country at a point, or null when none is near enough. */
export type CountryLocator = (lat: number, lon: number) => string | null;

/** How far outside every outline a point may be and still get the nearest country. */
export const NEAREST_COUNTRY_KM = 50;

const KM_PER_DEGREE = 111.2;

interface Country {
	code: string;
	rings: Ring[];
	/** [minLon, minLat, maxLon, maxLat] */
	box: [number, number, number, number];
}

/** Even-odd ray casting over all rings, so holes and separate islands both count right. */
function contains(rings: Ring[], lat: number, lon: number): boolean {
	let inside = false;
	for (const ring of rings) {
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const a = ring[i];
			const b = ring[j];
			if (!a || !b) continue;
			const [ax, ay] = a;
			const [bx, by] = b;
			if (
				ay > lat !== by > lat &&
				lon < ((bx - ax) * (lat - ay)) / (by - ay) + ax
			)
				inside = !inside;
		}
	}
	return inside;
}

/** Shortest distance in km from the point to the rings' edges (flat Earth near the point). */
function distanceKm(rings: Ring[], lat: number, lon: number): number {
	const scale = Math.cos((lat * Math.PI) / 180);
	const project = ([pLon, pLat]: [number, number]): [number, number] => {
		let dLon = pLon - lon;
		if (dLon > 180) dLon -= 360;
		if (dLon < -180) dLon += 360;
		return [dLon * scale * KM_PER_DEGREE, (pLat - lat) * KM_PER_DEGREE];
	};
	let best = Number.POSITIVE_INFINITY;
	for (const ring of rings) {
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const a = ring[i];
			const b = ring[j];
			if (!a || !b) continue;
			const [ax, ay] = project(a);
			const [bx, by] = project(b);
			const dx = bx - ax;
			const dy = by - ay;
			const length = dx * dx + dy * dy;
			const t =
				length === 0
					? 0
					: Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
			best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
		}
	}
	return best;
}

function nearBox(country: Country, lat: number, lon: number, km: number) {
	const [minLon, minLat, maxLon, maxLat] = country.box;
	const latMargin = km / KM_PER_DEGREE;
	const lonMargin =
		latMargin /
		Math.max(0.01, Math.cos((Math.min(89, Math.abs(lat)) * Math.PI) / 180));
	return (
		lat >= minLat - latMargin &&
		lat <= maxLat + latMargin &&
		lon >= minLon - lonMargin &&
		lon <= maxLon + lonMargin
	);
}

/**
 * Finds countries from the world outlines the app ships (Natural Earth 110m).
 * A point inside an outline gets that country; a point outside all of them
 * (a coast, a small island, a lake) gets the nearest country within
 * `maxKm`. The outlines are coarse: points near a border can land in the
 * neighbour, and states too small for the map (Monaco, Andorra, ...) are not
 * found (ADR 0033).
 */
export function buildCountryLocator(
	geoJson: unknown,
	maxKm = NEAREST_COUNTRY_KM,
): CountryLocator {
	const features =
		isRecord(geoJson) && Array.isArray(geoJson.features)
			? geoJson.features
			: [];
	const countries: Country[] = [];
	for (const feature of features) {
		if (!isRecord(feature)) continue;
		const name = isRecord(feature.properties) ? feature.properties.name : "";
		const code =
			typeof name === "string" ? WORLD_NAME_TO_CODE[name] : undefined;
		const rings = geometryRings(feature.geometry);
		if (!code || rings.length === 0) continue;
		const box: Country["box"] = [180, 90, -180, -90];
		for (const ring of rings)
			for (const [lon, lat] of ring) {
				box[0] = Math.min(box[0], lon);
				box[1] = Math.min(box[1], lat);
				box[2] = Math.max(box[2], lon);
				box[3] = Math.max(box[3], lat);
			}
		countries.push({ code, rings, box });
	}
	return (lat, lon) => {
		for (const country of countries)
			if (nearBox(country, lat, lon, 0) && contains(country.rings, lat, lon))
				return country.code;
		let nearest: string | null = null;
		let nearestKm = maxKm;
		for (const country of countries) {
			if (!nearBox(country, lat, lon, maxKm)) continue;
			const km = distanceKm(country.rings, lat, lon);
			if (km <= nearestKm) {
				nearest = country.code;
				nearestKm = km;
			}
		}
		return nearest;
	};
}
