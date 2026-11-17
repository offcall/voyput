import {
	type EvidenceChange,
	flagChangedEvidence,
	type Stamp,
	type StayEdge,
	type TravelStay,
} from "@voyput/core";
import type { VoyputDb } from "../../db/db";

/** What a stamp delete did to stored stays, so Undo can take back just that. */
export interface StaysUndo {
	/** The deleted stamps. */
	removed: string[];
	/** The changed stays as they were before. */
	stays: TravelStay[];
	/** The other stamps of those stays, edges included, as they were at the delete. */
	stamps: Stamp[];
}

export const NO_STAYS_UNDO: StaysUndo = { removed: [], stays: [], stamps: [] };

/**
 * Marks stored stays whose stamps or photos were deleted or edited and drops
 * the deleted ids from them (`flagChangedEvidence`). Call it inside the
 * transaction that deletes or edits the evidence, with `db.stays` and
 * `db.stamps` in its scope. While nothing is stored the Stays step suggests
 * from the evidence as it is, so there is nothing to do. Returns what
 * `restoreStays` needs to undo a stamp delete.
 */
export async function staysAfterEvidenceChange(
	db: VoyputDb,
	change: EvidenceChange,
): Promise<StaysUndo> {
	const stored = await db.stays.toArray();
	const next = flagChangedEvidence(stored, change);
	const before = stored.filter((s, i) => next[i] !== s);
	if (before.length === 0) return NO_STAYS_UNDO;
	await db.stays.bulkPut(next.filter((s, i) => s !== stored[i]));
	const ids = [...new Set(before.flatMap(stampsOf))];
	const stamps = (await db.stamps.bulkGet(ids)).filter(
		(s): s is Stamp => s !== undefined,
	);
	return { removed: [...(change.removedStamps ?? [])], stays: before, stamps };
}

/** Stamps a stay rests on: its own and those its edges were read from. */
const stampsOf = (s: TravelStay): string[] =>
	[...s.stampIds, s.arrival.stampId, s.departure.stampId].filter(
		(id): id is string => id !== undefined,
	);

/** Fields of a stamp that place it in a stay: changing one marks its stays. */
export const STAY_FIELDS = [
	"date",
	"countryCode",
	"direction",
	"borderCrossing",
	"reviewed",
] as const;

/** An edge the delete turned into an estimate gets its stamp back, unless it was changed since. */
function edgeBack(now: StayEdge, was: StayEdge, removed: Set<string>) {
	return was.stampId &&
		removed.has(was.stampId) &&
		now.stampId === undefined &&
		now.source === "estimated" &&
		now.date === was.date
		? { ...now, source: was.source, stampId: was.stampId }
		: now;
}

/**
 * Takes back what a stamp delete did to stored stays: the deleted ids and
 * the edges read from them come back. Later changes stay: a stay deleted
 * since stays deleted, and the flag stays while the stay was flagged before
 * or another of its stamps or photos changed since.
 */
export async function restoreStays(
	db: VoyputDb,
	undo: StaysUndo,
): Promise<void> {
	if (undo.stays.length === 0) return;
	const removed = new Set(undo.removed);
	const was = new Map(undo.stamps.map((s) => [s.id, s]));
	await db.transaction("rw", db.stays, db.stamps, async () => {
		const current = await db.stays.bulkGet(undo.stays.map((s) => s.id));
		const ids = [...new Set(current.flatMap((s) => (s ? stampsOf(s) : [])))];
		const stamps = new Map(
			(await db.stamps.bulkGet(ids)).flatMap((s) => (s ? [[s.id, s]] : [])),
		);
		const changedSince = (id: string) => {
			const then = was.get(id);
			const now = stamps.get(id);
			return (
				!then || !now || STAY_FIELDS.some((field) => then[field] !== now[field])
			);
		};
		const back = undo.stays.flatMap((before, i): TravelStay[] => {
			const now = current[i];
			if (!now) return [];
			const stampIds = [
				...before.stampIds.filter(
					(id) => removed.has(id) || now.stampIds.includes(id),
				),
				...now.stampIds.filter((id) => !before.stampIds.includes(id)),
			];
			const { evidenceChanged, ...rest } = now;
			const stillChanged =
				evidenceChanged === true &&
				(before.evidenceChanged === true ||
					now.photoIds.length < before.photoIds.length ||
					stampsOf(now).some(changedSince) ||
					before.stampIds.some(
						(id) => !removed.has(id) && !now.stampIds.includes(id),
					));
			return [
				{
					...rest,
					stampIds,
					arrival: edgeBack(now.arrival, before.arrival, removed),
					departure: edgeBack(now.departure, before.departure, removed),
					...(stillChanged ? { evidenceChanged: true } : {}),
				},
			];
		});
		await db.stays.bulkPut(back);
	});
}
