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
	return {
		...summarizeLocations(rows),
		cityCount: cities.size,
		demoCount: rows.filter((row) => row.uuid.startsWith(DEMO_LOCATION_PREFIX))
			.length,
		countries: [...countries.values()].sort(
			(a, b) => b.rows - a.rows || a.code.localeCompare(b.code),
		),
	};
}
