import type {
	NoteKind,
	ReadStamp,
	Rotation,
	Stamp,
	TravelStay,
} from "@voyput/core";
import type { VoyputDb } from "../../db/db";
import {
	restoreStays,
	staysAfterEvidenceChange,
} from "../trips/evidenceChange";
import { type ReviewView, viewFromStored } from "./queue";

/** Fields of a stamp the user edits on Review. */
export type StampEdit = Partial<
	Pick<
		Stamp,
		| "direction"
		| "borderCrossing"
		| "date"
		| "country"
		| "countryCode"
		| "location"
		| "reviewed"
	>
>;

/**
 * Which edited field fixes which part of a stamp's `problem`. The parser joins its
 * warnings with "; ": date checks start with "date ", unreadable fields with
 * "unreadable <field>".
 */
const FIXED_BY: { part: RegExp; fields: (keyof StampEdit)[] }[] = [
	{ part: /^(date |unreadable date\b)/, fields: ["date"] },
	{ part: /^unreadable direction\b/, fields: ["direction"] },
	{ part: /^unreadable country code\b/, fields: ["countryCode", "country"] },
];

/** Splits a stored `problem` into its warnings. */
export const problemParts = (problem: string | null): string[] =>
	(problem ?? "")
		.split("; ")
		.map((part) => part.trim())
		.filter(Boolean);

/**
 * The problem left after an edit: the user set those fields by looking at the
 * photo, so warnings about them go: a user-edited field counts as checked.
 */
export function problemAfterEdit(
	problem: string | null,
	edit: StampEdit,
): string | null {
	const left = problemParts(problem).filter(
		(part) =>
			!FIXED_BY.some(
				(rule) =>
					rule.part.test(part) && rule.fields.some((field) => field in edit),
			),
	);
	return left.length ? left.join("; ") : null;
}

/** Fields that place a stamp in a stay: changing one marks its stays. */
const STAY_FIELDS = [
	"date",
	"countryCode",
	"direction",
	"borderCrossing",
	"reviewed",
] as const;

/**
 * Saves only the edited fields, so two quick saves never undo each other. The
 * first date change also keeps the old date as `readDate`. Stays built on the
 * stamp are marked when its date, country, direction, crossing or review
 * changes.
 */
export async function updateStamp(
	db: VoyputDb,
	id: string,
	edit: StampEdit,
): Promise<void> {
	await db.transaction("rw", db.stamps, db.stays, async () => {
		const stamp = await db.stamps.get(id);
		if (!stamp) return;
		const problem = problemAfterEdit(stamp.problem, edit);
		// The first date change keeps the date as read, for the strip's reset.
		const keepRead =
			"date" in edit && edit.date !== stamp.date && stamp.readDate === undefined
				? { readDate: stamp.date }
				: {};
		await db.stamps.update(id, {
			...edit,
			...keepRead,
			...(problem === stamp.problem ? {} : { problem }),
		});
		if (STAY_FIELDS.some((f) => f in edit && edit[f] !== stamp[f]))
			await staysAfterEvidenceChange(db, { changedStamps: new Set([id]) });
	});
}

/** Hides or shows one warning, on the stored record. */
export async function setDismissed(
	db: VoyputDb,
	id: string,
	kind: NoteKind,
	dismissed: boolean,
): Promise<void> {
	await db.transaction("rw", db.stamps, async () => {
		const stamp = await db.stamps.get(id);
		if (!stamp) return;
		const { [kind]: _, ...rest } = stamp.dismissed ?? {};
		await db.stamps.put({
			...stamp,
			dismissed: dismissed ? { ...rest, [kind]: true } : rest,
		});
	});
}

/** Deletes the stamp and marks the stays built on it; returns those stays as they were, for Undo. */
export async function deleteStamp(
	db: VoyputDb,
	stamp: Stamp,
): Promise<TravelStay[]> {
	return db.transaction("rw", db.stamps, db.stays, async () => {
		await db.stamps.delete(stamp.id);
		return staysAfterEvidenceChange(db, {
			removedStamps: new Set([stamp.id]),
		});
	});
}

/** Puts a deleted stamp back as it was, with the stays its delete changed. */
export async function restoreStamp(
	db: VoyputDb,
	stamp: Stamp,
	stays: readonly TravelStay[] = [],
): Promise<void> {
	await db.transaction("rw", db.stamps, db.stays, async () => {
		await db.stamps.put(stamp);
		await restoreStays(db, stays);
	});
}

export async function addManualStamp(
	db: VoyputDb,
	photo: { id: string; passportId: string },
): Promise<void> {
	await db.stamps.add({
		id: crypto.randomUUID(),
		passportId: photo.passportId,
		photoId: photo.id,
		direction: "unknown",
		borderCrossing: "unknown",
		dateText: "",
		date: null,
		country: null,
		countryCode: null,
		location: null,
		confidence: null,
		notes: "",
		problem: null,
		source: "manual",
		reviewed: false,
	});
}

/** Stores a stamp a rescan found. */
export async function addFoundStamp(
	db: VoyputDb,
	photo: { id: string; passportId: string },
	found: ReadStamp,
): Promise<void> {
	await db.stamps.add({
		...found,
		notes: found.notes || "Added from an AI rescan.",
		id: crypto.randomUUID(),
		passportId: photo.passportId,
		photoId: photo.id,
		source: "ai",
		reviewed: false,
	});
}

export async function setPhotoRotation(
	db: VoyputDb,
	photoId: string,
	rotation: Rotation,
): Promise<void> {
	await db.photos.update(photoId, { rotation });
}

/** What the review section remembers between visits. */
export interface ReviewUiState {
	/** Pages shown in the photo strip. */
	filter: ReviewView;
	/** Days shown at once on the timeline. */
	timelineWindowDays: number;
}

export const TIMELINE_WINDOWS = [30, 90, 180, 365] as const;
const UI_KEY = "review:ui";
export const DEFAULT_UI_STATE: ReviewUiState = {
	filter: "attention",
	timelineWindowDays: 90,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

export async function loadUiState(db: VoyputDb): Promise<ReviewUiState> {
	const value = (await db.kv.get(UI_KEY))?.value;
	if (!isRecord(value)) return DEFAULT_UI_STATE;
	const filter = viewFromStored(value.filter);
	const days = TIMELINE_WINDOWS.find((d) => d === value.timelineWindowDays);
	return {
		filter: filter ?? DEFAULT_UI_STATE.filter,
		timelineWindowDays: days ?? DEFAULT_UI_STATE.timelineWindowDays,
	};
}

export async function saveUiState(
	db: VoyputDb,
	state: ReviewUiState,
): Promise<void> {
	await db.kv.put({ key: UI_KEY, value: state });
}
