import {
	type Passport,
	type PassportPhoto,
	photoMimeType,
	type Rotation,
	rotateBy,
} from "@voyput/core";
import type { PhotoRecord, VoyputDb } from "../../../db/db";

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

/** Removes the passport with its photos, their extractions and stamps. */
export async function deletePassport(db: VoyputDb, id: string): Promise<void> {
	await db.transaction(
		"rw",
		[db.passports, db.photos, db.extractions, db.stamps],
		async () => {
			const photoIds = await db.photos
				.where("passportId")
				.equals(id)
				.primaryKeys();
			await db.extractions.bulkDelete(photoIds);
			await db.stamps.where("passportId").equals(id).delete();
			await db.photos.bulkDelete(photoIds);
			await db.passports.delete(id);
		},
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
			a.addedAt.localeCompare(b.addedAt) || a.name.localeCompare(b.name),
	);
}

/** Stores the JPEG/PNG files and returns the names of the files it rejected. */
export async function addPhotos(
	db: VoyputDb,
	passportId: string,
	files: File[],
): Promise<string[]> {
	const rejected: string[] = [];
	const records: PhotoRecord[] = [];
	const addedAt = new Date().toISOString();
	for (const file of files) {
		const mimeType = photoMimeType(file);
		if (!mimeType) {
			rejected.push(file.name);
			continue;
		}
		const photo: PassportPhoto = {
			id: crypto.randomUUID(),
			passportId,
			name: file.name,
			mimeType,
			rotation: 0,
			addedAt,
		};
		records.push({ ...photo, blob: file });
	}
	await db.photos.bulkAdd(records);
	return rejected;
}

export async function rotatePhoto(
	db: VoyputDb,
	id: string,
	current: Rotation,
): Promise<void> {
	await db.photos.update(id, { rotation: rotateBy(current, 90) });
}

/** Removes the photo with its extraction and stamps. */
export async function deletePhoto(db: VoyputDb, id: string): Promise<void> {
	await db.transaction(
		"rw",
		[db.photos, db.extractions, db.stamps],
		async () => {
			await db.extractions.delete(id);
			await db.stamps.where("photoId").equals(id).delete();
			await db.photos.delete(id);
		},
	);
}
