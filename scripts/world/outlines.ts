/**
 * Writes the country outlines voyput uses to find the country of a photo
 * location (ADR 0033, ADR 0037) from Natural Earth 10m admin 0 map units
 * (public domain), every point kept, rounded to 1e-4° (~11 m). Map units,
 * unlike the countries layer, keep overseas territories (Réunion, Svalbard,
 * Cocos Is., ...) apart from their parent country under their own ISO code.
 *
 * Download ne_10m_admin_0_map_units.geojson from
 * https://github.com/nvkelso/natural-earth-vector/tree/master/geojson, then
 * from the repo root: `npm run world:outlines -- <path to that file>`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OUTLINE_SCALE } from "../../packages/core/src/viz/countryAt.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = "apps/web/src/features/import/csv/assets/country-outlines.json";

/**
 * Areas Natural Earth gives no ISO code (-99), placed where a traveller is:
 * the island of Cyprus is CY, Somaliland SO, the Guantanamo base US, each
 * half of the Korean DMZ its side. The rest
 * (disputed glaciers, reefs, Bir Tawil) stay out and fall to the nearest
 * country.
 */
const NO_CODE: Readonly<Record<string, string>> = {
	Akrotiri: "CY",
	Dhekelia: "CY",
	"N. Cyprus": "CY",
	"Cyprus U.N. Buffer Zone": "CY",
	Somaliland: "SO",
	"USNB Guantanamo Bay": "US",
	"Korean DMZ (south)": "KR",
	"Korean DMZ (north)": "KP",
};

/**
 * Map units (by SU_A3) whose ISO_A2_EH is the parent country or a code
 * outside ISO 3166, put under the territory a traveller's records use.
 */
const UNIT_CODE: Readonly<Record<string, string>> = {
	NJM: "SJ", // Jan Mayen, with Svalbard
	SYU: "SY", // UNDOF zone on the Golan, "XD" in Natural Earth
	JQI: "UM", // Johnston Atoll and the other U.S. Minor Outlying Islands
	DQI: "UM",
	FQI: "UM",
	HQI: "UM",
	WQI: "UM",
	MQI: "UM",
	BQI: "UM",
	LQI: "UM",
	KQI: "UM",
};

/**
 * Natural Earth draws Crimea as one part of Russia's unit; voyput's map draws
 * it as Ukraine (UN position), so the part inside this box is UA (ADR 0037).
 */
const CRIMEA = { west: 32, east: 37, south: 44, north: 46.5 };

type Position = [number, number];

const inCrimea = (ring: Position[]) =>
	ring.every(
		([lon, lat]) =>
			lon > CRIMEA.west &&
			lon < CRIMEA.east &&
			lat > CRIMEA.south &&
			lat < CRIMEA.north,
	);

const path = process.argv[2];
if (!path) {
	process.stderr.write(
		"usage: npm run world:outlines -- ne_10m_admin_0_map_units.geojson\n",
	);
	process.exit(2);
}
const source = JSON.parse(readFileSync(path, "utf8")) as {
	features: {
		properties: { NAME: string; SU_A3: string; ISO_A2_EH: string };
		geometry: { type: string; coordinates: unknown };
	}[];
};

/** Per code, each ring as `[lon, lat]` integer deltas at OUTLINE_SCALE. */
const countries: Record<string, number[][]> = {};
let crimeaParts = 0;
for (const { properties, geometry } of source.features) {
	const code =
		UNIT_CODE[properties.SU_A3] ??
		(properties.ISO_A2_EH !== "-99"
			? properties.ISO_A2_EH
			: NO_CODE[properties.NAME]);
	if (!code || !/^[A-Z]{2}$/.test(code)) {
		process.stdout.write(`left out: ${properties.NAME}\n`);
		continue;
	}
	const polygons = (
		geometry.type === "MultiPolygon"
			? geometry.coordinates
			: [geometry.coordinates]
	) as Position[][][];
	for (const polygon of polygons) {
		const crimea = code === "RU" && inCrimea(polygon[0] ?? []);
		if (crimea) crimeaParts++;
		const partCode = crimea ? "UA" : code;
		for (const ring of polygon) {
			let x = 0;
			let y = 0;
			const deltas: number[] = [];
			for (const [lon, lat] of ring) {
				const nx = Math.round(lon * OUTLINE_SCALE);
				const ny = Math.round(lat * OUTLINE_SCALE);
				if (deltas.length && nx === x && ny === y) continue;
				deltas.push(nx - x, ny - y);
				x = nx;
				y = ny;
			}
			if (deltas.length < 8) continue;
			const rings = countries[partCode] ?? [];
			rings.push(deltas);
			countries[partCode] = rings;
		}
	}
}
if (crimeaParts !== 1) {
	process.stderr.write(
		`expected one Crimea part of RU, found ${crimeaParts}\n`,
	);
	process.exit(1);
}

writeFileSync(
	join(ROOT, OUT),
	JSON.stringify({
		source: "Natural Earth 10m admin 0 map units (public domain)",
		scale: OUTLINE_SCALE,
		countries,
	}),
);
process.stdout.write(`wrote ${OUT}: ${Object.keys(countries).length} codes\n`);
