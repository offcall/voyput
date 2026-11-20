import {
	type LocationRow,
	mergeLocations,
	summarizeLocations,
} from "@voyput/core";
import { staysAfterEvidenceChange } from "../../../data/evidenceChange";
import { DEMO_LOCATION_PREFIX } from "../../../data/locations";
import type { VoyputDb } from "../../../db/db";

/** `db.kv` key of the imported location files (ADR 0050). */
export const LOCATION_FILES_KEY = "import:locationFiles";

/** One imported CSV and the stored rows it brought or matched. */
export interface LocationFile {
	id: string;
	name: string;
	/** Valid rows in the file. */
	rows: number;
	firstDay: string | null;
	lastDay: string | null;
	/** ISO date-time; null for rows imported before files were listed. */
	importedAt: string | null;
	/** Stored uuids of the file's rows, new or already there. */
	uuids: string[];
}

const isDay = (value: unknown): value is string | null =>
	value === null || typeof value === "string";

function isLocationFile(value: unknown): value is LocationFile {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		typeof v.name === "string" &&
		typeof v.rows === "number" &&
		isDay(v.firstDay) &&
		isDay(v.lastDay) &&
		isDay(v.importedAt) &&
		Array.isArray(v.uuids) &&
		v.uuids.every((uuid) => typeof uuid === "string")
	);
}

/** The stored file list; entries that do not read as one are left out. */
export async function readLocationFiles(db: VoyputDb): Promise<LocationFile[]> {
	const value = (await db.kv.get(LOCATION_FILES_KEY))?.value;
	return Array.isArray(value) ? value.filter(isLocationFile) : [];
}

const saveFiles = (db: VoyputDb, files: LocationFile[]) =>
	db.kv.put({ key: LOCATION_FILES_KEY, value: files });

/** A list entry for these rows. */
export function locationFile(
	name: string,
	rows: readonly LocationRow[],
	uuids: Iterable<string>,
	importedAt: string | null,
	id: string = crypto.randomUUID(),
): LocationFile {
	const { firstDay, lastDay } = summarizeLocations(rows);
	return {
		id,
		name,
		rows: rows.length,
		firstDay,
		lastDay,
		importedAt,
		uuids: [...new Set(uuids)],
	};
}

/** Lists the file as the only one: Replace keeps just its rows. */
export const listOnlyFile = (db: VoyputDb, file: LocationFile) =>
	saveFiles(db, [file]);

export interface AddResult {
	added: number;
	duplicates: number;
	total: number;
	files: number;
}

/**
 * Adds the rows that are not stored yet (core `mergeLocations`) and lists
 * the file. Rows stored before files were listed get an entry of their own,
 * demo rows none. Adding marks no stays: no stored photo changes or goes.
 */
export async function addLocationFile(
	db: VoyputDb,
	name: string,
	rows: readonly LocationRow[],
	importedAt: string,
): Promise<AddResult> {
	return db.transaction("rw", db.locations, db.kv, async () => {
		const stored = await db.locations.toArray();
		const files = await readLocationFiles(db);
		if (files.length === 0) {
			const earlier = stored.filter(
				(row) => !row.uuid.startsWith(DEMO_LOCATION_PREFIX),
			);
			if (earlier.length > 0)
				files.push(
					locationFile(
						"Imported before",
						earlier,
						earlier.map((row) => row.uuid),
						null,
					),
				);
		}
		const merge = mergeLocations(stored, rows);
		await db.locations.bulkPut(merge.added);
		files.push(locationFile(name, rows, merge.uuids, importedAt));
		await saveFiles(db, files);
		return {
			added: merge.added.length,
			duplicates: merge.duplicates,
			total: stored.length + merge.added.length,
			files: files.length,
		};
	});
}

/**
 * Deletes the rows only this file brought, keeps those another listed file
 * also has, and marks the stays that lose photos.
 */
export async function removeLocationFile(db: VoyputDb, id: string) {
	await db.transaction(
		"rw",
		[db.locations, db.kv, db.stays, db.stamps],
		async () => {
			const files = await readLocationFiles(db);
			const file = files.find((f) => f.id === id);
			if (!file) return;
			const rest = files.filter((f) => f !== file);
			const kept = new Set(rest.flatMap((f) => f.uuids));
			const removed = file.uuids.filter((uuid) => !kept.has(uuid));
			await db.locations.bulkDelete(removed);
			await saveFiles(db, rest);
			if (removed.length > 0)
				await staysAfterEvidenceChange(db, {
					removedPhotos: new Set(removed),
				});
		},
	);
}

const count = (n: number, one: string, many: string) =>
	`${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/** "Added 1,234 new photo locations, 56 were already there. Total 9,876 from 2 files." */
export function addResultText({
	added,
	duplicates,
	total,
	files,
}: AddResult): string {
	return `Added ${count(added, "new photo location", "new photo locations")}, ${count(duplicates, "was", "were")} already there. Total ${total.toLocaleString("en")} from ${count(files, "file", "files")}.`;
}
