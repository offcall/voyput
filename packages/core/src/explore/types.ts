import type { Region } from "./regions";

/** Where a stay's edge date comes from. `photos`: a country change seen in photo days inside a trip. */
export type EdgeSource = "stamp" | "manual" | "photos" | "unknown";

export interface StayEdge {
	date: string;
	source: EdgeSource;
	/** A `BorderCrossing` value, or `unknown`. */
	method: string;
	stampId?: string;
}

/**
 * A run of consecutive days in one country. `start` and `end` are inclusive
 * YYYY-MM-DD days, so stays of one history never share a day (unless trips overlap).
 */
export interface Stay {
	id: string;
	/** Position in the chronological list `buildStays` returned. */
	order: number;
	countryCode: string;
	/** English country name. */
	country: string;
	region: Region;
	start: string;
	end: string;
	/** Calendar days from `start` to `end`, both included (at least 1). */
	days: number;
	kind: "stay" | "transit";
	/** A stay in the home country between two trips. */
	home: boolean;
	tripId: string | null;
	tripTitle: string;
	/** Cities of the stops, comma separated. */
	place: string;
	entry: StayEdge;
	exit: StayEdge;
	/** Stamps of the trip in this country within the stay's days. */
	stamps: number;
	/** Days with a stop: photos or a stamp in this country that day. */
	stopDays: number;
	/** At least one edge is `unknown` or `photos`. */
	estimated: boolean;
}

/** A stay that passed the filters, cut to the selected date range. */
export interface FilteredStay extends Stay {
	clipStart: string;
	clipEnd: string;
	/** Days of the stay inside the range, both ends included. */
	clippedDays: number;
}

export type KindFilter = "all" | "stay" | "transit";
export type EvidenceFilter = "all" | "exact" | "estimated" | "stamps";
export type DurationFilter = "all" | "day" | "short" | "medium" | "long";

export interface ExploreFilters {
	/** Inclusive YYYY-MM-DD; an empty string leaves that side open. */
	from: string;
	to: string;
	/** Country codes; empty means all. */
	countries: string[];
	region: Region | "all";
	kind: KindFilter;
	/** Entry method (`BorderCrossing`) or `all`. */
	method: string;
	evidence: EvidenceFilter;
	duration: DurationFilter;
	search: string;
	/** Include home stays. */
	home: boolean;
}
