import {
	buildStays,
	guessHomeCountry,
	type LocationRow,
	type Stay,
	type StaysSummary,
	suggestTrips,
	summarizeStays,
	type Trip,
	usableStamps,
	visibleTrips,
} from "@voyput/core";
import { useEffect, useState } from "react";
import { useDb } from "../../../db/DbContext";
import { loadTripsData } from "../../trips/tripStore";

export interface StaysData {
	/** Stays in date order: trip stops grouped by country, plus home stays between trips. */
	stays: Stay[];
	/** Every photo location, for the "exact by photos" route. */
	locations: LocationRow[];
	/** The trips the stays come from: the Trips page's list, stored trips and suggestions. */
	trips: Trip[];
	home: string | null;
	summary: StaysSummary;
}

export type StaysSource =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: StaysData };

/** Builds the stays the Route and Explore tabs read, once when the tab opens. */
export function useStays(): StaysSource {
	const db = useDb();
	const [source, setSource] = useState<StaysSource>({ status: "loading" });
	useEffect(() => {
		let alive = true;
		loadTripsData(db)
			.then((data) => {
				if (!alive) return;
				const stamps = usableStamps(data.stamps);
				const home = data.home ?? guessHomeCountry(stamps, data.locations);
				const suggested = home
					? suggestTrips({ stamps, locations: data.locations, home })
					: [];
				const trips = visibleTrips(data.stored, suggested, data.dismissed).map(
					(entry) => entry.trip,
				);
				const stays = buildStays(trips, home, stamps);
				setSource({
					status: "ready",
					data: {
						stays,
						locations: data.locations,
						trips,
						home,
						summary: summarizeStays(trips, stays),
					},
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
