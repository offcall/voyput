export type Direction = "entry" | "exit" | "unknown";
export type BorderCrossing =
	| "car"
	| "plane"
	| "train"
	| "ship"
	| "foot"
	| "unknown";

/** A border-crossing stamp read from a passport photo, or added by hand. */
export interface Stamp {
	id: string;
	passportId: string;
	photoId: string;
	direction: Direction;
	borderCrossing: BorderCrossing;
	/** Date line exactly as printed, e.g. "◁ 30 11 20 05". */
	dateText: string;
	/** YYYY-MM-DD, or null when not fully readable. */
	date: string | null;
	country: string | null;
	/** ISO 3166-1 alpha-2, e.g. "RO". */
	countryCode: string | null;
	location: string | null;
	/** 0–100, the model's own certainty; null for stamps added by hand. */
	confidence: number | null;
	notes: string;
	/** Set by our checks; such stamps are not used in visits. */
	problem: string | null;
	source: "ai" | "manual";
	reviewed: boolean;
}

/** What one extraction run produced for one photo. */
export interface PhotoExtraction {
	photoId: string;
	status: "ok" | "failed";
	/** Page description, or the error message. */
	notes: string;
	model: string;
	seconds: number;
	finishedAt: string;
}
