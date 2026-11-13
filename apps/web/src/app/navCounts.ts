import { useCallback } from "react";
import { useDb } from "../db/DbContext";
import { useLiveQuery } from "../features/import/photos/useLiveQuery";

export interface NavCounts {
	/** Photos stored. */
	photos: number;
	/** Location rows stored (CSV and demo). */
	locations: number;
	/** Photos without a successful extraction. */
	toExtract: number;
	/** Stamps not marked reviewed. */
	toReview: number;
	/** Saved trips only; suggestions on the Trips page are not counted. */
	trips: number;
}

/** Small numbers for the navigation, kept up to date with the database. */
export function useNavCounts(): NavCounts | undefined {
	const db = useDb();
	return useLiveQuery(
		useCallback(async () => {
			const [photoIds, locations, okIds, toReview, trips] = await Promise.all([
				db.photos.toCollection().primaryKeys(),
				db.locations.count(),
				db.extractions
					.filter((extraction) => extraction.status === "ok")
					.primaryKeys(),
				db.stamps.filter((stamp) => !stamp.reviewed).count(),
				db.trips.count(),
			]);
			const ok = new Set(okIds);
			return {
				photos: photoIds.length,
				locations,
				toExtract: photoIds.filter((id) => !ok.has(id)).length,
				toReview,
				trips,
			};
		}, [db]),
	).data;
}

const compact = new Intl.NumberFormat("en", {
	notation: "compact",
	maximumFractionDigits: 1,
});

/** "2.5k loc": the stored location count, short enough for the nav. */
export function locationCountLabel(count: number): string {
	return `${compact.format(count).toLowerCase()} loc`;
}
