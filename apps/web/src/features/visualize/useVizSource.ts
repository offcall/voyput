import {
	deriveTrips,
	isCountryCode,
	type LocationRow,
	sortStays,
	type TravelStay,
	type Trip,
} from "@voyput/core";
import { useEffect, useState } from "react";
import { useDb } from "../../db/DbContext";
import { HOME_KEY, homeFor } from "../trips/tripStore";

export type VizSource =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "ready";
			rows: LocationRow[];
			/** Trips of the stored stays, in date order. */
			trips: Trip[];
			/** The stored stays, to leave transit photos out of a trip. */
			stays: TravelStay[];
	  };

/** Locations and stored trips, read once when the page opens. */
export function useVizSource(): VizSource {
	const db = useDb();
	const [source, setSource] = useState<VizSource>({ status: "loading" });
	useEffect(() => {
		let alive = true;
		Promise.all([
			db.locations.toArray(),
			db.stays.toArray(),
			db.kv.get(HOME_KEY),
		])
			.then(([rows, stored, picked]) => {
				if (!alive) return;
				const stays = sortStays(stored);
				const pickedHome = isCountryCode(picked?.value) ? picked.value : null;
				setSource({
					status: "ready",
					rows,
					trips: deriveTrips(stays, homeFor({ pickedHome }, stays)),
					stays,
				});
			})
			.catch((error: unknown) => {
				if (!alive) return;
				setSource({
					status: "error",
					message: error instanceof Error ? error.message : String(error),
				});
			});
		return () => {
			alive = false;
		};
	}, [db]);
	return source;
}
