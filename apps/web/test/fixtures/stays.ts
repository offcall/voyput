import {
	type LegacyTrip,
	legacyTripStays,
	mergeKept,
	type TravelStay,
} from "@voyput/core";
import type { VoyputDb } from "../../src/db/db";

/** Trips in the old shape, for tests that think in trips. */
export type TestTrip = LegacyTrip;
export type TestStop = LegacyTrip["stops"][number];
export type TestBoundary = LegacyTrip["arrival"];

/** Home from birth until now, with nothing behind it. */
const always = (home: string): TravelStay => ({
	id: "home",
	countryCode: home,
	place: "",
	kind: "stay",
	arrival: { date: null, source: "estimated", method: "unknown" },
	departure: { date: null, source: "estimated", method: "unknown" },
	stampIds: [],
	photoIds: [],
	approved: false,
});

/**
 * The stays of these trips with home before and between them, as the
 * migration stores them. The history ends with the last return, so no stay
 * runs until today and tests do not depend on the clock.
 */
export function tripsAsStays(
	trips: readonly LegacyTrip[],
	home: string,
): TravelStay[] {
	const stays = mergeKept(
		[always(home)],
		trips.flatMap((t) => legacyTripStays(t)),
	);
	const last = stays.at(-1);
	return last?.departure.date === null && trips.length > 0
		? stays.slice(0, -1)
		: stays;
}

/** Stores trips as a history of stays and picks `home`. */
export async function seedTrips(
	db: VoyputDb,
	trips: readonly LegacyTrip[],
	home: string,
): Promise<void> {
	await db.stays.bulkPut(tripsAsStays(trips, home));
	await db.kv.put({ key: "trips:home", value: home });
}
