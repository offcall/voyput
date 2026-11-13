/** How the traveller crossed a border. Stamps say `foot`; here it is `walk`. */
export type TravelMethod =
	| "walk"
	| "car"
	| "bus"
	| "train"
	| "plane"
	| "ship"
	| "unknown";

export const TRAVEL_METHODS: readonly TravelMethod[] = [
	"walk",
	"car",
	"bus",
	"train",
	"plane",
	"ship",
	"unknown",
];

/**
 * Where an edge date comes from: a passport stamp, the first or last photo in
 * the country, an estimate (no evidence on that day), or the user.
 */
export type EdgeSource = "stamp" | "photos" | "estimated" | "manual";

export interface StayEdge {
	/**
	 * YYYY-MM-DD. Null only as the first stay's arrival ("since birth", see
	 * the birth date setting) or the last stay's departure (still there).
	 */
	date: string | null;
	source: EdgeSource;
	method: TravelMethod;
	/** The stamp this edge was read from, while `source` is `stamp`. */
	stampId?: string;
}

/**
 * One stay in one country, from arrival to departure, both days included. The
 * history is a sequence of these; a border day belongs to both stays around it,
 * so a departure and the next arrival normally share their date.
 * `transit`: passed through (an airport, a night train) rather than stayed.
 */
export interface TravelStay {
	id: string;
	countryCode: string;
	/** Cities or border posts, comma separated; may be empty. */
	place: string;
	kind: "stay" | "transit";
	arrival: StayEdge;
	departure: StayEdge;
	/** Stamps and photo locations (`LocationRow.uuid`) behind the stay. */
	stampIds: string[];
	photoIds: string[];
	approved: boolean;
}

/** Stays between two home stays: derived from the stays, never stored. */
export interface Trip {
	/** `trip-` and the id of its first stay. */
	id: string;
	/** Countries in visit order, e.g. "Italy → France". */
	title: string;
	/** First arrival and last departure, YYYY-MM-DD. */
	start: string;
	end: string;
	stayIds: string[];
	/** Countries of the trip's stays (transits included), in visit order. */
	countries: string[];
	/** Countries the traveller stayed in, transits left out. */
	visited: string[];
	/** Every stay of the trip is approved. */
	approved: boolean;
}
