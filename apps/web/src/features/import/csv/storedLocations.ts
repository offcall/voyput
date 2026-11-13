import { type LocationSummary, summarizeLocations } from "@voyput/core";
import type { VoyputDb } from "../../../db/db";
import { DEMO_LOCATION_PREFIX } from "../../demo/loadDemo";

export interface StoredLocations extends LocationSummary {
	/** Distinct non-empty cities, counted per country. */
	cityCount: number;
	/** Rows that came with the demo data, included in the counts. */
	demoCount: number;
	/** Countries by number of locations, most first. */
	countries: { code: string; name: string; rows: number }[];
	/** Locations per month (or per year for long histories), oldest first, gaps included. */
	periods: LocationPeriod[];
}

export interface LocationPeriod {
	/** "YYYY-MM", or "YYYY" when bucketed by year. */
	key: string;
	rows: number;
	/** Locations per country in this period, most first. */
	countries: { code: string; rows: number }[];
}

/** Above this many months the strip shows one bar per year. */
const MAX_MONTH_BARS = 96;

function monthKeys(first: string, last: string): string[] {
	const keys: string[] = [];
	let year = Number(first.slice(0, 4));
	let month = Number(first.slice(5, 7));
	const end = last.slice(0, 7);
	for (;;) {
		const key = `${year}-${String(month).padStart(2, "0")}`;
		keys.push(key);
		if (key >= end) return keys;
		month++;
		if (month > 12) {
			month = 1;
			year++;
		}
	}
}

/** Buckets rows by month (by year when the span is long); empty periods stay as zero bars. */
export function locationPeriods(
	rows: readonly { date: string; countryCode: string }[],
	firstDay: string | null,
	lastDay: string | null,
): LocationPeriod[] {
	if (!firstDay || !lastDay) return [];
	let keys = monthKeys(firstDay, lastDay);
	const byYear = keys.length > MAX_MONTH_BARS;
	if (byYear) keys = [...new Set(keys.map((key) => key.slice(0, 4)))];
	const length = byYear ? 4 : 7;
	const buckets = new Map(
		keys.map((key) => [key, new Map<string, number>()] as const),
	);
	for (const row of rows) {
		const bucket = buckets.get(row.date.slice(0, length));
		if (bucket)
			bucket.set(row.countryCode, (bucket.get(row.countryCode) ?? 0) + 1);
	}
	return keys.map((key) => {
		const countries = [...(buckets.get(key) ?? new Map<string, number>())]
			.map(([code, count]) => ({ code, rows: count }))
			.sort((a, b) => b.rows - a.rows || a.code.localeCompare(b.code));
		return {
			key,
			rows: countries.reduce((sum, country) => sum + country.rows, 0),
			countries,
		};
	});
}

/** What the location table holds now. */
export async function summarizeStoredLocations(
	db: VoyputDb,
): Promise<StoredLocations> {
	const rows = await db.locations.toArray();
	const cities = new Set(
		rows.flatMap((row) => (row.city ? [`${row.countryCode}|${row.city}`] : [])),
	);
	const countries = new Map<
		string,
		{ code: string; name: string; rows: number }
	>();
	for (const row of rows) {
		const entry = countries.get(row.countryCode) ?? {
			code: row.countryCode,
			name: row.country || row.countryCode,
			rows: 0,
		};
		entry.rows++;
		countries.set(row.countryCode, entry);
	}
	const summary = summarizeLocations(rows);
	return {
		...summary,
		periods: locationPeriods(rows, summary.firstDay, summary.lastDay),
		cityCount: cities.size,
		demoCount: rows.filter((row) => row.uuid.startsWith(DEMO_LOCATION_PREFIX))
			.length,
		countries: [...countries.values()].sort(
			(a, b) => b.rows - a.rows || a.code.localeCompare(b.code),
		),
	};
}
