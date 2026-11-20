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
	/** Warnings the user hid on Review; a hidden warning no longer counts as an issue. */
	dismissed?: DismissedNotes;
	/**
	 * The date before the first edit on Review, i.e. as read from the stamp;
	 * absent until the date is first changed. Review's reset returns to it.
	 */
	readDate?: string | null;
	/** Where the stamp is on the stored photo (unturned), as read by the model; absent on older and hand-added stamps. */
	box?: StampBox;
}

/** A part of a photo, in 0..1 of its width and height from the top-left corner. */
export interface StampBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Review warnings a user can hide: our date check and the location history check. */
export type NoteKind = "problem" | "icloudCheck" | "suggestion";
export type DismissedNotes = Partial<Record<NoteKind, true>>;

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
