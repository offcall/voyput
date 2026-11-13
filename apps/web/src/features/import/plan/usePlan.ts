import { isCountryCode } from "@voyput/core";
import { useCallback } from "react";
import { useDb } from "../../../db/DbContext";
import { HOME_KEY } from "../../trips/tripStore";
import { useLiveQuery } from "../photos/useLiveQuery";
import { buildPlan, type Plan } from "./planProgress";

/** The Collect plan, kept up to date with the database. */
export function usePlan(): Plan | undefined {
	const db = useDb();
	return useLiveQuery(
		useCallback(async () => {
			const [
				passports,
				photos,
				locations,
				locationCountries,
				extracted,
				failed,
				stamps,
				toReview,
				problems,
				trips,
				home,
			] = await Promise.all([
				db.passports.count(),
				db.photos.count(),
				db.locations.count(),
				db.locations.orderBy("countryCode").uniqueKeys(),
				db.extractions.filter((e) => e.status === "ok").count(),
				db.extractions.filter((e) => e.status === "failed").count(),
				db.stamps.count(),
				db.stamps.filter((stamp) => !stamp.reviewed).count(),
				// Same rule as trip evidence: a warning counts until it is fixed or hidden.
				db.stamps
					.filter((stamp) => !!stamp.problem && !stamp.dismissed?.problem)
					.count(),
				db.trips.toArray(),
				db.kv.get(HOME_KEY),
			]);
			return buildPlan({
				passports,
				photos,
				locations,
				locationCountries: locationCountries.filter(isCountryCode),
				extracted,
				failed,
				stamps,
				toReview,
				problems,
				trips,
				home: isCountryCode(home?.value) ? home.value : null,
			});
		}, [db]),
	).data;
}
