import type { LocationRow, Stamp, Trip } from "@voyput/core";
import type { VoyputDb } from "../../db/db";

const DISMISSED_KEY = "trips:dismissed";
const HOME_KEY = "trips:home";

export interface TripsData {
	stamps: Stamp[];
	locations: LocationRow[];
	stored: Trip[];
	/** Ids of suggestions the user deleted. */
	dismissed: string[];
	/** Home country chosen by the user, or null to guess it. */
	home: string | null;
}

const stringList = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];

export async function loadTripsData(db: VoyputDb): Promise<TripsData> {
	const [stamps, locations, stored, dismissed, home] = await Promise.all([
		db.stamps.toArray(),
		db.locations.toArray(),
		db.trips.toArray(),
		db.kv.get(DISMISSED_KEY),
		db.kv.get(HOME_KEY),
	]);
	return {
		stamps,
		locations,
		stored,
		dismissed: stringList(dismissed?.value),
		home: typeof home?.value === "string" ? home.value : null,
	};
}

export async function saveTrip(db: VoyputDb, trip: Trip): Promise<void> {
	await db.trips.put(trip);
}

/** Removes a stored trip and keeps a deleted suggestion from coming back. */
export async function deleteTrip(db: VoyputDb, id: string): Promise<void> {
	await db.transaction("rw", db.trips, db.kv, async () => {
		await db.trips.delete(id);
		const dismissed = stringList((await db.kv.get(DISMISSED_KEY))?.value);
		if (!dismissed.includes(id))
			await db.kv.put({ key: DISMISSED_KEY, value: [...dismissed, id] });
	});
}

export async function saveHome(db: VoyputDb, home: string): Promise<void> {
	await db.kv.put({ key: HOME_KEY, value: home });
}
