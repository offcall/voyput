import { dayOf } from "../days";
import type { LocationRow } from "../locations/types";

/**
 * Splits rows into date ranges (inclusive, by `YYYY-MM-DD`, e.g. the selected
 * stays), one group per range in date order. Overlapping or touching ranges
 * merge into one, so no row is counted twice. No ranges means one group with all rows.
 */
export function splitRowsByRanges(
	rows: readonly LocationRow[],
	ranges: readonly { start: string; end: string }[],
): LocationRow[][] {
	if (ranges.length === 0) return [[...rows]];
	const sorted = ranges
		.map((range) => ({
			start: range.start.slice(0, 10),
			end: range.end.slice(0, 10),
		}))
		.sort((a, b) => a.start.localeCompare(b.start));
	const merged: { start: string; end: string }[] = [];
	for (const range of sorted) {
		const last = merged.at(-1);
		if (last && range.start <= last.end) {
			if (range.end > last.end) last.end = range.end;
		} else {
			merged.push({ ...range });
		}
	}
	const groups: LocationRow[][] = merged.map(() => []);
	for (const row of rows) {
		const day = dayOf(row);
		const index = merged.findIndex((r) => day >= r.start && day <= r.end);
		if (index >= 0) groups[index]?.push(row);
	}
	return groups;
}
