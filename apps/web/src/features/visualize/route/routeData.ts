import {
	clusterByProximity,
	clusterWaypoints,
	defaultExploreFilters,
	filterRouteRows,
	filterStays,
	journeyWaypoints,
	type LocationRow,
	type RouteMode,
	type Stay,
	type Waypoint,
	yearRange,
} from "@voyput/core";
import { useMemo, useRef } from "react";

/**
 * The player's modes: core's two plus "journey", which flies between trips
 * and walks through each trip's photo clusters (`journeyWaypoints`).
 */
export type PlayerMode = RouteMode | "journey";

/** Core leg timing for a player mode: the journey is timed like the photo route. */
export const timingMode = (mode: PlayerMode): RouteMode =>
	mode === "countries" ? "countries" : "photos";

/** The range control: the whole history or one calendar year. */
export type RouteYear = number | "all";

export interface RouteWaypoints {
	waypoints: Waypoint[];
	/** Stays left out because their country has no anchor on the map. */
	skipped: number;
	/** Photos behind the photo or journey route; 0 by countries. */
	photos: number;
	/** Trip of each waypoint, null at home; all null in "exact by photos". */
	tripIds: (string | null)[];
}

const EMPTY: RouteWaypoints = {
	waypoints: [],
	skipped: 0,
	photos: 0,
	tripIds: [],
};

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
 * Waypoints of the chosen mode and year. Photo clusters (exact and journey)
 * are computed only when such a mode is chosen, once per mode and year, and
 * kept while the stays and locations stay the same, so switching modes back
 * and forth does not cluster again.
 */
export function useRouteWaypoints(
	stays: readonly Stay[],
	locations: readonly LocationRow[],
	mode: PlayerMode,
	year: RouteYear,
): RouteWaypoints {
	const byCountries = useMemo(
		() => journeyWaypoints(staysIn(stays, year), locations, { photos: false }),
		[stays, locations, year],
	);

	const cache = useRef<{
		stays: readonly Stay[];
		locations: readonly LocationRow[];
		byKey: Map<string, RouteWaypoints>;
	} | null>(null);
	const clustered = useMemo(() => {
		if (mode === "countries") return null;
		if (cache.current?.locations !== locations || cache.current.stays !== stays)
			cache.current = { stays, locations, byKey: new Map() };
		const key = `${mode}:${year}`;
		let entry = cache.current.byKey.get(key);
		if (!entry) {
			if (mode === "journey") {
				entry = journeyWaypoints(staysIn(stays, year), locations);
			} else {
				const rows = rowsIn(locations, year);
				const waypoints = clusterWaypoints(clusterByProximity(rows));
				entry = {
					waypoints,
					skipped: 0,
					photos: rows.length,
					tripIds: waypoints.map(() => null),
				};
			}
			cache.current.byKey.set(key, entry);
		}
		return entry;
	}, [mode, stays, locations, year]);

	if (mode === "countries") return { ...byCountries, photos: 0 };
	return clustered ?? EMPTY;
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
