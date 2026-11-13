import { spanDays } from "../explore/dates";
import type { LocationRow } from "../locations/types";
import type { Stamp } from "../stamps/types";
import { applyDismissed, mergeKept, type Period, suggestStays } from "./build";
import { withBirthStay } from "./edit";
import { locationDay, usableStamps } from "./evidence";
import type { TravelStay } from "./types";

/** First and last day of a stay; null where it is unknown. */
export interface StaySpan {
	start: string | null;
	end: string | null;
}

/**
 * A stay's days, with "since birth" read as the birth date and "still there"
 * as `today`.
 */
export function staySpan(
	stay: TravelStay,
	birth: string | null,
	today: string,
): StaySpan {
	return {
		start: stay.arrival.date ?? birth,
		end: stay.departure.date ?? today,
	};
}

/** Calendar days of a span, both ends included; null when an end is unknown or reversed. */
export function spanLength({ start, end }: StaySpan): number | null {
	if (start === null || end === null || start > end) return null;
	return spanDays(start, end);
}

/**
 * Photo locations without the ones taken in a transit country during the
 * transit: an airport layover is not a visit, so its photos do not count.
 */
export function withoutTransitRows(
	rows: readonly LocationRow[],
	stays: readonly TravelStay[],
): LocationRow[] {
	const transits = stays.filter((s) => s.kind === "transit");
	if (transits.length === 0) return [...rows];
	return rows.filter((row) => {
		const d = locationDay(row);
		return !(
			d &&
			transits.some(
				(s) =>
					s.countryCode === row.countryCode &&
					(s.arrival.date === null || s.arrival.date <= d) &&
					(s.departure.date === null || d <= s.departure.date),
			)
		);
	});
}

/** Everything a history is suggested from, as stored. */
export interface HistorySource {
	/** All stamps; only usable ones count. */
	stamps: readonly Stamp[];
	locations: readonly LocationRow[];
	/** Where the traveller was born; with `birth` the first stay is there since birth. */
	birthCountry: string | null;
	/** The birth date, YYYY-MM-DD, or null. */
	birth: string | null;
	/** Periods of trips the user deleted before stays: nothing there. */
	dismissed: readonly Period[];
}

/**
 * The history suggested from the evidence, built around the stays in `kept`,
 * with a stay since birth first when both the birth country and date are set.
 */
export function suggestHistory(
	source: HistorySource,
	kept: readonly TravelStay[] = [],
): TravelStay[] {
	const stamps = usableStamps(source.stamps);
	const suggested = applyDismissed(
		suggestStays({ stamps, locations: source.locations }),
		source.dismissed,
	);
	return withBirthStay(mergeKept(suggested, kept), source);
}
