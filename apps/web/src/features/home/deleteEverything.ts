import type { VoyputDb } from "../../db/db";
import { runsFor } from "../extract/runs";

/**
 * Clears every table of this browser's database in one transaction: passports,
 * photos, extractions, stamps, photo locations, stays and the small kv values
 * (sources choice, birth date). Settings and the theme live in localStorage and stay.
 * Extraction runs are cancelled first, so no queued photo is sent afterwards.
 */
export async function deleteEverything(db: VoyputDb): Promise<void> {
	runsFor(db).cancel();
	await db.transaction("rw", db.tables, () =>
		Promise.all(db.tables.map((table) => table.clear())),
	);
}
