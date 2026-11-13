import {
	guessHomeCountry,
	homeAfterTrips,
	isCountryCode,
	type LegacyTrip,
	type LocationRow,
	legacyTripCountry,
	legacyTripStays,
	type Passport,
	type PassportPhoto,
	type PhotoExtraction,
	periodsOf,
	type Stamp,
	suggestHistory,
	type TravelStay,
	usableStamps,
} from "@voyput/core";
import Dexie, { type Table, type Transaction } from "dexie";

export interface PhotoRecord extends PassportPhoto {
	blob: Blob;
}

/** Small values that are not worth their own table, e.g. UI state of a section. */
export interface KvRecord {
	key: string;
	value: unknown;
}

/** Everything the user brings and edits lives here, in their browser. */
export class VoyputDb extends Dexie {
	declare passports: Table<Passport, string>;
	declare photos: Table<PhotoRecord, string>;
	declare extractions: Table<PhotoExtraction, string>;
	declare stamps: Table<Stamp, string>;
	/** Keyed by the export's photo uuid, so re-importing a CSV never duplicates rows. */
	declare locations: Table<LocationRow, string>;
	/** The travel history, one stay per row; the Trips step orders them by date. */
	declare stays: Table<TravelStay, string>;
	declare kv: Table<KvRecord, string>;

	constructor(name = "voyput") {
		super(name);
		this.version(1).stores({
			passports: "id",
			photos: "id, passportId",
			extractions: "photoId",
			stamps: "id, passportId, photoId, date",
			locations: "uuid, date",
			trips: "id, start",
			kv: "key",
		});
		// Country index: the app-wide colour palette counts locations per country.
		this.version(2).stores({ locations: "uuid, date, countryCode" });
		// Stays replace trips (ADR 0019); the trips table goes in the next version.
		this.version(3).stores({ stays: "id" }).upgrade(migrateTrips);
		this.version(4).stores({ trips: null });
	}
}

/** `kv` key of stored trips the migration could not place in a country. */
export const LEGACY_TRIPS_KEY = "trips:legacy";

/**
 * Stored trips become stays, put into a history suggested from the stamps
 * and locations, so a user's edits survive. A trip without stops goes to the
 * country its stamps or title name; one that names none is kept in `kv`
 * (`trips:legacy`) for the user to place on the Trips step. After each trip
 * the traveller is home again until the next stay. Without trips
 * nothing is stored: the Trips step suggests the history on its own.
 */
export async function migrateTrips(tx: Transaction): Promise<void> {
	const trips = await tx.table<LegacyTrip, string>("trips").toArray();
	if (trips.length === 0) return;
	const [stamps, locations, picked, dismissed] = await Promise.all([
		tx.table<Stamp, string>("stamps").toArray(),
		tx.table<LocationRow, string>("locations").toArray(),
		tx.table<KvRecord, string>("kv").get("trips:home"),
		tx.table<KvRecord, string>("kv").get("trips:dismissed"),
	]);
	const pickedHome = isCountryCode(picked?.value) ? picked.value : null;
	const home = pickedHome ?? guessHomeCountry(usableStamps(stamps), locations);
	const kept: TravelStay[] = [];
	const unplaced: LegacyTrip[] = [];
	for (const trip of trips) {
		const stays = legacyTripStays(trip, legacyTripCountry(trip, stamps, home));
		if (stays.length > 0) kept.push(...stays);
		else unplaced.push(trip);
	}
	if (unplaced.length > 0)
		await tx
			.table<KvRecord, string>("kv")
			.put({ key: LEGACY_TRIPS_KEY, value: unplaced });
	if (kept.length === 0) return;
	// Deleted trips stay deleted: the Trips step reads the same periods.
	const history = suggestHistory(
		{ stamps, locations, pickedHome, dismissed: periodsOf(dismissed?.value) },
		kept,
	);
	const migrated = new Set(kept.map((s) => s.id));
	await tx
		.table<TravelStay, string>("stays")
		.bulkPut(home ? homeAfterTrips(history, migrated, home) : history);
}
