import type { Stamp } from "../stamps/types";
import type { StampCheck } from "./checks";

export type ReviewFilter =
	| "all"
	| "problem"
	| "icloud"
	| "empty"
	| "unreviewed"
	| "reviewed";

export type Severity = "critical" | "warning" | "ok";

/** A stamp with what the location history says about it. */
export interface CheckedStamp {
	stamp: Stamp;
	check: StampCheck;
	/**
	 * Another stay at the same time as this stamp's stay (core `findConflicts`),
	 * as text for the user; missing or empty when there is none. It is a problem
	 * (critical, so the stamp needs attention) and goes away once a date or
	 * direction is fixed.
	 */
	overlap?: string;
}

export const hasOpenProblem = ({ stamp }: CheckedStamp): boolean =>
	Boolean(stamp.problem) && !stamp.dismissed?.problem;

export const hasOpenIcloudCheck = ({ stamp, check }: CheckedStamp): boolean =>
	Boolean(check.icloudCheck) && !stamp.dismissed?.icloudCheck;

/** Only warnings the user has not dismissed count; an overlap cannot be dismissed. */
export const severity = (item: CheckedStamp): Severity =>
	hasOpenProblem(item) || item.overlap
		? "critical"
		: hasOpenIcloudCheck(item)
			? "warning"
			: "ok";

/**
 * A stamp in the Review queue: not reviewed yet, or with a warning the user has
 * not fixed or marked as fine (a check from the extraction or the photo
 * locations), or in a stay that overlaps another.
 */
export const needsAttention = (item: CheckedStamp): boolean =>
	!item.stamp.reviewed || severity(item) !== "ok";

export const photoSeverity = (items: readonly CheckedStamp[]): Severity =>
	items.some((item) => severity(item) === "critical")
		? "critical"
		: items.some((item) => severity(item) === "warning")
			? "warning"
			: "ok";

/** Does a photo with these stamps belong in the list under `filter`? */
export const photoMatches = (
	items: readonly CheckedStamp[],
	filter: ReviewFilter,
): boolean => {
	switch (filter) {
		case "all":
			return true;
		case "empty":
			return items.length === 0;
		case "problem":
			return items.some(
				(item) => hasOpenProblem(item) || Boolean(item.overlap),
			);
		case "icloud":
			return items.some(hasOpenIcloudCheck);
		case "unreviewed":
			return items.some((item) => !item.stamp.reviewed);
		case "reviewed":
			return items.length > 0 && items.every((item) => item.stamp.reviewed);
	}
};
