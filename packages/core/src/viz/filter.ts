import type { LocationRow } from "../locations/types";
import type { Trip } from "../trips/types";

/**
 * Rows whose day falls inside any of the trips (inclusive, by `YYYY-MM-DD`).
 * No trips means no filter.
 */
export function filterRowsByTrips(
	rows: readonly LocationRow[],
	trips: readonly Pick<Trip, "start" | "end">[],
): readonly LocationRow[] {
	if (trips.length === 0) return rows;
	const ranges = trips.map((trip) => [
		trip.start.slice(0, 10),
		trip.end.slice(0, 10),
	]);
	return rows.filter((row) => {
		const day = row.date.slice(0, 10);
		return ranges.some(([start = "", end = ""]) => day >= start && day <= end);
	});
}
