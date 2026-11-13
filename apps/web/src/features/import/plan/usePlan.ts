import { isCountryCode } from "@voyput/core";
import { useCallback } from "react";
import { useDb } from "../../../db/DbContext";
import type { VoyputDb } from "../../../db/db";
import { useLiveQuery } from "../photos/useLiveQuery";
import { buildPlan, type Plan } from "./planProgress";

/** Set once Visualize is opened while saved trips exist; ticks the last plan step. */
const VISUALIZED_KEY = "plan:visualized";
/** The home country the Trips page stores (`features/trips/tripStore.ts`). */
const HOME_KEY = "trips:home";

/** Marks the Visualize step done, if there are saved trips to look at. */
export async function markVisualized(db: VoyputDb): Promise<void> {
	await db.transaction("rw", db.trips, db.kv, async () => {
		if ((await db.kv.get(VISUALIZED_KEY))?.value === true) return;
		if ((await db.trips.count()) === 0) return;
		await db.kv.put({ key: VISUALIZED_KEY, value: true });
	});
}

/** The plan card's data, kept up to date with the database. */
export function usePlan(): Plan | undefined {
	const db = useDb();
	return useLiveQuery(
		useCallback(async () => {
			const [photos, extracted, stamps, toReview, trips, home, visualized] =
				await Promise.all([
					db.photos.count(),
					db.extractions.filter((e) => e.status === "ok").count(),
					db.stamps.count(),
					db.stamps.filter((stamp) => !stamp.reviewed).count(),
					db.trips.toArray(),
					db.kv.get(HOME_KEY),
					db.kv.get(VISUALIZED_KEY),
				]);
			return buildPlan({
				photos,
				extracted,
				stamps,
				toReview,
				trips,
				home: isCountryCode(home?.value) ? home.value : null,
				visualized: visualized?.value === true,
			});
		}, [db]),
	).data;
}
