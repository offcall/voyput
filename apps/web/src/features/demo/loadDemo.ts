import {
	type LocationRow,
	type LocationSummary,
	type Passport,
	type PassportPhoto,
	type PhotoExtraction,
	parseLocationCsv,
	type Stamp,
	summarizeLocations,
} from "@voyput/core";
import type { VoyputDb } from "../../db/db";

/** Reads one file of `public/demo` by name; the app fetches it, tests read it from disk. */
export type FetchFile = (name: string) => Promise<Blob>;

export const DEMO_PASSPORT_ID = "demo-passport";
/** Demo rows carry these id prefixes; only such rows are ever replaced or removed. */
const DEMO_PHOTO_PREFIX = "demo-photo-";
const DEMO_STAMP_PREFIX = "demo-stamp-";
/** uuid prefix of the demo locations. */
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
	/** Period and countries of the demo locations. */
	locationSummary: LocationSummary;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_RE = /^page-\d+\.png$/;
const DIRECTIONS: readonly unknown[] = ["entry", "exit", "unknown"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isDemoPhoto(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		value.id.startsWith(DEMO_PHOTO_PREFIX) &&
		value.passportId === DEMO_PASSPORT_ID &&
		typeof value.name === "string" &&
		PAGE_RE.test(value.name) &&
		value.mimeType === "image/png"
	);
}

function isDemoStamp(value: unknown, photoIds: Set<unknown>): boolean {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		value.id.startsWith(DEMO_STAMP_PREFIX) &&
		value.passportId === DEMO_PASSPORT_ID &&
		photoIds.has(value.photoId) &&
		typeof value.dateText === "string" &&
		typeof value.date === "string" &&
		DAY_RE.test(value.date) &&
		DIRECTIONS.includes(value.direction) &&
		typeof value.countryCode === "string" &&
		/^[A-Z]{2}$/.test(value.countryCode)
	);
}

/** Every row must carry a demo id, so a broken file can never overwrite the user's rows. */
function parseManifest(value: unknown): DemoManifest {
	const invalid = new Error(`${MANIFEST} is not valid demo data`);
	if (
		!isRecord(value) ||
		!isRecord(value.passport) ||
		value.passport.id !== DEMO_PASSPORT_ID ||
		typeof value.passport.name !== "string" ||
		typeof value.passport.createdAt !== "string" ||
		!Array.isArray(value.photos) ||
		!value.photos.every(isDemoPhoto) ||
		!Array.isArray(value.stamps)
	) {
		throw invalid;
	}
	const photoIds = new Set<unknown>(
		value.photos.map((p: unknown) => (isRecord(p) ? p.id : null)),
	);
	if (!value.stamps.every((s) => isDemoStamp(s, photoIds))) throw invalid;
	return value as unknown as DemoManifest;
}

function parseLocations(text: string): LocationRow[] {
	const csv = parseLocationCsv(text);
	if (
		!csv.ok ||
		!csv.rows.every((row) => row.uuid.startsWith(DEMO_LOCATION_PREFIX))
	) {
		throw new Error(`${LOCATIONS} is not valid demo data`);
	}
	return csv.rows;
}

/** Deletes demo rows by their ids, and trips built on demo stamps. Call inside a transaction. */
async function deleteDemoRows(db: VoyputDb): Promise<void> {
	const photoIds = await db.photos
		.where("id")
		.startsWith(DEMO_PHOTO_PREFIX)
		.primaryKeys();
	await db.extractions.bulkDelete(photoIds);
	await db.photos.bulkDelete(photoIds);
	await db.stamps.where("id").startsWith(DEMO_STAMP_PREFIX).delete();
	await db.locations.where("uuid").startsWith(DEMO_LOCATION_PREFIX).delete();
	await db.trips
		.filter((trip) =>
			trip.stampIds.some((id) => id.startsWith(DEMO_STAMP_PREFIX)),
		)
		.delete();
}

function demoTables(db: VoyputDb) {
	return [
		db.passports,
		db.photos,
		db.extractions,
		db.stamps,
		db.locations,
		db.trips,
	];
}

export async function hasDemoData(db: VoyputDb): Promise<boolean> {
	return (await db.passports.get(DEMO_PASSPORT_ID)) !== undefined;
}

/**
 * Stores the demo passport, its pages, the ground-truth stamps (reviewed, as
 * if already extracted) and the demo locations. Earlier demo rows are
 * replaced; the user's own rows stay, including photos they added to the
 * demo passport.
 */
export async function loadDemo(
	db: VoyputDb,
	fetchFile: FetchFile,
): Promise<DemoSummary> {
	const manifest = parseManifest(
		JSON.parse(await (await fetchFile(MANIFEST)).text()),
	);
	const locations = parseLocations(await (await fetchFile(LOCATIONS)).text());
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

	await db.transaction("rw", demoTables(db), async () => {
		await deleteDemoRows(db);
		await db.passports.put(manifest.passport);
		await db.photos.bulkPut(photos);
		await db.extractions.bulkPut(extractions);
		await db.stamps.bulkPut(manifest.stamps);
		await db.locations.bulkPut(locations);
	});
	return {
		photos: photos.length,
		stamps: manifest.stamps.length,
		locations: locations.length,
		locationSummary: summarizeLocations(locations),
	};
}

/**
 * Removes the demo rows and trips built on demo stamps. The demo passport
 * goes too, unless the user added their own photos to it.
 */
export async function removeDemo(db: VoyputDb): Promise<void> {
	await db.transaction("rw", demoTables(db), async () => {
		await deleteDemoRows(db);
		const ownPhotos = await db.photos
			.where("passportId")
			.equals(DEMO_PASSPORT_ID)
			.count();
		if (ownPhotos === 0) await db.passports.delete(DEMO_PASSPORT_ID);
	});
}
