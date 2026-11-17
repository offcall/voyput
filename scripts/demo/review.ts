/**
 * Whether Review's photo location check will warn about a stamp, so the
 * generator can make sure that only the planted misread dates do. Mirrors
 * `checkStamp` in packages/core/src/review/checks.ts: a photo in the stamp's
 * country on its confirming days (entry: that day or the next, exit: that day
 * or the one before, unknown: ±1 day) agrees; otherwise any photo in another
 * country within the window warns.
 * `apps/web/test/demo.test.tsx` checks the result against the real check.
 */

import type { Direction } from "@voyput/core";
import type { PhotoRow } from "./locations.ts";

const WINDOW = 10;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

export function photoCheck(
	rows: readonly PhotoRow[],
): (stamp: {
	date: string | null;
	countryCode: string | null;
	direction: Direction;
}) => boolean {
	const byDay = new Map<number, Set<string>>();
	for (const row of rows) {
		const day = dayNumber(row.day);
		const codes = byDay.get(day) ?? new Set<string>();
		codes.add(row.countryCode);
		byDay.set(day, codes);
	}
	const has = (day: number, match: (code: string) => boolean) =>
		[...(byDay.get(day) ?? [])].some(match);
	return ({ date, countryCode, direction }) => {
		if (!date || !countryCode) return false;
		const target = dayNumber(date);
		const [from, to] =
			direction === "entry" ? [0, 1] : direction === "exit" ? [-1, 0] : [-1, 1];
		for (let day = target + from; day <= target + to; day++)
			if (has(day, (code) => code === countryCode)) return false;
		for (let day = target - WINDOW; day <= target + WINDOW; day++)
			if (has(day, (code) => code !== countryCode)) return true;
		return false;
	};
}
