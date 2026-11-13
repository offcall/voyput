import {
	buildDayRuns,
	buildPhotoIndex,
	type DayRun,
	type Passport,
	type PhotoExtraction,
	type PhotoIndex,
	type Stamp,
} from "@voyput/core";
import { useCallback, useMemo } from "react";
import { useDb } from "../../db/DbContext";
import type { PhotoRecord } from "../../db/db";
import {
	type LiveQueryResult,
	useLiveQuery,
} from "../import/photos/useLiveQuery";

export interface ReviewRecords {
	passports: Passport[];
	/** Ordered by passport, then by name. */
	photos: PhotoRecord[];
	stamps: Stamp[];
	/** Last extraction per photo id; a photo never sent to the AI has none. */
	extractions: Map<string, PhotoExtraction>;
}

/** Passports, photos and stamps, kept current as the database changes. */
export function useReviewRecords(): LiveQueryResult<ReviewRecords> {
	const db = useDb();
	const query = useCallback(async (): Promise<ReviewRecords> => {
		const [passports, photos, stamps, extractions] = await Promise.all([
			db.passports.toArray(),
			db.photos.toArray(),
			db.stamps.toArray(),
			db.extractions.toArray(),
		]);
		passports.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		const order = new Map(passports.map((p, i) => [p.id, i]));
		photos.sort(
			(a, b) =>
				(order.get(a.passportId) ?? 0) - (order.get(b.passportId) ?? 0) ||
				a.name.localeCompare(b.name, undefined, { numeric: true }),
		);
		return {
			passports,
			photos,
			stamps,
			extractions: new Map(extractions.map((e) => [e.photoId, e])),
		};
	}, [db]);
	return useLiveQuery(query);
}

export interface LocationHistory {
	index: PhotoIndex;
	dayRuns: DayRun[];
}

/** The location history as a sorted index; read apart from stamps so edits do not reload 30k rows. */
export function useLocationHistory(): LiveQueryResult<LocationHistory> {
	const db = useDb();
	const query = useCallback(() => db.locations.toArray(), [db]);
	const { data: rows, error } = useLiveQuery(query);
	const data = useMemo(() => {
		if (!rows) return undefined;
		const index = buildPhotoIndex(rows);
		return { index, dayRuns: buildDayRuns(index) };
	}, [rows]);
	return { data, error };
}
