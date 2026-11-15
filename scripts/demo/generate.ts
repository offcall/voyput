/**
 * Writes the demo data into apps/web/public/demo:
 * passport page PNGs, ground-truth stamps (demo.json) and photo_locations.csv.
 *
 * Run from the repo root: `npm run demo:generate`.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import type { Passport, PassportPhoto, Stamp } from "@voyput/core";
import { dateText, pageSvg, postOf } from "./draw.ts";
import { layout, paginate } from "./layout.ts";
import { locationsCsv } from "./locations.ts";
import { encodeRgbPng } from "./png.ts";
import { photoCheck } from "./review.ts";
import { COUNTRIES, PASSPORT, TRIPS } from "./scenario.ts";

const OUT = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../apps/web/public/demo",
);

/** Fixed, so regenerating gives the same files. */
const CREATED_AT = "2026-11-12T00:00:00.000Z";
const PASSPORT_ID = "demo-passport";
/** Printed number of the first visa page. */
const FIRST_PAGE = 6;

mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT))
	if (/^page-\d+\.png$/.test(name)) rmSync(join(OUT, name));

const passport: Passport = {
	id: PASSPORT_ID,
	name: "Demo passport",
	validFrom: PASSPORT.validFrom,
	validTo: PASSPORT.validTo,
	createdAt: CREATED_AT,
};

const { csv, rows } = locationsCsv();
writeFileSync(join(OUT, "photo_locations.csv"), csv);
const warns = photoCheck(rows);

const photos: PassportPhoto[] = [];
const stamps: Stamp[] = [];
const pages = paginate(TRIPS.flatMap((trip) => trip.stamps));

pages.forEach((pageStamps, i) => {
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
	const image = new Resvg(pageSvg(layout(pageStamps, i), FIRST_PAGE + i), {
		font: { loadSystemFonts: true },
	}).render();
	writeFileSync(
		join(OUT, name),
		encodeRgbPng(image.pixels, image.width, image.height),
	);

	for (const plan of pageStamps) {
		const post = postOf(plan);
		const country = COUNTRIES[post.country];
		const read = plan.read;
		const stamp: Stamp = {
			id: `demo-stamp-${String(stamps.length + 1).padStart(2, "0")}`,
			passportId: PASSPORT_ID,
			photoId: photo.id,
			direction: read?.direction ?? plan.direction,
			borderCrossing: post.crossing,
			dateText: read?.dateText ?? dateText(plan),
			date: read?.date ?? plan.date,
			country: country?.name ?? null,
			countryCode: country?.code ?? null,
			location: read?.location === null ? null : post.location,
			confidence: read?.confidence ?? (plan.faint ? 82 : 95),
			notes: read?.notes ?? (plan.faint ? "Faint ink." : ""),
			problem: null,
			source: "ai",
			reviewed: read?.reviewed ?? true,
		};
		// The traveller already marked the usual travel-day warnings as fine;
		// only the planted problems stay open.
		const warning = warns(stamp);
		const planted = Boolean(plan.keepWarning || read?.date);
		if (planted && !warning)
			throw new Error(`${stamp.id} should show a photo location warning`);
		if (warning && !planted) stamp.dismissed = { icloudCheck: true };
		stamps.push(stamp);
	}
});

writeFileSync(
	join(OUT, "demo.json"),
	`${JSON.stringify({ passport, photos, stamps }, null, "\t")}\n`,
);

console.log(
	`Wrote ${photos.length} pages, ${stamps.length} stamps, ${rows.length} location rows to ${OUT}`,
);
