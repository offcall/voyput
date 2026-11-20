import { haversineKm } from "../viz/geo";
import type { LocationRow } from "./types";

/** Rows this close (and in the same second) without both uuids are one photo. */
export const SAME_PLACE_KM = 0.05;

/** The parser made this uuid from date, position and file: the CSV had none. */
export const hasExportUuid = (row: LocationRow): boolean =>
	!row.uuid.startsWith(`${row.date}|`);

/** The UTC second of the row's date; the date text where it does not parse. */
function secondOf(row: LocationRow): string {
	const ms = Date.parse(row.date);
	return Number.isNaN(ms)
		? row.date.slice(0, 19)
		: String(Math.floor(ms / 1000));
}

export interface LocationMerge {
	/** Incoming rows that are not stored yet. */
	added: LocationRow[];
	/** Incoming rows already stored, or repeated in the file. */
	duplicates: number;
	/** The stored uuid of every incoming row, new or already there. */
	uuids: string[];
}

/**
 * Splits incoming rows into new ones and ones already stored. A row is
 * already stored when a stored row has its uuid, or, unless both rows came
 * with a uuid, was taken in the same UTC second within `SAME_PLACE_KM`.
 * Within the file only the uuid counts: two photos in one burst stay two.
 */
export function mergeLocations(
	stored: readonly LocationRow[],
	incoming: readonly LocationRow[],
): LocationMerge {
	const byUuid = new Set(stored.map((row) => row.uuid));
	const bySecond = new Map<string, LocationRow[]>();
	for (const row of stored) {
		const key = secondOf(row);
		const rows = bySecond.get(key);
		if (rows) rows.push(row);
		else bySecond.set(key, [row]);
	}
	const added: LocationRow[] = [];
	const uuids: string[] = [];
	const seen = new Set<string>();
	let duplicates = 0;
	for (const row of incoming) {
		if (seen.has(row.uuid)) {
			duplicates++;
			continue;
		}
		seen.add(row.uuid);
		if (byUuid.has(row.uuid)) {
			duplicates++;
			uuids.push(row.uuid);
			continue;
		}
		const match = bySecond
			.get(secondOf(row))
			?.find(
				(other) =>
					!(hasExportUuid(other) && hasExportUuid(row)) &&
					haversineKm(other.lat, other.lon, row.lat, row.lon) <= SAME_PLACE_KM,
			);
		if (match) {
			duplicates++;
			uuids.push(match.uuid);
			continue;
		}
		added.push(row);
		uuids.push(row.uuid);
	}
	return { added, duplicates, uuids };
}
