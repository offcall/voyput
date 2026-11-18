import { hasError, type StayHint } from "./hints";
import type { TravelStay } from "./types";

/**
 * How a stay stands: approved or ready to approve, needs a look, has an
 * error, or its stamps or photos were deleted or edited since it was built.
 */
export type StayStatus = "ok" | "check" | "error" | "changed";

/**
 * The status of each stay, in list order. Changed evidence wins, then an
 * error hint; approved stays and those in `clear` (`clearStayIds`) are ok.
 */
export function stayStatuses(
	stays: readonly TravelStay[],
	hints: readonly (readonly StayHint[])[],
	clear: readonly string[],
): StayStatus[] {
	return stays.map((s, i) =>
		s.evidenceChanged
			? "changed"
			: hasError(hints[i] ?? [])
				? "error"
				: s.approved || clear.includes(s.id)
					? "ok"
					: "check",
	);
}

/**
 * Ids of the stays still to look at one by one, in list order: not approved
 * and not ready, and approved ones that since got an error or changed evidence.
 */
export function stayQueue(
	stays: readonly TravelStay[],
	statuses: readonly StayStatus[],
): string[] {
	return stays.filter((_, i) => statuses[i] !== "ok").map((s) => s.id);
}
