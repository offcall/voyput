import { dayOf, type LocalDay } from "../days";
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

/** A photo's local day (`dayOf`), or null when the day or the country is not valid. */
export function locationDay(row: LocationRow): LocalDay | null {
	const day = dayOf(row);
	return DAY_RE.test(day) && CC_RE.test(row.countryCode) ? day : null;
}
