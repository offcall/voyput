import {
	type ExploreFilters,
	type FilteredStay,
	type LocationRow,
	splitRowsByRanges,
	staySpan,
	type TravelStay,
	withoutTransitRows,
} from "@voyput/core";

/**
 * The photos inside the filtered stays, one group per date range (for
 * `buildVizData`). Ranges use each stay's own border days from the history
 * (Explore gives a shared border day to one stay only), cut to the filter's
 * dates. Layovers are left out: transit stays and their country's photos on
 * their days, unless the filter asks for transits or picks that stay.
 */
export function photosInStays({
	rows,
	filtered,
	history,
	filters,
	birth,
	today,
}: {
	rows: readonly LocationRow[];
	filtered: readonly FilteredStay[];
	history: readonly TravelStay[];
	filters: ExploreFilters;
	birth: string | null;
	today: string;
}): LocationRow[][] {
	const asked = (s: { id: string; kind: string }) =>
		s.kind !== "transit" ||
		filters.kind === "transit" ||
		filters.stayIds.includes(s.id);
	const byId = new Map(history.map((s) => [s.id, s]));
	const ranges = filtered.filter(asked).flatMap((s) => {
		const own = byId.get(s.id);
		const span = own ? staySpan(own, birth, today) : null;
		const from = span?.start ?? s.start;
		const to = span?.end ?? s.end;
		const start = filters.from && filters.from > from ? filters.from : from;
		const end = filters.to && filters.to < to ? filters.to : to;
		return start <= end ? [{ start, end }] : [];
	});
	if (ranges.length === 0) return [];
	const layovers = history.filter((s) => s.kind === "transit" && !asked(s));
	return splitRowsByRanges(withoutTransitRows(rows, layovers), ranges);
}
