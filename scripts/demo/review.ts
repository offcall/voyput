/**
 * Which stamps Review's photo location check will warn about, so the demo can
 * ship the travel-day warnings already marked fine and leave only the planted
 * problems open. Mirrors `checkStamp` in packages/core/src/review/checks.ts:
 * the nearest photo by day (the earlier side on a tie), and within a day the
 * first row by uuid, which is how the app reads them back from IndexedDB.
 * `apps/web/test/demo.test.tsx` checks the result against the real check.
 */

import type { PhotoRow } from "./locations.ts";

const WINDOW = 10;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

export function photoCheck(
	rows: readonly PhotoRow[],
): (stamp: { date: string | null; countryCode: string | null }) => boolean {
	const sorted = [...rows]
		.sort((a, b) => (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0))
		.map((row) => ({ day: dayNumber(row.day), code: row.countryCode }))
		.sort((a, b) => a.day - b.day);
	return ({ date, countryCode }) => {
		if (!date || !countryCode) return false;
		const target = dayNumber(date);
		let right = sorted.findIndex((row) => row.day >= target);
		if (right < 0) right = sorted.length;
		const before = sorted[right - 1];
		const after = sorted[right];
		const leftGap = before ? target - before.day : Infinity;
		const rightGap = after ? after.day - target : Infinity;
		const nearest = leftGap <= rightGap ? before : after;
		return Boolean(
			nearest &&
				nearest.code !== countryCode &&
				Math.min(leftGap, rightGap) <= WINDOW,
		);
	};
}
