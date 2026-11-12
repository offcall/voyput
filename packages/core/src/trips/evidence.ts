import type { LocationRow } from "../locations/types";
import type { Stamp } from "../stamps/types";

/** A stamp that can place the traveller in a country on a day. */
export type DatedStamp = Stamp & { date: string; countryCode: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CC_RE = /^[A-Z]{2}$/;

/** Reviewed stamps with a full date and a country, without a flagged problem. */
export function usableStamps(stamps: readonly Stamp[]): DatedStamp[] {
	return stamps
		.filter(
			(s): s is DatedStamp =>
				s.reviewed &&
				s.problem === null &&
				s.date !== null &&
				DAY_RE.test(s.date) &&
				s.countryCode !== null &&
				CC_RE.test(s.countryCode),
		)
		.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Local calendar day of a photo. The CSV holds local time with an offset;
 * converting to UTC would move evening arrivals to the wrong day.
 */
export function locationDay(row: LocationRow): string | null {
	const day = row.date.slice(0, 10);
	return DAY_RE.test(day) && CC_RE.test(row.countryCode) ? day : null;
}

export function daysBetween(from: string, to: string): number {
	return (
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
		86_400_000
	);
}

/**
 * The country with the most days of evidence (photo days plus stamp days).
 * Trips are stays outside it. A guess: the user can override it.
 */
export function guessHomeCountry(
	stamps: readonly DatedStamp[],
	locations: readonly LocationRow[],
): string | null {
	const days = new Map<string, Set<string>>();
	const add = (cc: string, day: string) => {
		let set = days.get(cc);
		if (!set) {
			set = new Set();
			days.set(cc, set);
		}
		set.add(day);
	};
	for (const row of locations) {
		const day = locationDay(row);
		if (day) add(row.countryCode, day);
	}
	for (const s of stamps) add(s.countryCode, s.date);
	let best: string | null = null;
	let bestCount = 0;
	for (const [cc, set] of [...days].sort((a, b) => a[0].localeCompare(b[0]))) {
		if (set.size > bestCount) {
			best = cc;
			bestCount = set.size;
		}
	}
	return best;
}
