import type { VoyputDb } from "../db/db";

/** `db.kv` key set once Visualize is opened while saved trips exist; ticks the last plan step. */
export const VISUALIZED_KEY = "plan:visualized";

/** Marks the Visualize step done, if there are saved trips to look at. */
export async function markVisualized(db: VoyputDb): Promise<void> {
	await db.transaction("rw", db.trips, db.kv, async () => {
		if ((await db.kv.get(VISUALIZED_KEY))?.value === true) return;
		if ((await db.trips.count()) === 0) return;
		await db.kv.put({ key: VISUALIZED_KEY, value: true });
	});
}
