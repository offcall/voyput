import {
	type Passport,
	type PassportPhoto,
	type PhotoExtraction,
	parseLocationCsv,
	type Stamp,
} from "@voyput/core";
import type { VoyputDb } from "../../db/db";

/** Reads one file of `public/demo` by name; the app fetches it, tests read it from disk. */
export type FetchFile = (name: string) => Promise<Blob>;

export const DEMO_PASSPORT_ID = "demo-passport";
/** Every uuid in the demo CSV starts with this, so reloading replaces only demo rows. */
export const DEMO_LOCATION_PREFIX = "demo-";
const MANIFEST = "demo.json";
const LOCATIONS = "photo_locations.csv";

interface DemoManifest {
	passport: Passport;
	photos: PassportPhoto[];
	stamps: Stamp[];
}

export interface DemoSummary {
	photos: number;
	stamps: number;
	locations: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasStrings(value: unknown, keys: string[]): boolean {
	return isRecord(value) && keys.every((key) => typeof value[key] === "string");
}

/** Checks the parts loading relies on; the file is ours, so a full schema check is overkill. */
function parseManifest(value: unknown): DemoManifest {
	if (
		!isRecord(value) ||
		!hasStrings(value.passport, ["id", "name", "createdAt"]) ||
		!isRecord(value.passport) ||
		value.passport.id !== DEMO_PASSPORT_ID ||
		!Array.isArray(value.photos) ||
		!value.photos.every((p) => hasStrings(p, ["id", "name", "mimeType"])) ||
		!Array.isArray(value.stamps) ||
		!value.stamps.every((s) => hasStrings(s, ["id", "photoId", "dateText"]))
	) {
		throw new Error(`${MANIFEST} is not valid demo data`);
	}
	return value as unknown as DemoManifest;
}

/**
 * Stores the demo passport, its pages, the ground-truth stamps (as if already
 * extracted) and the demo locations. Earlier demo data is replaced; the
 * user's own passports and locations stay.
 */
export async function loadDemo(
	db: VoyputDb,
	fetchFile: FetchFile,
): Promise<DemoSummary> {
	const manifest = parseManifest(
		JSON.parse(await (await fetchFile(MANIFEST)).text()),
	);
	const csv = parseLocationCsv(await (await fetchFile(LOCATIONS)).text());
	if (!csv.ok) throw new Error(`${LOCATIONS} is not valid demo data`);
	const photos = await Promise.all(
		manifest.photos.map(async (photo) => ({
			...photo,
			blob: new Blob([await fetchFile(photo.name)], { type: photo.mimeType }),
		})),
	);
	const extractions: PhotoExtraction[] = manifest.photos.map((photo) => {
		const count = manifest.stamps.filter((s) => s.photoId === photo.id).length;
		return {
			photoId: photo.id,
			status: "ok",
			notes: count
				? `Demo page with ${count} stamps.`
				: "Demo page without stamps.",
			model: "demo",
			seconds: 0,
			finishedAt: manifest.passport.createdAt,
		};
	});

	await db.transaction(
		"rw",
		[db.passports, db.photos, db.extractions, db.stamps, db.locations],
		async () => {
			const oldPhotoIds = await db.photos
				.where("passportId")
				.equals(DEMO_PASSPORT_ID)
				.primaryKeys();
			await db.extractions.bulkDelete(oldPhotoIds);
			await db.photos.bulkDelete(oldPhotoIds);
			await db.stamps.where("passportId").equals(DEMO_PASSPORT_ID).delete();
			await db.locations
				.where("uuid")
				.startsWith(DEMO_LOCATION_PREFIX)
				.delete();

			await db.passports.put(manifest.passport);
			await db.photos.bulkPut(photos);
			await db.extractions.bulkPut(extractions);
			await db.stamps.bulkPut(manifest.stamps);
			await db.locations.bulkPut(csv.rows);
		},
	);
	return {
		photos: photos.length,
		stamps: manifest.stamps.length,
		locations: csv.rows.length,
	};
}
