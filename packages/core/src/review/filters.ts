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
}

export const hasOpenProblem = ({ stamp }: CheckedStamp): boolean =>
	Boolean(stamp.problem) && !stamp.dismissed?.problem;

export const hasOpenIcloudCheck = ({ stamp, check }: CheckedStamp): boolean =>
	Boolean(check.icloudCheck) && !stamp.dismissed?.icloudCheck;

/** Only warnings the user has not dismissed count. */
export const severity = (item: CheckedStamp): Severity =>
	hasOpenProblem(item)
		? "critical"
		: hasOpenIcloudCheck(item)
			? "warning"
			: "ok";

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
			return items.some(hasOpenProblem);
		case "icloud":
			return items.some(hasOpenIcloudCheck);
		case "unreviewed":
			return items.some((item) => !item.stamp.reviewed);
		case "reviewed":
			return items.length > 0 && items.every((item) => item.stamp.reviewed);
	}
};
