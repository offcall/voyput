import {
	type HistorySource,
	isCountryCode,
	isIsoDate,
	isLegacyTrip,
	type LegacyTrip,
	type LocationRow,
	type Passport,
	type Period,
	periodsOf,
	type Stamp,
	sortStays,
	suggestHistory,
	type TravelStay,
	withBirthStay,
} from "@voyput/core";
import { LEGACY_TRIPS_KEY, type VoyputDb } from "../../db/db";

/** `db.kv` key of the birth date, the start of the first stay. */
export const BIRTH_KEY = "trips:birth";
/** `db.kv` key of the birth country: with the date, the first stay is there since birth. */
export const BIRTH_COUNTRY_KEY = "trips:birthCountry";
/** `db.kv` key of the list order on the Trips step. */
export const ORDER_KEY = "trips:order";

/** How the Trips step lists stays. */
export type StayOrder = "newest" | "oldest";
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
	/** Birth country set by the user, or null (also when invalid). */
	birthCountry: string | null;
	birth: string | null;
	order: StayOrder;
	/** Trips the migration could not place in a country. */
	legacy: LegacyTrip[];
}

export async function loadTripsData(db: VoyputDb): Promise<TripsData> {
	const [
		stamps,
		locations,
		passports,
		stored,
		birthCountry,
		birth,
		order,
		dismissed,
		legacy,
	] = await Promise.all([
		db.stamps.toArray(),
		db.locations.toArray(),
		db.passports.toArray(),
		db.stays.toArray(),
		db.kv.get(BIRTH_COUNTRY_KEY),
		db.kv.get(BIRTH_KEY),
		db.kv.get(ORDER_KEY),
		db.kv.get(DISMISSED_KEY),
		db.kv.get(LEGACY_TRIPS_KEY),
	]);
	return {
		stamps,
		locations,
		passports,
		dismissed: periodsOf(dismissed?.value),
		stored: sortStays(stored),
		...birthOf(birthCountry?.value, birth?.value),
		order: order?.value === "oldest" ? "oldest" : "newest",
		legacy: Array.isArray(legacy?.value)
			? legacy.value.filter(isLegacyTrip)
			: [],
	};
}

/** The stored history, or a suggestion while nothing is stored. */
export const historyOf = (data: TripsData): TravelStay[] =>
	data.stored.length > 0 ? data.stored : suggestHistory(data);

/** Replaces the stored history: for Settings, which changes it as a whole. */
export async function saveStays(
	db: VoyputDb,
	stays: readonly TravelStay[],
): Promise<void> {
	await db.transaction("rw", db.stays, async () => {
		await db.stays.clear();
		await db.stays.bulkPut([...stays]);
	});
}

/** Stable text of a stored value: same content, same text, whatever the key order. */
const canonical = (value: unknown): string =>
	JSON.stringify(value, (_key, v: unknown) =>
		v && typeof v === "object" && !Array.isArray(v)
			? Object.fromEntries(
					Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
				)
			: v,
	);

/** Same stays by id and content, in any order. */
export function sameStays(
	a: readonly TravelStay[],
	b: readonly TravelStay[],
): boolean {
	if (a.length !== b.length) return false;
	const byId = new Map(b.map((s) => [s.id, canonical(s)]));
	return a.every((s) => byId.get(s.id) === canonical(s));
}

/**
 * A stay the page changed from `before` to `after`, merged field by field into
 * what is stored now: a field the page left alone keeps its stored value, so
 * an `evidenceChanged` flag or a dropped stamp id written elsewhere survives.
 */
function mergeStay(
	before: TravelStay,
	after: TravelStay,
	stored: TravelStay,
): TravelStay {
	const merged: Record<string, unknown> = {};
	const keys = new Set([
		...Object.keys(before),
		...Object.keys(after),
		...Object.keys(stored),
	]);
	const read = (stay: TravelStay, key: string): unknown =>
		(stay as unknown as Record<string, unknown>)[key];
	for (const key of keys) {
		const mine = read(after, key);
		const value =
			canonical(mine) === canonical(read(before, key))
				? read(stored, key)
				: mine;
		if (value !== undefined) merged[key] = value;
	}
	return merged as unknown as TravelStay;
}

/**
 * Saves an edit of the history as a diff against `before`, the history the
 * page last read or saved: in one transaction, puts the stays that differ and
 * deletes the ones removed. Stays the edit did not touch are not written, and
 * a touched stay keeps what another writer stored in the fields the edit left
 * alone (ADR 0036). A stay deleted elsewhere is not brought back.
 */
export async function saveStayChanges(
	db: VoyputDb,
	before: readonly TravelStay[],
	after: readonly TravelStay[],
): Promise<void> {
	const old = new Map(before.map((s) => [s.id, s]));
	const kept = new Set(after.map((s) => s.id));
	const changed = after.filter((s) => {
		const was = old.get(s.id);
		return !was || canonical(was) !== canonical(s);
	});
	const removed = before.filter((s) => !kept.has(s.id)).map((s) => s.id);
	await db.transaction("rw", db.stays, async () => {
		const stored = await db.stays.bulkGet(changed.map((s) => s.id));
		const puts: TravelStay[] = [];
		changed.forEach((stay, i) => {
			const was = old.get(stay.id);
			const now = stored[i];
			if (!was) puts.push(stay);
			else if (now) puts.push(mergeStay(was, stay, now));
		});
		if (puts.length > 0) await db.stays.bulkPut(puts);
		if (removed.length > 0) await db.stays.bulkDelete(removed);
	});
}

export async function saveOrder(db: VoyputDb, order: StayOrder): Promise<void> {
	await db.kv.put({ key: ORDER_KEY, value: order });
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
const birthOf = (birthCountry: unknown, birth: unknown): Birth => ({
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

/** Keeps the trips still waiting for a country; none left removes the key. */
export async function saveLegacyTrips(
	db: VoyputDb,
	trips: readonly LegacyTrip[],
): Promise<void> {
	if (trips.length > 0)
		await db.kv.put({ key: LEGACY_TRIPS_KEY, value: [...trips] });
	else await db.kv.delete(LEGACY_TRIPS_KEY);
}
