import {
	isCountryCode,
	isIsoDate,
	sortStays,
	type TravelStay,
	withBirthStay,
} from "@voyput/core";
import type { VoyputDb } from "../db/db";

/*
 * The profile: birth country and date, read by Settings, the Collect plan,
 * Stays and Insights. The key strings are stored data: never change them.
 */

/** `db.kv` key of the birth date, the start of the first stay. */
export const BIRTH_KEY = "trips:birth";
/** `db.kv` key of the birth country: with the date, the first stay is there since birth. */
export const BIRTH_COUNTRY_KEY = "trips:birthCountry";

/** Replaces the stored history: a birth change rewrites it as a whole. */
async function saveStays(
	db: VoyputDb,
	stays: readonly TravelStay[],
): Promise<void> {
	await db.transaction("rw", db.stays, async () => {
		await db.stays.clear();
		await db.stays.bulkPut([...stays]);
	});
}

/** Birth country and date; an empty one is forgotten. */
export async function saveBirth(
	db: VoyputDb,
	birth: { birth: string | null; birthCountry: string | null },
): Promise<void> {
	await Promise.all(
		(
			[
				[BIRTH_KEY, birth.birth],
				[BIRTH_COUNTRY_KEY, birth.birthCountry],
			] as const
		).map(([key, value]) =>
			value ? db.kv.put({ key, value }) : db.kv.delete(key),
		),
	);
}

export interface Birth {
	birth: string | null;
	birthCountry: string | null;
}

/** Stored birth values; an invalid one reads as not set. */
export const birthOf = (birthCountry: unknown, birth: unknown): Birth => ({
	birthCountry: isCountryCode(birthCountry) ? birthCountry : null,
	birth: typeof birth === "string" && isIsoDate(birth) ? birth : null,
});

/** The birth setting alone, for Settings. */
export async function loadBirth(db: VoyputDb): Promise<Birth> {
	const [birthCountry, birth] = await Promise.all([
		db.kv.get(BIRTH_COUNTRY_KEY),
		db.kv.get(BIRTH_KEY),
	]);
	return birthOf(birthCountry?.value, birth?.value);
}

/** The birth setting and the stored history it shaped: what a Settings change replaces. */
export interface BirthSnapshot extends Birth {
	stays: TravelStay[];
}

/**
 * Saves the birth setting from Settings. A stored history gets its stay since
 * birth added, moved or removed, as on the Stays step; a suggestion picks the
 * setting up when it is built. Returns what was there before, for Undo.
 */
export async function changeBirth(
	db: VoyputDb,
	birth: Birth,
): Promise<BirthSnapshot> {
	return db.transaction("rw", db.kv, db.stays, async () => {
		const before = await loadBirth(db);
		const stored = sortStays(await db.stays.toArray());
		await saveBirth(db, birth);
		if (stored.length > 0) await saveStays(db, withBirthStay(stored, birth));
		return { ...before, stays: stored };
	});
}

/** Puts a birth setting and its history back as they were; returns what it replaced, for Redo. */
export async function restoreBirth(
	db: VoyputDb,
	snapshot: BirthSnapshot,
): Promise<BirthSnapshot> {
	return db.transaction("rw", db.kv, db.stays, async () => {
		const before = await loadBirth(db);
		const stored = sortStays(await db.stays.toArray());
		await saveBirth(db, snapshot);
		await saveStays(db, snapshot.stays);
		return { ...before, stays: stored };
	});
}
