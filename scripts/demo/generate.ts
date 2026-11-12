/**
 * Writes the demo data into apps/web/public/demo:
 * passport page PNGs, ground-truth stamps (demo.json) and photo_locations.csv.
 *
 * Run from the repo root: `npm run demo:generate`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import type { Passport, PassportPhoto, Stamp } from "@voyput/core";
import { dateText, pageSvg } from "./draw.ts";
import { locationsCsv } from "./locations.ts";
import { COUNTRIES, PAGES } from "./scenario.ts";

const OUT = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../apps/web/public/demo",
);

/** Fixed, so regenerating gives the same files. */
const CREATED_AT = "2026-11-12T00:00:00.000Z";
const PASSPORT_ID = "demo-passport";

mkdirSync(OUT, { recursive: true });

const passport: Passport = {
	id: PASSPORT_ID,
	name: "Demo passport",
	validFrom: "2015-06-01",
	validTo: "2025-05-31",
	createdAt: CREATED_AT,
};

const photos: PassportPhoto[] = [];
const stamps: Stamp[] = [];

PAGES.forEach((page, i) => {
	const name = `page-${i + 1}.png`;
	const photo: PassportPhoto = {
		id: `demo-photo-${i + 1}`,
		passportId: PASSPORT_ID,
		name,
		mimeType: "image/png",
		rotation: 0,
		addedAt: CREATED_AT,
	};
	photos.push(photo);
	const png = new Resvg(pageSvg(page, i + 7), {
		font: { loadSystemFonts: true },
	})
		.render()
		.asPng();
	writeFileSync(join(OUT, name), png);

	for (const plan of page.stamps) {
		const country = COUNTRIES[plan.country];
		stamps.push({
			id: `demo-stamp-${String(stamps.length + 1).padStart(2, "0")}`,
			passportId: PASSPORT_ID,
			photoId: photo.id,
			direction: plan.direction,
			borderCrossing: plan.crossing,
			dateText: dateText(plan),
			date: plan.date,
			country: country?.name ?? null,
			countryCode: country?.code ?? null,
			location: plan.location,
			confidence: plan.notes ? 70 : 95,
			notes: plan.notes ?? "",
			problem: null,
			source: "ai",
			reviewed: true,
		});
	}
});

writeFileSync(
	join(OUT, "demo.json"),
	`${JSON.stringify({ passport, photos, stamps }, null, "\t")}\n`,
);

const { csv, rows } = locationsCsv();
writeFileSync(join(OUT, "photo_locations.csv"), csv);

console.log(
	`Wrote ${photos.length} pages, ${stamps.length} stamps, ${rows} location rows to ${OUT}`,
);
