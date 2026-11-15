import {
	buildStays,
	type LocationRow,
	type Stay,
	type StaysSummary,
	summarizeStays,
	type TravelStay,
} from "@voyput/core";
import { useEffect, useState } from "react";
import { useDb } from "../../../db/DbContext";
import { localToday } from "../../trips/format";
import { historyOf, loadTripsData } from "../../trips/tripStore";

export interface StaysData {
	/** Stays in date order: the Trips step's history, stored or suggested. */
	stays: Stay[];
	/** Every photo location, for the "exact by photos" route. */
	locations: LocationRow[];
	/** Birth country set on the Trips step: days elsewhere are abroad. */
	birthCountry: string | null;
	summary: StaysSummary;
	/** The history the stays come from, with each stay's own border days. */
	history: TravelStay[];
	/** Birth date, the start of a stay since birth; null while unknown. */
	birth: string | null;
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
				const history = historyOf(data);
				const stays = buildStays(history, {
					birthCountry: data.birthCountry,
					birth: data.birth,
					today: localToday(),
					locations: data.locations,
				});
				setSource({
					status: "ready",
					data: {
						stays,
						locations: data.locations,
						birthCountry: data.birthCountry,
						summary: summarizeStays(stays),
						history,
						birth: data.birth,
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
