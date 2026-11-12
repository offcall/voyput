import {
	buildDayRuns,
	buildPhotoIndex,
	type DayRun,
	type Passport,
	type PhotoIndex,
	type Stamp,
} from "@voyput/core";
import { useCallback, useMemo } from "react";
import { useDb } from "../../db/DbContext";
import type { PhotoRecord } from "../../db/db";
import { useLiveQuery } from "../import/photos/useLiveQuery";

export interface ReviewRecords {
	passports: Passport[];
	/** Ordered by passport, then by name. */
	photos: PhotoRecord[];
	stamps: Stamp[];
}

/** Passports, photos and stamps, kept current as the database changes. */
export function useReviewRecords(): ReviewRecords | undefined {
	const db = useDb();
	const query = useCallback(async (): Promise<ReviewRecords> => {
		const [passports, photos, stamps] = await Promise.all([
			db.passports.toArray(),
			db.photos.toArray(),
			db.stamps.toArray(),
		]);
		passports.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		const order = new Map(passports.map((p, i) => [p.id, i]));
		photos.sort(
			(a, b) =>
				(order.get(a.passportId) ?? 0) - (order.get(b.passportId) ?? 0) ||
				a.name.localeCompare(b.name, undefined, { numeric: true }),
		);
		return { passports, photos, stamps };
	}, [db]);
	return useLiveQuery(query).data;
}

export interface LocationHistory {
	index: PhotoIndex;
	dayRuns: DayRun[];
}

/** The location history as a sorted index; read apart from stamps so edits do not reload 30k rows. */
export function useLocationHistory(): LocationHistory | undefined {
	const db = useDb();
	const query = useCallback(() => db.locations.toArray(), [db]);
	const rows = useLiveQuery(query).data;
	return useMemo(() => {
		if (!rows) return undefined;
		const index = buildPhotoIndex(rows);
		return { index, dayRuns: buildDayRuns(index) };
	}, [rows]);
}
