import type { LocationRow } from "../locations/types";
import type { Stamp } from "../stamps/types";

/** A stamp that can place the traveller in a country on a day. */
export type DatedStamp = Stamp & { date: string; countryCode: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CC_RE = /^[A-Z]{2}$/;

/**
 * Reviewed stamps with a full date and a country, without an open problem.
 * A problem the user hid on Review no longer counts.
 */
export function usableStamps(stamps: readonly Stamp[]): DatedStamp[] {
	return stamps
		.filter(
			(s): s is DatedStamp =>
				s.reviewed &&
				(s.problem === null || s.dismissed?.problem === true) &&
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
