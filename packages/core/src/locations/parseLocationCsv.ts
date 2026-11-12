import { parseCsvRows } from "./csv";
import type { LocationRow } from "./types";

/** Columns a location CSV must have; the others default to empty. */
export const REQUIRED_LOCATION_COLUMNS = [
	"date",
	"lat",
	"lon",
	"country_code",
] as const;

export type LocationCsvResult =
	| { ok: true; rows: LocationRow[]; skipped: number }
	| { ok: false; missingColumns: string[] };

/**
 * Parses the Apple Photos location export. Rows with a bad date or
 * coordinates are counted in `skipped`, not returned.
 */
export function parseLocationCsv(text: string): LocationCsvResult {
	const [header = [], ...body] = parseCsvRows(text);
	const index = new Map(header.map((name, i) => [name.trim(), i]));
	const missingColumns = REQUIRED_LOCATION_COLUMNS.filter(
		(name) => !index.has(name),
	);
	if (missingColumns.length > 0) return { ok: false, missingColumns };

	const cell = (cells: string[], name: string): string => {
		const i = index.get(name);
		return i === undefined ? "" : (cells[i] ?? "").trim();
	};

	const rows: LocationRow[] = [];
	let skipped = 0;
	for (const cells of body) {
		const date = cell(cells, "date");
		const latText = cell(cells, "lat");
		const lonText = cell(cells, "lon");
		const lat = Number(latText);
		const lon = Number(lonText);
		if (
			!date ||
			Number.isNaN(Date.parse(date)) ||
			!latText ||
			!lonText ||
			!(Math.abs(lat) <= 90) ||
			!(Math.abs(lon) <= 180)
		) {
			skipped++;
			continue;
		}
		rows.push({
			date,
			lat,
			lon,
			countryCode: cell(cells, "country_code").toUpperCase(),
			country: cell(cells, "country"),
			city: cell(cells, "city"),
			source: cell(cells, "source"),
			isVideo: /^(true|1)$/i.test(cell(cells, "is_video")),
			filename: cell(cells, "filename"),
			// The database keys rows by uuid; without one, date + position + file is the identity.
			uuid:
				cell(cells, "uuid") ||
				`${date}|${latText}|${lonText}|${cell(cells, "filename")}`,
		});
	}
	return { ok: true, rows, skipped };
}

export interface LocationSummary {
	rowCount: number;
	/** First and last calendar day (YYYY-MM-DD), or null without rows. */
	firstDay: string | null;
	lastDay: string | null;
	countryCount: number;
}

export function summarizeLocations(rows: LocationRow[]): LocationSummary {
	let firstDay: string | null = null;
	let lastDay: string | null = null;
	const countries = new Set<string>();
	for (const row of rows) {
		const day = row.date.slice(0, 10);
		if (firstDay === null || day < firstDay) firstDay = day;
		if (lastDay === null || day > lastDay) lastDay = day;
		if (row.countryCode) countries.add(row.countryCode);
	}
	return {
		rowCount: rows.length,
		firstDay,
		lastDay,
		countryCount: countries.size,
	};
}
