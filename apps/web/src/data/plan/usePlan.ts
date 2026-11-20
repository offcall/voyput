import {
	checkStamp,
	findConflicts,
	isCountryCode,
	isIsoDate,
	needsAttention,
	type PhotoIndex,
	pairVisits,
	type Stamp,
	staySpan,
} from "@voyput/core";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useDb } from "../../db/DbContext";
import { useSettings } from "../../settings/SettingsContext";
import { useLocations } from "../locations";
import { BIRTH_COUNTRY_KEY, BIRTH_KEY } from "../profile";
import { localToday } from "../today";
import { useLiveQuery } from "../useLiveQuery";
import { buildPlan, type Plan, type PlanStay } from "./planProgress";
import { isSources, SOURCES_KEY } from "./sources";

/**
 * Stamps in the Review queue: unreviewed, with a warning from the extraction or
 * the photo locations that is still open, or in a stay that overlaps another
 * (the stamps Review notes with core `findConflicts`). Same rule as Review's
 * "Needs attention".
 */
export function countToCheck(
	stamps: readonly Stamp[],
	index: PhotoIndex | undefined,
	windowDays: number,
): number {
	const overlapping = new Set(
		findConflicts(pairVisits(stamps), stamps).flatMap(({ first, second }) =>
			[first, second].flatMap((v) => [v.entryStampId, v.exitStampId]),
		),
	);
	return stamps.filter((stamp) =>
		needsAttention({
			stamp,
			check: index
				? checkStamp(index, stamp, windowDays)
				: { icloudCheck: "", suggestion: "" },
			...(overlapping.has(stamp.id) ? { overlap: "overlap" } : {}),
		}),
	).length;
}

const PlanContext = createContext<{ plan: Plan | undefined } | null>(null);

/** Hands the plan the app shell computes to the pages below it. */
export const PlanProvider = PlanContext.Provider;

/** The Collect plan from the app shell; undefined while it loads. */
export function usePlan(): Plan | undefined {
	const shared = useContext(PlanContext);
	if (!shared) throw new Error("usePlan() needs a <PlanProvider> above it");
	return shared.plan;
}

/** The Collect plan, kept up to date with the database: computed once, by the app shell. */
export function useLivePlan(): Plan | undefined {
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
