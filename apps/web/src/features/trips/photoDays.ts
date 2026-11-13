import type { LocationRow } from "@voyput/core";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CC_RE = /^[A-Z]{2}$/;

/** Local calendar day of a photo, as in core's trip suggestions. */
function locationDay(row: LocationRow): string | null {
	const day = row.date.slice(0, 10);
	return DAY_RE.test(day) && CC_RE.test(row.countryCode) ? day : null;
}

export interface DayCountry {
	countryCode: string;
	country: string;
	photos: number;
}

/** Photos per day and country, in the order countries first appear that day. */
export type PhotoDays = ReadonlyMap<string, readonly DayCountry[]>;

export function buildPhotoDays(locations: readonly LocationRow[]): PhotoDays {
	const days = new Map<string, DayCountry[]>();
	const sorted = [...locations].sort((a, b) => a.date.localeCompare(b.date));
	for (const row of sorted) {
		const day = locationDay(row);
		if (!day) continue;
		let list = days.get(day);
		if (!list) {
			list = [];
			days.set(day, list);
		}
		const hit = list.find((c) => c.countryCode === row.countryCode);
		if (hit) hit.photos++;
		else
			list.push({
				countryCode: row.countryCode,
				country: row.country || row.countryCode,
				photos: 1,
			});
	}
	return days;
}
