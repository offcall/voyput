import {
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
	sortStays,
	suggestHistory,
	type TravelStay,
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
		// No home any more (ADR 0022): generated home stays and the home pick go.
		this.version(5).upgrade(dropHomeStays);
	}
}

/** Ids the version 4 suggester gave: `stay-<arrival or birth>-<country>`, maybe with suffixes. */
const SUGGESTED_ID =
	/^stay-(?:\d{4}-\d{2}-\d{2}|birth)-([a-z]{2})(?:-home|-after|-\d+)*$/;

/** The country of most stays (transits left out), as version 4 read home. */
function mostStaysCountry(stays: readonly TravelStay[]): string | null {
	const counts = new Map<string, number>();
	for (const s of stays)
		if (s.kind === "stay")
			counts.set(s.countryCode, (counts.get(s.countryCode) ?? 0) + 1);
	let best: string | null = null;
	for (const [cc, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0])))
		if (best === null || n > (counts.get(best) ?? 0)) best = cc;
	return best;
}

/**
 * Stays the version 4 suggester made up to fill time at home, provably
 * untouched: in the home country under the id it was suggested with (a
 * changed country keeps its old id), kind `stay`, no stamp, photo, place or
 * approval, no date set by hand, and each travel method unknown or the one
 * the neighbouring stay gave it. Version 4 stored no `edited` flag, so
 * anything that may have been edited stays.
 */
export function generatedHomeStays(
	stays: readonly TravelStay[],
	pickedHome: string | null,
): Set<string> {
	const sorted = sortStays(stays);
	const home = pickedHome ?? mostStaysCountry(sorted);
	const out = new Set<string>();
	sorted.forEach((s, i) => {
		const prev = sorted[i - 1];
		const next = sorted[i + 1];
		const idCountry = SUGGESTED_ID.exec(s.id)?.[1];
		if (
			home !== null &&
			s.countryCode === home &&
			idCountry === home.toLowerCase() &&
			s.kind === "stay" &&
			s.stampIds.length === 0 &&
			s.photoIds.length === 0 &&
			s.place === "" &&
			!s.approved &&
			s.arrival.source === "estimated" &&
			s.departure.source === "estimated" &&
			(s.arrival.method === "unknown" ||
				s.arrival.method === prev?.departure.method) &&
			(s.departure.method === "unknown" ||
				s.departure.method === next?.arrival.method)
		)
			out.add(s.id);
	});
	return out;
}

/** Version 5: stored stays lose the provably generated home stays; `trips:home` goes. */
export async function dropHomeStays(tx: Transaction): Promise<void> {
	const kv = tx.table<KvRecord, string>("kv");
	const stays = tx.table<TravelStay, string>("stays");
	const picked = await kv.get("trips:home");
	const generated = generatedHomeStays(
		await stays.toArray(),
		isCountryCode(picked?.value) ? picked.value : null,
	);
	await stays.bulkDelete([...generated]);
	await kv.delete("trips:home");
}

/** `kv` key of stored trips the migration could not place in a country. */
export const LEGACY_TRIPS_KEY = "trips:legacy";

/**
 * Stored trips become stays, put into a history suggested from the stamps
 * and locations, so a user's edits survive. A trip without stops goes to the
 * country its stamps or title name; one that names none is kept in `kv`
 * (`trips:legacy`) for the user to place on the Trips step. Without trips
 * nothing is stored: the Trips step suggests the history on its own.
 */
export async function migrateTrips(tx: Transaction): Promise<void> {
	const trips = await tx.table<LegacyTrip, string>("trips").toArray();
	if (trips.length === 0) return;
	const [stamps, locations, dismissed] = await Promise.all([
		tx.table<Stamp, string>("stamps").toArray(),
		tx.table<LocationRow, string>("locations").toArray(),
		tx.table<KvRecord, string>("kv").get("trips:dismissed"),
	]);
	const kept: TravelStay[] = [];
	const unplaced: LegacyTrip[] = [];
	for (const trip of trips) {
		const stays = legacyTripStays(trip, legacyTripCountry(trip, stamps));
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
		{
			stamps,
			locations,
			birthCountry: null,
			birth: null,
			dismissed: periodsOf(dismissed?.value),
		},
		kept,
	);
	await tx.table<TravelStay, string>("stays").bulkPut(history);
}
