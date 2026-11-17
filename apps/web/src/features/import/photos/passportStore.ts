import {
	type Passport,
	type PassportPhoto,
	photoMimeType,
	rotateBy,
} from "@voyput/core";
import type { PhotoRecord, VoyputDb } from "../../../db/db";
import { staysAfterEvidenceChange } from "../../trips/evidenceChange";

export interface PassportInput {
	name: string;
	validFrom: string | null;
	validTo: string | null;
}

export async function listPassports(db: VoyputDb): Promise<Passport[]> {
	const passports = await db.passports.toArray();
	return passports.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createPassport(
	db: VoyputDb,
	input: PassportInput,
): Promise<Passport> {
	const passport: Passport = {
		id: crypto.randomUUID(),
		...input,
		createdAt: new Date().toISOString(),
	};
	await db.passports.add(passport);
	return passport;
}

export async function updatePassport(
	db: VoyputDb,
	id: string,
	input: PassportInput,
): Promise<void> {
	await db.passports.update(id, { ...input });
}

/** Removes the passport with its photos, their extractions and stamps; marks the stays built on them. */
export async function deletePassport(db: VoyputDb, id: string): Promise<void> {
	await db.transaction(
		"rw",
		[db.passports, db.photos, db.extractions, db.stamps, db.stays],
		async () => {
			const photoIds = await db.photos
				.where("passportId")
				.equals(id)
				.primaryKeys();
			await db.extractions.bulkDelete(photoIds);
			await removeStamps(db, "passportId", id);
			await db.photos.bulkDelete(photoIds);
			await db.passports.delete(id);
		},
	);
}

/** What the extraction made of a photo, shown on its tile. */
export type PhotoStatus =
	| { kind: "new" }
	| { kind: "ok"; stamps: number }
	| { kind: "failed" };

/** Extraction result of each photo of a passport, by photo id; photos never extracted are "new". */
export async function listPhotoStatuses(
	db: VoyputDb,
	passportId: string,
): Promise<Map<string, PhotoStatus>> {
	const ids = await db.photos
		.where("passportId")
		.equals(passportId)
		.primaryKeys();
	const [extractions, stamps] = await Promise.all([
		db.extractions.bulkGet(ids),
		db.stamps.where("passportId").equals(passportId).toArray(),
	]);
	const stampCount = new Map<string, number>();
	for (const stamp of stamps)
		stampCount.set(stamp.photoId, (stampCount.get(stamp.photoId) ?? 0) + 1);
	return new Map(
		ids.map((id, index): [string, PhotoStatus] => {
			const status = extractions[index]?.status;
			return [
				id,
				status === "ok"
					? { kind: "ok", stamps: stampCount.get(id) ?? 0 }
					: status === "failed"
						? { kind: "failed" }
						: { kind: "new" },
			];
		}),
	);
}

/** Photos of one passport in the order they were added. */
export async function listPhotos(
	db: VoyputDb,
	passportId: string,
): Promise<PhotoRecord[]> {
	const photos = await db.photos
		.where("passportId")
		.equals(passportId)
		.toArray();
	return photos.sort(
		(a, b) =>
			a.addedAt.localeCompare(b.addedAt) ||
			a.name.localeCompare(b.name, undefined, { numeric: true }),
	);
}

export interface AddPhotosResult {
	/** Names of files that are not JPEG or PNG. */
	rejected: string[];
	/** Names of files this passport already has (same name and size). */
	duplicates: string[];
}

/** Stores the new JPEG/PNG files and reports the ones it skipped. */
export async function addPhotos(
	db: VoyputDb,
	passportId: string,
	files: File[],
): Promise<AddPhotosResult> {
	const result: AddPhotosResult = { rejected: [], duplicates: [] };
	const records: PhotoRecord[] = [];
	const addedAt = new Date().toISOString();
	const fileKey = (name: string, size: number | undefined) => `${size}:${name}`;
	const known = new Set(
		(await db.photos.where("passportId").equals(passportId).toArray()).map(
			(photo) => fileKey(photo.name, photo.size),
		),
	);
	for (const file of files) {
		const mimeType = photoMimeType(file);
		if (!mimeType) {
			result.rejected.push(file.name);
			continue;
		}
		const key = fileKey(file.name, file.size);
		if (known.has(key)) {
			result.duplicates.push(file.name);
			continue;
		}
		known.add(key);
		const photo: PassportPhoto = {
			id: crypto.randomUUID(),
			passportId,
			name: file.name,
			mimeType,
			rotation: 0,
			size: file.size,
			addedAt,
		};
		records.push({ ...photo, blob: file });
	}
	await db.photos.bulkAdd(records);
	return result;
}

/** Turns the photo 90° clockwise from its stored rotation, so quick repeated clicks add up. */
export async function rotatePhoto(db: VoyputDb, id: string): Promise<void> {
	await db.photos.where({ id }).modify((photo) => {
		photo.rotation = rotateBy(photo.rotation, 90);
	});
}

/** A storage error as a sentence for the user. */
export function storageErrorMessage(action: string, error: unknown): string {
	return `Could not ${action}: ${error instanceof Error ? error.message : String(error)}`;
}

/** Deletes the stamps and marks the stays built on them. */
async function removeStamps(
	db: VoyputDb,
	by: "passportId" | "photoId",
	id: string,
): Promise<void> {
	const ids = await db.stamps.where(by).equals(id).primaryKeys();
	await db.stamps.bulkDelete(ids);
	await staysAfterEvidenceChange(db, { removedStamps: new Set(ids) });
}

/** Removes the photo with its extraction and stamps; marks the stays built on them. */
export async function deletePhoto(db: VoyputDb, id: string): Promise<void> {
	await db.transaction(
		"rw",
		[db.photos, db.extractions, db.stamps, db.stays],
		async () => {
			await db.extractions.delete(id);
			await removeStamps(db, "photoId", id);
			await db.photos.delete(id);
		},
	);
}
