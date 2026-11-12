import type { LocationRow } from "../locations/types";
import { dayNumber } from "./days";

/** Location rows sorted by day, as parallel arrays for binary search over 30k+ rows. */
export interface PhotoIndex {
	days: Int32Array;
	countryCodes: string[];
	filenames: string[];
	/** Country name per code, as the export wrote it. */
	countryNames: Map<string, string>;
}

/** Days come from the export's local date, so a photo counts on the day it was taken there. */
export const buildPhotoIndex = (rows: readonly LocationRow[]): PhotoIndex => {
	const entries: { day: number; code: string; filename: string }[] = [];
	const countryNames = new Map<string, string>();
	for (const row of rows) {
		const code = row.countryCode.trim().toUpperCase();
		const day = dayNumber(row.date);
		if (!code || day === null) continue;
		entries.push({ day, code, filename: row.filename });
		if (row.country && !countryNames.has(code))
			countryNames.set(code, row.country);
	}
	entries.sort((a, b) => a.day - b.day);
	return {
		days: Int32Array.from(entries, (entry) => entry.day),
		countryCodes: entries.map((entry) => entry.code),
		filenames: entries.map((entry) => entry.filename),
		countryNames,
	};
};

/** Country name for a code, falling back to the code itself. */
export const countryLabel = (index: PhotoIndex, code: string): string =>
	index.countryNames.get(code) ?? code;
