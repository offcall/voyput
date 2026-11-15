import type { VoyputDb } from "../../db/db";

/**
 * Clears every table of this browser's database in one transaction: passports,
 * photos, extractions, stamps, photo locations, stays and the small kv values
 * (sources choice, birth date). Settings and the theme live in localStorage and stay.
 */
export async function deleteEverything(db: VoyputDb): Promise<void> {
	await db.transaction("rw", db.tables, () =>
		Promise.all(db.tables.map((table) => table.clear())),
	);
}
