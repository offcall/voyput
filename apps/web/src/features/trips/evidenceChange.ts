import {
	type EvidenceChange,
	flagChangedEvidence,
	type TravelStay,
} from "@voyput/core";
import type { VoyputDb } from "../../db/db";

/**
 * Marks stored stays whose stamps or photos were deleted or edited and drops
 * the deleted ids from them (`flagChangedEvidence`). Call it inside the
 * transaction that deletes or edits the evidence, with `db.stays` in its
 * scope. While nothing is stored the Stays step suggests from the evidence
 * as it is, so there is nothing to do. Returns the changed stays as they
 * were, for `restoreStays`.
 */
export async function staysAfterEvidenceChange(
	db: VoyputDb,
	change: EvidenceChange,
): Promise<TravelStay[]> {
	const stored = await db.stays.toArray();
	const next = flagChangedEvidence(stored, change);
	const before = stored.filter((s, i) => next[i] !== s);
	await db.stays.bulkPut(next.filter((s, i) => s !== stored[i]));
	return before;
}

/** Puts stays changed by `staysAfterEvidenceChange` back, unless they were deleted since. */
export async function restoreStays(
	db: VoyputDb,
	before: readonly TravelStay[],
): Promise<void> {
	if (before.length === 0) return;
	await db.transaction("rw", db.stays, async () => {
		const now = await db.stays.bulkGet(before.map((s) => s.id));
		await db.stays.bulkPut(before.filter((_, i) => now[i] !== undefined));
	});
}
