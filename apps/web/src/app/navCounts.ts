import { useCallback } from "react";
import { useDb } from "../db/DbContext";
import { useLiveQuery } from "../features/import/photos/useLiveQuery";

export interface NavCounts {
	/** Photos stored. */
	photos: number;
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
			const [photoIds, okIds, toReview, trips] = await Promise.all([
				db.photos.toCollection().primaryKeys(),
				db.extractions
					.filter((extraction) => extraction.status === "ok")
					.primaryKeys(),
				db.stamps.filter((stamp) => !stamp.reviewed).count(),
				db.trips.count(),
			]);
			const ok = new Set(okIds);
			return {
				photos: photoIds.length,
				toExtract: photoIds.filter((id) => !ok.has(id)).length,
				toReview,
				trips,
			};
		}, [db]),
	).data;
}
