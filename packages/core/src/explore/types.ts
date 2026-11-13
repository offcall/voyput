import type { StayEdge as HistoryEdge } from "../trips/types";
import type { Region } from "./regions";

/** A stay's edge with its day known. */
export type ExploreEdge = HistoryEdge & { date: string };

/**
 * A run of consecutive days in one country. `start` and `end` are inclusive
 * YYYY-MM-DD days, so stays of one history never share a day (unless they overlap).
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
	/** Outside the birth country; every stay while none is set. */
	abroad: boolean;
	/** Cities of the stops, comma separated. */
	place: string;
	entry: ExploreEdge;
	exit: ExploreEdge;
	/** Stamps behind the stay. */
	stamps: number;
	/** Days with a photo behind the stay. */
	stopDays: number;
	/** At least one edge is `estimated` or `photos`. */
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
	/** Entry method (`TravelMethod`) or `all`. */
	method: string;
	evidence: EvidenceFilter;
	duration: DurationFilter;
	search: string;
}
