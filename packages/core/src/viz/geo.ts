/** Approximate country centroids `[lat, lon]` for drawing arcs. Good enough for charts. */
export const COUNTRY_CENTROIDS: Readonly<
	Record<string, readonly [number, number]>
> = {
	AE: [23.4, 54.3],
	AL: [41.2, 20.0],
	AM: [40.3, 45.0],
	AR: [-38.4, -63.6],
	AT: [47.5, 14.5],
	AU: [-25.3, 133.8],
	BA: [44.1, 17.7],
	CL: [-35.7, -71.5],
	CN: [35.8, 104.2],
	CO: [4.0, -73.0],
	CZ: [49.8, 15.5],
	DE: [51.2, 10.4],
	DK: [56.1, 9.5],
	ES: [40.0, -3.5],
	FR: [46.6, 2.2],
	GB: [53.8, -1.6],
	GE: [42.3, 43.4],
	HU: [47.2, 19.5],
	ID: [-2.5, 118.0],
	IE: [53.4, -7.7],
	IN: [21.8, 78.0],
	IT: [42.8, 12.8],
	JM: [18.1, -77.3],
	JP: [36.2, 138.2],
	KG: [41.5, 74.6],
	KZ: [48.0, 67.0],
	LA: [18.0, 104.7],
	MD: [47.3, 28.3],
	MG: [-19.4, 46.7],
	MK: [41.6, 21.7],
	MU: [-20.3, 57.6],
	MX: [23.6, -102.5],
	MY: [4.2, 102.0],
	NL: [52.2, 5.5],
	PE: [-9.2, -75.0],
	PL: [52.1, 19.4],
	QA: [25.3, 51.2],
	RO: [45.9, 25.0],
	RS: [44.2, 20.9],
	RU: [55.8, 37.6],
	SG: [1.35, 103.8],
	TH: [15.9, 100.9],
	TR: [39.0, 35.0],
	TW: [23.7, 121.0],
	UA: [49.0, 32.0],
	UY: [-32.5, -55.8],
	VN: [16.0, 106.0],
	XK: [42.6, 20.9],
	ZA: [-30.6, 22.9],
};

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
