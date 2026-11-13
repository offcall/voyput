import { deriveTrips, isCountryCode, sortStays } from "@voyput/core";
import { useCallback } from "react";
import { useDb } from "../../../db/DbContext";
import { HOME_KEY, homeFor } from "../../trips/tripStore";
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
				failedIds,
				recoveredIds,
				stamps,
				toReview,
				problems,
				stays,
				picked,
			] = await Promise.all([
				db.passports.count(),
				db.photos.count(),
				db.locations.count(),
				db.locations.orderBy("countryCode").uniqueKeys(),
				db.extractions.filter((e) => e.status === "ok").count(),
				db.extractions.filter((e) => e.status === "failed").primaryKeys(),
				db.stamps
					.filter((stamp) => stamp.source === "manual" && stamp.reviewed)
					.toArray()
					.then((manual) => new Set(manual.map((stamp) => stamp.photoId))),
				db.stamps.count(),
				db.stamps.filter((stamp) => !stamp.reviewed).count(),
				// Same rule as trip evidence: a warning counts until it is fixed or hidden.
				db.stamps
					.filter((stamp) => !!stamp.problem && !stamp.dismissed?.problem)
					.count(),
				db.stays.toArray(),
				db.kv.get(HOME_KEY),
			]);
			const history = sortStays(stays);
			const home = homeFor(
				{ pickedHome: isCountryCode(picked?.value) ? picked.value : null },
				history,
			);
			// A failed photo whose stamps the user added and reviewed by hand is handled.
			const recovered = failedIds.filter((id) => recoveredIds.has(id)).length;
			return buildPlan({
				passports,
				photos,
				locations,
				locationCountries: locationCountries.filter(isCountryCode),
				extracted: extracted + recovered,
				failed: failedIds.length - recovered,
				stamps,
				toReview,
				problems,
				trips: deriveTrips(history, home),
				home,
			});
		}, [db]),
	).data;
}
