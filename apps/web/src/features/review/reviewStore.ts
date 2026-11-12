import {
	type NoteKind,
	REVIEW_FILTERS,
	type ReadStamp,
	type ReviewFilter,
	type Rotation,
	type Stamp,
} from "@voyput/core";
import type { VoyputDb } from "../../db/db";

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
 * Saves only the edited fields, so two quick saves never undo each other.
 * The user set the date by looking at the photo, so a date edit clears the
 * date check's problem (user-edited stamps are trusted).
 */
export async function updateStamp(
	db: VoyputDb,
	id: string,
	edit: StampEdit,
): Promise<void> {
	await db.stamps.update(
		id,
		"date" in edit ? { ...edit, problem: null } : edit,
	);
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

export async function deleteStamp(db: VoyputDb, stamp: Stamp): Promise<void> {
	await db.stamps.delete(stamp.id);
}

/** Puts a deleted stamp back as it was. */
export async function restoreStamp(db: VoyputDb, stamp: Stamp): Promise<void> {
	await db.stamps.put(stamp);
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
	filter: ReviewFilter;
	/** Days shown at once on the timeline. */
	timelineWindowDays: number;
}

export const TIMELINE_WINDOWS = [30, 90, 180, 365] as const;
const UI_KEY = "review:ui";
export const DEFAULT_UI_STATE: ReviewUiState = {
	filter: "all",
	timelineWindowDays: 90,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

export async function loadUiState(db: VoyputDb): Promise<ReviewUiState> {
	const value = (await db.kv.get(UI_KEY))?.value;
	if (!isRecord(value)) return DEFAULT_UI_STATE;
	const filter = REVIEW_FILTERS.find((f) => f === value.filter);
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
