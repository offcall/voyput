/**
 * Writes the country outlines voyput uses to find the country of a photo
 * location (ADR 0033) from Natural Earth 10m admin 0 countries (public
 * domain), every point kept, rounded to 1e-4° (~11 m).
 *
 * Download ne_10m_admin_0_countries.geojson from
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
 * the island of Cyprus is CY, Somaliland SO, the Guantanamo base US. The rest
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
};

type Position = [number, number];

const path = process.argv[2];
if (!path) {
	process.stderr.write(
		"usage: npm run world:outlines -- ne_10m_admin_0_countries.geojson\n",
	);
	process.exit(2);
}
const source = JSON.parse(readFileSync(path, "utf8")) as {
	features: {
		properties: { NAME: string; ISO_A2_EH: string };
		geometry: { type: string; coordinates: unknown };
	}[];
};

/** Per code, each ring as `[lon, lat]` integer deltas at OUTLINE_SCALE. */
const countries: Record<string, number[][]> = {};
for (const { properties, geometry } of source.features) {
	const code =
		properties.ISO_A2_EH !== "-99"
			? properties.ISO_A2_EH
			: NO_CODE[properties.NAME];
	if (!code || !/^[A-Z]{2}$/.test(code)) {
		process.stdout.write(`left out: ${properties.NAME}\n`);
		continue;
	}
	const polygons = (
		geometry.type === "MultiPolygon"
			? geometry.coordinates
			: [geometry.coordinates]
	) as Position[][][];
	for (const polygon of polygons)
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
			const rings = countries[code] ?? [];
			rings.push(deltas);
			countries[code] = rings;
		}
}

writeFileSync(
	join(ROOT, OUT),
	JSON.stringify({
		source: "Natural Earth 10m admin 0 countries (public domain)",
		scale: OUTLINE_SCALE,
		countries,
	}),
);
process.stdout.write(`wrote ${OUT}: ${Object.keys(countries).length} codes\n`);
