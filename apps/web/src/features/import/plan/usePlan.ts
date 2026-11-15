import { isCountryCode, isIsoDate, staySpan } from "@voyput/core";
import { useCallback } from "react";
import { useDb } from "../../../db/DbContext";
import { localToday } from "../../trips/format";
import { BIRTH_COUNTRY_KEY, BIRTH_KEY } from "../../trips/tripStore";
import { useLiveQuery } from "../photos/useLiveQuery";
import { buildPlan, type Plan, type PlanStay } from "./planProgress";
import { isSources, SOURCES_KEY } from "./sources";

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
				stored,
				birthCountry,
				birth,
				sources,
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
				db.kv.get(BIRTH_COUNTRY_KEY),
				db.kv.get(BIRTH_KEY),
				db.kv.get(SOURCES_KEY),
			]);
			const born =
				typeof birth?.value === "string" && isIsoDate(birth.value)
					? birth.value
					: null;
			const today = localToday();
			const stays = stored.map(
				(s): PlanStay => ({
					countryCode: s.countryCode,
					kind: s.kind,
					...staySpan(s, born, today),
				}),
			);
			// A failed photo whose stamps the user added and reviewed by hand is handled.
			const recovered = failedIds.filter((id) => recoveredIds.has(id)).length;
			return buildPlan({
				sources: isSources(sources?.value) ? sources.value : null,
				passports,
				photos,
				locations,
				locationCountries: locationCountries.filter(isCountryCode),
				extracted: extracted + recovered,
				failed: failedIds.length - recovered,
				stamps,
				toReview,
				problems,
				stays,
				birthCountry: isCountryCode(birthCountry?.value)
					? birthCountry.value
					: null,
			});
		}, [db]),
	).data;
}
