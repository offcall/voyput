import { type DatedStamp, zoneOf } from "@voyput/core";
import { addDays } from "./format";
import type { PhotoDays } from "./photoDays";

/** A stamp whose zone (country, or the Schengen area) no photo near its date shows. */
export interface StampConflict {
	stamp: DatedStamp;
	/** Countries photographed near the stamp date instead. */
	seen: string[];
}

/** Days before and after a stamp in which a photo may confirm it. */
export const CONFLICT_WINDOW_DAYS = 2;

/**
 * Stamps that disagree with photo locations: photos exist within the window,
 * but none in the stamp's country. Without any photos nothing is claimed.
 */
export function stampConflicts(
	stamps: readonly DatedStamp[],
	photoDays: PhotoDays,
): StampConflict[] {
	return stamps.flatMap((stamp) => {
		const seen = new Set<string>();
		for (let i = -CONFLICT_WINDOW_DAYS; i <= CONFLICT_WINDOW_DAYS; i++)
			for (const c of photoDays.get(addDays(stamp.date, i)) ?? [])
				seen.add(c.countryCode);
		const zone = zoneOf(stamp);
		const sameZone = [...seen].some(
			(countryCode) => zoneOf({ ...stamp, countryCode }) === zone,
		);
		return seen.size === 0 || sameZone
			? []
			: [{ stamp, seen: [...seen].sort() }];
	});
}

/** What is wrong with a trip's stamps. */
export interface TripProblems {
	/** Stamp ids the trip keeps that are gone or no longer usable. */
	missing: string[];
	conflicts: StampConflict[];
}

export function tripProblems(
	stampIds: readonly string[],
	usable: ReadonlyMap<string, DatedStamp>,
	photoDays: PhotoDays,
): TripProblems {
	const linked = stampIds.flatMap((id) => usable.get(id) ?? []);
	return {
		missing: stampIds.filter((id) => !usable.has(id)),
		conflicts: stampConflicts(linked, photoDays),
	};
}

export const problemCount = (p: TripProblems) =>
	p.missing.length + p.conflicts.length;
