import type { LocationSummary } from "@voyput/core";

/** "2,467 locations · 6 countries · 2016–2019": what a location import holds, in one line. */
export function locationLine(summary: LocationSummary): string {
	const parts = [
		`${summary.rowCount.toLocaleString("en")} ${summary.rowCount === 1 ? "location" : "locations"}`,
		`${summary.countryCount} ${summary.countryCount === 1 ? "country" : "countries"}`,
	];
	if (summary.firstDay && summary.lastDay) {
		const first = summary.firstDay.slice(0, 4);
		const last = summary.lastDay.slice(0, 4);
		parts.push(first === last ? first : `${first}–${last}`);
	}
	return parts.join(" · ");
}

/** id of the stored-locations summary on the Import page. */
export const STORED_LOCATIONS_ID = "stored-locations";

/** Brings the stored-locations summary into view and focus, after an import or a demo load. */
export function focusStoredLocations(): void {
	const target = document.getElementById(STORED_LOCATIONS_ID);
	if (!target) return;
	target.focus({ preventScroll: true });
	const reduce = window.matchMedia?.(
		"(prefers-reduced-motion: reduce)",
	).matches;
	target.scrollIntoView?.({
		block: "start",
		behavior: reduce ? "auto" : "smooth",
	});
}
