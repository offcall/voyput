import {
	type HistorySource,
	homeOf,
	isCountryCode,
	isIsoDate,
	type LocationRow,
	type Passport,
	type Period,
	periodsOf,
	type Stamp,
	sortStays,
	suggestHistory,
	type TravelStay,
} from "@voyput/core";
import type { VoyputDb } from "../../db/db";

/** `db.kv` key of the home country the user picked. */
export const HOME_KEY = "trips:home";
/** `db.kv` key of the birth date, the start of the first stay. */
export const BIRTH_KEY = "trips:birth";
/** `db.kv` key of the periods of trips the user deleted before stays (Dexie version 2). */
export const DISMISSED_KEY = "trips:dismissed";

export { suggestHistory };

export interface TripsData extends HistorySource {
	stamps: Stamp[];
	locations: LocationRow[];
	passports: Passport[];
	dismissed: Period[];
	/** The stored history, in date order; empty until the user edits a suggestion. */
	stored: TravelStay[];
	/** Home country chosen by the user, or null (also when invalid). */
	pickedHome: string | null;
	birth: string | null;
}

export async function loadTripsData(db: VoyputDb): Promise<TripsData> {
	const [stamps, locations, passports, stored, home, birth, dismissed] =
		await Promise.all([
			db.stamps.toArray(),
			db.locations.toArray(),
			db.passports.toArray(),
			db.stays.toArray(),
			db.kv.get(HOME_KEY),
			db.kv.get(BIRTH_KEY),
			db.kv.get(DISMISSED_KEY),
		]);
	return {
		stamps,
		locations,
		passports,
		dismissed: periodsOf(dismissed?.value),
		stored: sortStays(stored),
		pickedHome: isCountryCode(home?.value) ? home.value : null,
		birth:
			typeof birth?.value === "string" && isIsoDate(birth.value)
				? birth.value
				: null,
	};
}

/** The stored history, or a suggestion while nothing is stored. */
export const historyOf = (data: TripsData): TravelStay[] =>
	data.stored.length > 0 ? data.stored : suggestHistory(data);

/** Home: the user's pick, else the country of most stays. */
export const homeFor = (
	data: Pick<TripsData, "pickedHome">,
	stays: readonly TravelStay[],
): string | null => data.pickedHome ?? homeOf(stays);

/** Replaces the stored history. */
export async function saveStays(
	db: VoyputDb,
	stays: readonly TravelStay[],
): Promise<void> {
	await db.transaction("rw", db.stays, async () => {
		await db.stays.clear();
		await db.stays.bulkPut([...stays]);
	});
}

export async function saveHome(db: VoyputDb, home: string): Promise<void> {
	await db.kv.put({ key: HOME_KEY, value: home });
}

/** An empty birth date forgets it: the first stay is "since birth" again. */
export async function saveBirth(
	db: VoyputDb,
	birth: string | null,
): Promise<void> {
	if (birth) await db.kv.put({ key: BIRTH_KEY, value: birth });
	else await db.kv.delete(BIRTH_KEY);
}
