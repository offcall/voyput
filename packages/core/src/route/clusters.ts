import { dayOf } from "../days";
import type { LocationRow } from "../locations/types";
import { haversineKm } from "../viz/geo";

/** Photos taken close together one after another, merged into one waypoint. */
export interface PhotoCluster {
	id: string;
	/** Running average of the photos' coordinates. */
	lat: number;
	lon: number;
	/** Country of the cluster's first photo. */
	countryCode: string;
	photos: number;
	/** ISO date-times of the earliest and latest photo, as exported. */
	firstDate: string;
	lastDate: string;
}

/** 10 m: separates spots within one block, not only cities. */
export const DEFAULT_CLUSTER_RADIUS_KM = 0.01;

/**
 * Sorts rows by date and walks them once: a row within `radiusKm` of the
 * previous cluster's centroid joins it, else it starts a new cluster. Only the
 * previous cluster is compared, so a later return to the same place is a new
 * waypoint (what a route wants) and 30k rows cluster in one linear pass after
 * the sort. Rows are compared by their date text, as exported.
 */
export function clusterByProximity(
	rows: readonly LocationRow[],
	radiusKm: number = DEFAULT_CLUSTER_RADIUS_KM,
): PhotoCluster[] {
	const sorted = [...rows].sort((a, b) =>
		a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
	);
	const clusters: PhotoCluster[] = [];
	let last: PhotoCluster | undefined;
	for (const row of sorted) {
		if (last && haversineKm(last.lat, last.lon, row.lat, row.lon) <= radiusKm) {
			const n = last.photos;
			last.lat = (last.lat * n + row.lat) / (n + 1);
			last.lon = (last.lon * n + row.lon) / (n + 1);
			last.photos = n + 1;
			last.lastDate = row.date;
		} else {
			last = {
				id: `pc${clusters.length}`,
				lat: row.lat,
				lon: row.lon,
				countryCode: row.countryCode,
				photos: 1,
				firstDate: row.date,
				lastDate: row.date,
			};
			clusters.push(last);
		}
	}
	return clusters;
}

export interface RouteRowFilter {
	/** First and last day kept, `YYYY-MM-DD`, inclusive. Omitted means open. */
	from?: string;
	to?: string;
	/** Keep only these country codes. Omitted or empty keeps all. */
	countries?: readonly string[];
	/** Drop these country codes, e.g. the home country. */
	excludeCountries?: readonly string[];
}

/** Rows inside the date range and country choice, in input order. */
export function filterRouteRows(
	rows: readonly LocationRow[],
	filter: RouteRowFilter,
): LocationRow[] {
	const only = filter.countries?.length ? new Set(filter.countries) : null;
	const except = new Set(filter.excludeCountries ?? []);
	return rows.filter((row) => {
		const day = dayOf(row);
		if (filter.from && day < filter.from) return false;
		if (filter.to && day > filter.to) return false;
		if (only && !only.has(row.countryCode)) return false;
		return !except.has(row.countryCode);
	});
}
