import { isCountryCode } from "@voyput/core";
import { useCallback } from "react";
import { VISUALIZED_KEY } from "../../../app/planStore";
import { useDb } from "../../../db/DbContext";
import { HOME_KEY } from "../../trips/tripStore";
import { useLiveQuery } from "../photos/useLiveQuery";
import { buildPlan, type Plan } from "./planProgress";

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
