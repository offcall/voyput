export { COUNTRY_CENTROIDS } from "./worldTable.generated";

const EARTH_RADIUS_KM = 6371;

export function haversineKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const rad = Math.PI / 180;
	const dLat = (lat2 - lat1) * rad;
	const dLon = (lon2 - lon1) * rad;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Stable hue (0–359) per country code, so a country keeps its colour across charts. */
export function countryHue(code: string): number {
	let hash = 0;
	for (const char of code) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return hash % 360;
}

export function countryColor(code: string): string {
	return `hsl(${countryHue(code)}, 70%, 55%)`;
}

/** Plate carrée projection onto a 1000 × 500 box. */
export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 500;

export function projectEquirect(lat: number, lon: number): [number, number] {
	return [((lon + 180) / 360) * WORLD_WIDTH, ((90 - lat) / 180) * WORLD_HEIGHT];
}
