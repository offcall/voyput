import {
	clusterByProximity,
	clusterWaypoints,
	defaultExploreFilters,
	filterRouteRows,
	filterStays,
	type LocationRow,
	type RouteMode,
	type Stay,
	stayWaypoints,
	type Waypoint,
	yearRange,
} from "@voyput/core";
import { useMemo, useRef } from "react";

/** The range control: the whole history or one calendar year. */
export type RouteYear = number | "all";

export interface RouteWaypoints {
	waypoints: Waypoint[];
	/** Stays left out because their country has no anchor on the map. */
	skipped: number;
	/** Photos behind the "exact by photos" route; 0 in the other mode. */
	photos: number;
}

const EMPTY: Waypoint[] = [];

/** Stays touching the year, cut to it, as the "by countries" route reads them. */
function staysIn(stays: readonly Stay[], year: RouteYear) {
	if (year === "all") return stays;
	return filterStays(stays, {
		...defaultExploreFilters(stays),
		...yearRange(year, stays),
	}).map((s) => ({ ...s, start: s.clipStart, end: s.clipEnd }));
}

function rowsIn(rows: readonly LocationRow[], year: RouteYear) {
	if (year === "all") return rows;
	return filterRouteRows(rows, { from: `${year}-01-01`, to: `${year}-12-31` });
}

/**
 * Waypoints of the chosen mode and year. Photo clusters are computed only when
 * "exact by photos" is chosen, once per year, and kept while the locations stay
 * the same, so switching modes back and forth does not cluster again.
 */
export function useRouteWaypoints(
	stays: readonly Stay[],
	locations: readonly LocationRow[],
	mode: RouteMode,
	year: RouteYear,
): RouteWaypoints {
	const byCountries = useMemo(
		() => stayWaypoints(staysIn(stays, year), locations),
		[stays, locations, year],
	);

	const cache = useRef<{
		locations: readonly LocationRow[];
		byYear: Map<RouteYear, { waypoints: Waypoint[]; photos: number }>;
	} | null>(null);
	const byPhotos = useMemo(() => {
		if (mode !== "photos") return null;
		if (cache.current?.locations !== locations)
			cache.current = { locations, byYear: new Map() };
		let entry = cache.current.byYear.get(year);
		if (!entry) {
			const rows = rowsIn(locations, year);
			entry = {
				waypoints: clusterWaypoints(clusterByProximity(rows)),
				photos: rows.length,
			};
			cache.current.byYear.set(year, entry);
		}
		return entry;
	}, [mode, locations, year]);

	if (mode === "photos")
		return {
			waypoints: byPhotos?.waypoints ?? EMPTY,
			skipped: 0,
			photos: byPhotos?.photos ?? 0,
		};
	return { ...byCountries, photos: 0 };
}

/** English country names from the stays, then the photo rows; the code as a last resort. */
export function useCountryNames(
	stays: readonly Stay[],
	locations: readonly LocationRow[],
): (code: string) => string {
	return useMemo(() => {
		const names = new Map<string, string>();
		for (const stay of stays) names.set(stay.countryCode, stay.country);
		for (const row of locations)
			if (row.country && !names.has(row.countryCode))
				names.set(row.countryCode, row.country);
		return (code: string) => names.get(code) ?? code;
	}, [stays, locations]);
}
