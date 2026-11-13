import {
	isCountryCode,
	type LocationRow,
	type Period,
	type Stamp,
	type Trip,
} from "@voyput/core";
import type { VoyputDb } from "../../db/db";

const DISMISSED_KEY = "trips:dismissed";
/** `db.kv` key of the home country the user picked. */
export const HOME_KEY = "trips:home";

export interface TripsData {
	stamps: Stamp[];
	locations: LocationRow[];
	stored: Trip[];
	/** Periods of trips the user deleted; suggestions there stay hidden. */
	dismissed: Period[];
	/** Home country chosen by the user, or null (also when invalid) to guess it. */
	home: string | null;
}

const isPeriod = (v: unknown): v is Period =>
	typeof v === "object" &&
	v !== null &&
	"start" in v &&
	"end" in v &&
	typeof v.start === "string" &&
	typeof v.end === "string";

const periodList = (value: unknown): Period[] =>
	Array.isArray(value) ? value.filter(isPeriod) : [];

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
		dismissed: periodList(dismissed?.value),
		home: isCountryCode(home?.value) ? home.value : null,
	};
}

export async function saveTrip(db: VoyputDb, trip: Trip): Promise<void> {
	await db.trips.put(trip);
}

/** Removes a trip and keeps suggestions in its period from coming back. */
export async function deleteTrip(db: VoyputDb, trip: Trip): Promise<void> {
	await db.transaction("rw", db.trips, db.kv, async () => {
		await db.trips.delete(trip.id);
		const dismissed = periodList((await db.kv.get(DISMISSED_KEY))?.value);
		await db.kv.put({
			key: DISMISSED_KEY,
			value: [...dismissed, { start: trip.start, end: trip.end }],
		});
	});
}

export async function saveHome(db: VoyputDb, home: string): Promise<void> {
	await db.kv.put({ key: HOME_KEY, value: home });
}
