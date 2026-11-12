import { projectEquirect } from "./geo";

/** Land outlines ready to draw: SVG paths on the 1000 × 500 plate carrée box, rings for the globe. */
export interface WorldShapes {
	landPath: string;
	/** SVG path per ISO country code, only for countries we can map. */
	countryPaths: Record<string, string>;
	/** Decimated outlines as `[lat, lon]` for the globe. */
	rings: [number, number][][];
}

// Natural Earth 110m names → ISO 3166-1 alpha-2, for the countries seen in exports so far.
const WORLD_NAME_TO_CODE: Record<string, string> = {
	"United Arab Emirates": "AE",
	Albania: "AL",
	Armenia: "AM",
	Argentina: "AR",
	Austria: "AT",
	Australia: "AU",
	"Bosnia and Herzegovina": "BA",
	Chile: "CL",
	China: "CN",
	Colombia: "CO",
	"Czech Republic": "CZ",
	Germany: "DE",
	Denmark: "DK",
	Spain: "ES",
	France: "FR",
	"United Kingdom": "GB",
	Georgia: "GE",
	Hungary: "HU",
	Indonesia: "ID",
	Ireland: "IE",
	India: "IN",
	Italy: "IT",
	Jamaica: "JM",
	Japan: "JP",
	Kyrgyzstan: "KG",
	Kazakhstan: "KZ",
	Laos: "LA",
	Moldova: "MD",
	Madagascar: "MG",
	Macedonia: "MK",
	Mexico: "MX",
	Malaysia: "MY",
	Netherlands: "NL",
	Peru: "PE",
	Poland: "PL",
	Qatar: "QA",
	Romania: "RO",
	"Republic of Serbia": "RS",
	Russia: "RU",
	Thailand: "TH",
	Turkey: "TR",
	Taiwan: "TW",
	Ukraine: "UA",
	Uruguay: "UY",
	Vietnam: "VN",
	Kosovo: "XK",
	"South Africa": "ZA",
};

const GLOBE_RING_POINTS = 60;

type Ring = [number, number][];

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
function geometryRings(geometry: unknown): Ring[] {
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
