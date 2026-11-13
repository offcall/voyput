import {
	type LocationRow,
	type LocationSummary,
	type Passport,
	type PassportPhoto,
	type PhotoExtraction,
	parseLocationCsv,
	type Stamp,
	sortStays,
	summarizeLocations,
	withoutEvidence,
} from "@voyput/core";
import type { VoyputDb } from "../../db/db";

/** Reads one file of `public/demo` by name; the app fetches it, tests read it from disk. */
export type FetchFile = (name: string) => Promise<Blob>;

export const DEMO_PASSPORT_ID = "demo-passport";
/** Real stamp pages from Wikimedia Commons, pre-read by a model and left unreviewed. */
export const DEMO_SAMPLES_ID = "demo-samples";
/** Demo rows carry these id prefixes; only such rows are ever replaced or removed. */
const DEMO_PHOTO_PREFIX = "demo-photo-";
const DEMO_STAMP_PREFIX = "demo-stamp-";
/** uuid prefix of the demo locations. */
export const DEMO_LOCATION_PREFIX = "demo-";
const MANIFEST = "demo.json";
const SAMPLES = "samples.json";
const LOCATIONS = "photo_locations.csv";

interface DemoManifest {
	passport: Passport;
	photos: PassportPhoto[];
	stamps: Stamp[];
}

/** The sample passport also stores what the model wrote about each page. */
interface SamplesManifest extends DemoManifest {
	model: string;
	extractions: { photoId: string; notes: string; seconds: number }[];
}

export interface DemoSummary {
	photos: number;
	stamps: number;
	locations: number;
	/** The Commons sample pages and their unreviewed stamps. */
	samples: { pages: number; stamps: number };
	/** Period and countries of the demo locations. */
	locationSummary: LocationSummary;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_RE = /^page-\d+\.png$/;
const SAMPLE_RE = /^sample-\d+\.jpg$/;
const DIRECTIONS: readonly unknown[] = ["entry", "exit", "unknown"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** How the photos of one demo passport look. */
interface PhotoKind {
	passportId: string;
	name: RegExp;
	mimeType: string;
}
const DEMO_PAGES: PhotoKind = {
	passportId: DEMO_PASSPORT_ID,
	name: PAGE_RE,
	mimeType: "image/png",
};
const SAMPLE_PAGES: PhotoKind = {
	passportId: DEMO_SAMPLES_ID,
	name: SAMPLE_RE,
	mimeType: "image/jpeg",
};

function isDemoPhoto(value: unknown, kind: PhotoKind): boolean {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		value.id.startsWith(DEMO_PHOTO_PREFIX) &&
		value.passportId === kind.passportId &&
		typeof value.name === "string" &&
		kind.name.test(value.name) &&
		value.mimeType === kind.mimeType
	);
}

/** Demo stamps have a full date and country; sample stamps are model output and may lack them. */
function isDemoStamp(
	value: unknown,
	passportId: string,
	photoIds: Set<unknown>,
	complete: boolean,
): boolean {
	if (!isRecord(value)) return false;
	const date = value.date;
	const code = value.countryCode;
	return (
		typeof value.id === "string" &&
		value.id.startsWith(DEMO_STAMP_PREFIX) &&
		value.passportId === passportId &&
		photoIds.has(value.photoId) &&
		typeof value.dateText === "string" &&
		(typeof date === "string"
			? DAY_RE.test(date)
			: !complete && date === null) &&
		DIRECTIONS.includes(value.direction) &&
		(typeof code === "string"
			? /^[A-Z]{2}$/.test(code)
			: !complete && code === null)
	);
}

/** Every row must carry a demo id, so a broken file can never overwrite the user's rows. */
function parsePassportManifest(
	value: unknown,
	kind: PhotoKind,
	file: string,
): DemoManifest {
	const invalid = new Error(`${file} is not valid demo data`);
	if (
		!isRecord(value) ||
		!isRecord(value.passport) ||
		value.passport.id !== kind.passportId ||
		typeof value.passport.name !== "string" ||
		typeof value.passport.createdAt !== "string" ||
		!Array.isArray(value.photos) ||
		!value.photos.every((p) => isDemoPhoto(p, kind)) ||
		!Array.isArray(value.stamps)
	) {
		throw invalid;
	}
	const photoIds = new Set<unknown>(
		value.photos.map((p: unknown) => (isRecord(p) ? p.id : null)),
	);
	const complete = kind === DEMO_PAGES;
	if (
		!value.stamps.every((s) =>
			isDemoStamp(s, kind.passportId, photoIds, complete),
		)
	)
		throw invalid;
	return value as unknown as DemoManifest;
}

const parseManifest = (value: unknown): DemoManifest =>
	parsePassportManifest(value, DEMO_PAGES, MANIFEST);

function parseSamples(value: unknown): SamplesManifest {
	const manifest = parsePassportManifest(value, SAMPLE_PAGES, SAMPLES);
	const photoIds = new Set(manifest.photos.map((p) => p.id));
	const extractions =
		isRecord(value) && Array.isArray(value.extractions)
			? value.extractions
			: null;
	if (
		!isRecord(value) ||
		typeof value.model !== "string" ||
		!extractions?.every(
			(e) =>
				isRecord(e) &&
				photoIds.has(e.photoId as string) &&
				typeof e.notes === "string" &&
				typeof e.seconds === "number",
		)
	) {
		throw new Error(`${SAMPLES} is not valid demo data`);
	}
	return value as unknown as SamplesManifest;
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

/**
 * Deletes demo rows by their ids and every stamp on a demo page (also stamps
 * the user added there by hand or by re-extracting). Stays built only on
 * those stamps or on demo photos go; the user's own stays keep their edits and
 * approvals. Call inside a transaction.
 */
async function deleteDemoRows(db: VoyputDb): Promise<void> {
	const photoIds = await db.photos
		.where("id")
		.startsWith(DEMO_PHOTO_PREFIX)
		.primaryKeys();
	const onDemoPages = new Set(photoIds);
	const stampIds = new Set(
		await db.stamps
			.filter(
				(stamp) =>
					stamp.id.startsWith(DEMO_STAMP_PREFIX) ||
					onDemoPages.has(stamp.photoId),
			)
			.primaryKeys(),
	);
	await db.extractions.bulkDelete(photoIds);
	await db.photos.bulkDelete(photoIds);
	await db.stamps.bulkDelete([...stampIds]);
	await db.locations.where("uuid").startsWith(DEMO_LOCATION_PREFIX).delete();
	// Only demo evidence goes: stays built on it alone, not the user's own (ADR 0010).
	const stays = sortStays(await db.stays.toArray());
	const kept = withoutEvidence(stays, {
		stamp: (id) => stampIds.has(id),
		photo: (id) => id.startsWith(DEMO_LOCATION_PREFIX),
	});
	await db.stays.clear();
	await db.stays.bulkPut(kept);
}

function demoTables(db: VoyputDb) {
	return [
		db.passports,
		db.photos,
		db.extractions,
		db.stamps,
		db.locations,
		db.stays,
	];
}

const DEMO_PASSPORT_IDS = [DEMO_PASSPORT_ID, DEMO_SAMPLES_ID];

export async function hasDemoData(db: VoyputDb): Promise<boolean> {
	return (await db.passports.bulkGet(DEMO_PASSPORT_IDS)).some(Boolean);
}

/** The manifest's photos with their image files. */
const withBlobs = (manifest: DemoManifest, fetchFile: FetchFile) =>
	Promise.all(
		manifest.photos.map(async (photo) => ({
			...photo,
			blob: new Blob([await fetchFile(photo.name)], { type: photo.mimeType }),
		})),
	);

/**
 * Stores the demo passport, its pages, the ground-truth stamps (reviewed, as
 * if already extracted), the sample passport with its model-read stamps
 * (unreviewed, so they never feed trips until the user reviews them) and the
 * demo locations. Earlier demo rows are replaced; the user's own rows stay,
 * including photos they added to a demo passport.
 */
export async function loadDemo(
	db: VoyputDb,
	fetchFile: FetchFile,
): Promise<DemoSummary> {
	const manifest = parseManifest(
		JSON.parse(await (await fetchFile(MANIFEST)).text()),
	);
	const samples = parseSamples(
		JSON.parse(await (await fetchFile(SAMPLES)).text()),
	);
	const locations = parseLocations(await (await fetchFile(LOCATIONS)).text());
	const photos = [
		...(await withBlobs(manifest, fetchFile)),
		...(await withBlobs(samples, fetchFile)),
	];
	const extractions: PhotoExtraction[] = [
		...manifest.photos.map((photo): PhotoExtraction => {
			const count = manifest.stamps.filter(
				(s) => s.photoId === photo.id,
			).length;
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
		}),
		...samples.extractions.map(
			(e): PhotoExtraction => ({
				...e,
				status: "ok",
				model: samples.model,
				finishedAt: samples.passport.createdAt,
			}),
		),
	];

	await db.transaction("rw", demoTables(db), async () => {
		await deleteDemoRows(db);
		await db.passports.bulkPut([manifest.passport, samples.passport]);
		await db.photos.bulkPut(photos);
		await db.extractions.bulkPut(extractions);
		await db.stamps.bulkPut([...manifest.stamps, ...samples.stamps]);
		await db.locations.bulkPut(locations);
	});
	return {
		photos: manifest.photos.length,
		stamps: manifest.stamps.length,
		locations: locations.length,
		samples: { pages: samples.photos.length, stamps: samples.stamps.length },
		locationSummary: summarizeLocations(locations),
	};
}

/**
 * Removes the demo rows and a history built on them. Each demo passport
 * goes too, unless the user added their own photos to it.
 */
export async function removeDemo(db: VoyputDb): Promise<void> {
	await db.transaction("rw", demoTables(db), async () => {
		await deleteDemoRows(db);
		for (const id of DEMO_PASSPORT_IDS) {
			const ownPhotos = await db.photos.where("passportId").equals(id).count();
			if (ownPhotos === 0) await db.passports.delete(id);
		}
	});
}
