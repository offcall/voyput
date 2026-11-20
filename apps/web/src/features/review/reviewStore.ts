import {
	isValidDate,
	type NoteKind,
	type ReadStamp,
	type Rotation,
	type Stamp,
} from "@voyput/core";
import {
	restoreStays,
	STAY_FIELDS,
	type StaysUndo,
	staysAfterEvidenceChange,
} from "../../data/evidenceChange";
import type { VoyputDb } from "../../db/db";
import { type ReviewView, viewFromStored } from "./queue";
import { hasOpenProblem } from "./stays";

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
 * Which edit fixes which part of a stamp's `problem`. The parser joins its
 * warnings with "; ": date checks start with "date " or "implausible date",
 * unreadable fields with "unreadable <field>". Only a real value fixes one: clearing a field does not.
 */
const FIXED_BY: { part: RegExp; fixes: (edit: StampEdit) => boolean }[] = [
	{
		part: /^(date |unreadable date\b|implausible date\b)/,
		fixes: (edit) => typeof edit.date === "string" && isValidDate(edit.date),
	},
	{
		part: /^unreadable direction\b/,
		fixes: (edit) => edit.direction === "entry" || edit.direction === "exit",
	},
	{
		part: /^unreadable country code\b/,
		fixes: (edit) =>
			typeof edit.countryCode === "string" &&
			/^[A-Z]{2}$/.test(edit.countryCode),
	},
];

/**
 * The stamp as stored, past the reading hook that shows an implausible date as
 * none (ADR 0044). Writes start from it, so they never store the read view.
 */
const storedStamp = (db: VoyputDb, id: string): Promise<Stamp | undefined> =>
	db.stamps.where("id").equals(id).raw().first();

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
			!FIXED_BY.some((rule) => rule.part.test(part) && rule.fixes(edit)),
	);
	return left.length ? left.join("; ") : null;
}

/**
 * Saves only the edited fields, so two quick saves never undo each other. The
 * first date change also keeps the stored date as `readDate`. Stays built on
 * the stamp are marked when its date, country, direction, crossing or review
 * changes, or when the stamp's problem opens or closes.
 */
export async function updateStamp(
	db: VoyputDb,
	id: string,
	edit: StampEdit,
): Promise<void> {
	await db.transaction("rw", db.stamps, db.stays, async () => {
		const stamp = await db.stamps.get(id);
		const stored = await storedStamp(db, id);
		if (!stamp || !stored) return;
		const problem = problemAfterEdit(stored.problem, edit);
		// The first date change keeps the date as read, for the strip's reset.
		const keepRead =
			"date" in edit &&
			edit.date !== stored.date &&
			stored.readDate === undefined
				? { readDate: stored.date }
				: {};
		await db.stamps.update(id, {
			...edit,
			...keepRead,
			...(problem === stored.problem ? {} : { problem }),
		});
		const after = await db.stamps.get(id);
		if (
			STAY_FIELDS.some((f) => f in edit && edit[f] !== stamp[f]) ||
			(after && hasOpenProblem(stamp) !== hasOpenProblem(after))
		)
			await staysAfterEvidenceChange(db, { changedStamps: new Set([id]) });
	});
}

/**
 * Hides or shows one warning, on the stored record: only `dismissed` is
 * written. Stays built on the stamp are marked when that makes its problem
 * count or stop counting.
 */
export async function setDismissed(
	db: VoyputDb,
	id: string,
	kind: NoteKind,
	dismissed: boolean,
): Promise<void> {
	await db.transaction("rw", db.stamps, db.stays, async () => {
		const stamp = await db.stamps.get(id);
		const stored = await storedStamp(db, id);
		if (!stamp || !stored) return;
		const { [kind]: _, ...rest } = stored.dismissed ?? {};
		await db.stamps.update(id, {
			dismissed: dismissed ? { ...rest, [kind]: true } : rest,
		});
		const after = await db.stamps.get(id);
		if (after && hasOpenProblem(stamp) !== hasOpenProblem(after))
			await staysAfterEvidenceChange(db, { changedStamps: new Set([id]) });
	});
}

/** What Undo needs to take a delete back: the stamp as stored, and the stays the delete changed. */
export interface StampUndo {
	stamp: Stamp;
	stays: StaysUndo;
}

/** Deletes the stamp and marks the stays built on it; returns what Undo needs to take that back. */
export async function deleteStamp(
	db: VoyputDb,
	stamp: Stamp,
): Promise<StampUndo | null> {
	return db.transaction("rw", db.stamps, db.stays, async () => {
		const stored = await storedStamp(db, stamp.id);
		if (!stored) return null;
		await db.stamps.delete(stamp.id);
		const stays = await staysAfterEvidenceChange(db, {
			removedStamps: new Set([stamp.id]),
		});
		return { stamp: stored, stays };
	});
}

/** Puts a deleted stamp back as it was stored, with the stays its delete changed. */
export async function restoreStamp(
	db: VoyputDb,
	{ stamp, stays }: StampUndo,
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
