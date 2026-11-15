import {
	type CheckedStamp,
	photoMatches,
	type ReviewFilter,
	severity,
} from "@voyput/core";

/**
 * A stamp in the Review queue: not reviewed yet, or with a warning the user has
 * not fixed or marked as fine (a check from the extraction or the photo locations).
 */
export const needsAttention = (item: CheckedStamp): boolean =>
	!item.stamp.reviewed || severity(item) !== "ok";

/** Which pages the photo strip shows; one select on Review. The core filters plus "needs attention". */
export type ReviewView = "attention" | ReviewFilter;

export const REVIEW_VIEWS: readonly ReviewView[] = [
	"attention",
	"problem",
	"icloud",
	"all",
	"unreviewed",
	"reviewed",
	"empty",
];

export const isReviewView = (value: unknown): value is ReviewView =>
	(REVIEW_VIEWS as readonly unknown[]).includes(value);

/** A stored view, or null for anything unknown. */
export const viewFromStored = (value: unknown): ReviewView | null =>
	isReviewView(value) ? value : null;

/** Does a page with these stamps show in `view`? */
export const pageInView = (
	items: readonly CheckedStamp[],
	view: ReviewView,
): boolean =>
	view === "attention" ? items.some(needsAttention) : photoMatches(items, view);

/** Where the user is: a stamp on a page, or a page as a whole. */
export interface QueueCursor {
	photoId: string;
	stampId: string | null;
}

/**
 * The stamps needing attention in page order, each page's stamps in the order
 * they are shown.
 */
export function buildQueue(
	photoIds: readonly string[],
	stampsOf: (photoId: string) => readonly CheckedStamp[],
): CheckedStamp[] {
	return photoIds.flatMap((id) => stampsOf(id).filter(needsAttention));
}

/**
 * The next stamp needing attention after the cursor, across pages, starting over
 * at the top after the last one; null when none is left. A cursor on a page (no
 * stamp) counts as just before that page's first stamp.
 */
export function nextInQueue(
	photoIds: readonly string[],
	stampsOf: (photoId: string) => readonly CheckedStamp[],
	cursor: QueueCursor | null,
): CheckedStamp | null {
	const ordered = photoIds.flatMap((id) => stampsOf(id));
	const queue = ordered.filter(needsAttention);
	const first = queue[0];
	if (!first || !cursor) return first ?? null;
	const at = cursorPosition(photoIds, ordered, cursor);
	const position = new Map(ordered.map((item, i) => [item.stamp.id, i]));
	return (
		queue.find((item) => (position.get(item.stamp.id) ?? -1) > at) ?? first
	);
}

/** The cursor as a place in `ordered`; a page cursor sits half a step before its first stamp. */
function cursorPosition(
	photoIds: readonly string[],
	ordered: readonly CheckedStamp[],
	cursor: QueueCursor,
): number {
	if (cursor.stampId) {
		const i = ordered.findIndex((item) => item.stamp.id === cursor.stampId);
		if (i >= 0) return i;
	}
	const page = photoIds.indexOf(cursor.photoId);
	const pageOf = new Map(photoIds.map((id, i) => [id, i]));
	const firstAfter = ordered.findIndex(
		(item) => (pageOf.get(item.stamp.photoId) ?? -1) >= page,
	);
	return (firstAfter < 0 ? ordered.length : firstAfter) - 0.5;
}
