import {
	checkStamp,
	isCountryCode,
	isIsoDate,
	needsAttention,
	type PhotoIndex,
	type Stamp,
	staySpan,
} from "@voyput/core";
import { useCallback, useMemo } from "react";
import { useLocations } from "../../../data/locations";
import { BIRTH_COUNTRY_KEY, BIRTH_KEY } from "../../../data/profile";
import { useLiveQuery } from "../../../data/useLiveQuery";
import { useDb } from "../../../db/DbContext";
import { useSettings } from "../../../settings/SettingsContext";
import { localToday } from "../../trips/format";
import { buildPlan, type Plan, type PlanStay } from "./planProgress";
import { isSources, SOURCES_KEY } from "./sources";

/**
 * Stamps in the Review queue: unreviewed, or with a warning from the extraction or
 * the photo locations that is still open. Same rule as Review's "Needs attention".
 */
export function countToCheck(
	stamps: readonly Stamp[],
	index: PhotoIndex | undefined,
	windowDays: number,
): number {
	return stamps.filter((stamp) =>
		needsAttention({
			stamp,
			check: index
				? checkStamp(index, stamp, windowDays)
				: { icloudCheck: "", suggestion: "" },
		}),
	).length;
}

/** The Collect plan, kept up to date with the database. */
export function usePlan(): Plan | undefined {
	const db = useDb();
	const photoLocations = useLocations();
	const { settings } = useSettings();
	const base = useLiveQuery(
		useCallback(async () => {
			const [
				passports,
				photos,
				locations,
				locationCountries,
				extracted,
				failedIds,
				recoveredIds,
				stampRows,
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
				db.stamps.toArray(),
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
			return {
				stampRows,
				input: {
					sources: isSources(sources?.value) ? sources.value : null,
					passports,
					photos,
					locations,
					locationCountries: locationCountries.filter(isCountryCode),
					extracted: extracted + recovered,
					failed: failedIds.length - recovered,
					stamps: stampRows.length,
					problems,
					stays,
					birthCountry: isCountryCode(birthCountry?.value)
						? birthCountry.value
						: null,
				},
			};
		}, [db]),
	).data;
	const index = photoLocations.data?.photoIndex;
	const windowDays = settings.locationWindowDays;
	return useMemo(() => {
		if (!base) return undefined;
		// Wait for the photo locations so the count does not jump once they load.
		if (!photoLocations.data && !photoLocations.error) return undefined;
		return buildPlan({
			...base.input,
			toReview: countToCheck(base.stampRows, index, windowDays),
		});
	}, [base, photoLocations.data, photoLocations.error, index, windowDays]);
}
