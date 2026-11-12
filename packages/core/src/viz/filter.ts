import type { LocationRow } from "../locations/types";
import type { Trip } from "../trips/types";

/**
 * Splits rows into the date ranges of the trips (inclusive, by `YYYY-MM-DD`),
 * one group per range in date order. Overlapping or touching trips merge into
 * one range, so no row is counted twice. No trips means one group with all rows.
 */
export function splitRowsByTrips(
	rows: readonly LocationRow[],
	trips: readonly Pick<Trip, "start" | "end">[],
): LocationRow[][] {
	if (trips.length === 0) return [[...rows]];
	const sorted = trips
		.map((trip) => ({
			start: trip.start.slice(0, 10),
			end: trip.end.slice(0, 10),
		}))
		.sort((a, b) => a.start.localeCompare(b.start));
	const ranges: { start: string; end: string }[] = [];
	for (const range of sorted) {
		const last = ranges.at(-1);
		if (last && range.start <= last.end) {
			if (range.end > last.end) last.end = range.end;
		} else {
			ranges.push({ ...range });
		}
	}
	const groups: LocationRow[][] = ranges.map(() => []);
	for (const row of rows) {
		const day = row.date.slice(0, 10);
		const index = ranges.findIndex((r) => day >= r.start && day <= r.end);
		if (index >= 0) groups[index]?.push(row);
	}
	return groups;
}
