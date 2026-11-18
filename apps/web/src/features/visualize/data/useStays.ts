import {
	buildStays,
	type LocationRow,
	type Stay,
	type StaysSummary,
	summarizeStays,
	type TravelStay,
} from "@voyput/core";
import { useEffect, useRef, useState } from "react";
import { useLocations } from "../../../data/locations";
import { useDb } from "../../../db/DbContext";
import { localToday } from "../../trips/format";
import { historyOf, loadTripsData } from "../../trips/tripStore";

export interface StaysData {
	/** Stays in date order: the Trips step's history, stored or suggested. */
	stays: Stay[];
	/** Every photo location, for the "exact by photos" route. */
	locations: readonly LocationRow[];
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
	const { data: locations, error } = useLocations();
	/** Read once: later location changes do not rebuild the open tab. */
	const rows = useRef(locations?.rows);
	rows.current ??= locations?.rows;
	const ready = locations !== undefined;
	useEffect(() => {
		if (error && !ready) setSource({ status: "error", message: error });
	}, [error, ready]);
	useEffect(() => {
		const first = rows.current;
		if (!ready || !first) return;
		let alive = true;
		loadTripsData(db, first)
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
	}, [db, ready]);
	return source;
}
