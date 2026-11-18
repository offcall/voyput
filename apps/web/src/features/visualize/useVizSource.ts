import {
	isIsoDate,
	type LocationRow,
	sortStays,
	type TravelStay,
} from "@voyput/core";
import { useEffect, useRef, useState } from "react";
import { useLocations } from "../../data/locations";
import { BIRTH_KEY } from "../../data/profile";
import { useDb } from "../../db/DbContext";

export type VizSource =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "ready";
			rows: readonly LocationRow[];
			/** The stored stays, in date order: the chart filter lists them. */
			stays: TravelStay[];
			/** The birth date, the first day of a stay since birth; null while unknown. */
			birth: string | null;
			/** Stored passport stamps: without any, border dates are guesses. */
			stamps: number;
	  };

/** Locations, stored stays and the stamp count, read once when the page opens. */
export function useVizSource(): VizSource {
	const db = useDb();
	const [source, setSource] = useState<VizSource>({ status: "loading" });
	const { data: locations, error } = useLocations();
	/** Read once: later location changes do not redraw the open page. */
	const located = useRef(locations?.rows);
	located.current ??= locations?.rows;
	const ready = locations !== undefined;
	useEffect(() => {
		if (error && !ready) setSource({ status: "error", message: error });
	}, [error, ready]);
	useEffect(() => {
		const rows = located.current;
		if (!ready || !rows) return;
		let alive = true;
		Promise.all([db.stays.toArray(), db.kv.get(BIRTH_KEY), db.stamps.count()])
			.then(([stored, birth, stamps]) => {
				if (!alive) return;
				setSource({
					status: "ready",
					rows,
					stays: sortStays(stored),
					birth:
						typeof birth?.value === "string" && isIsoDate(birth.value)
							? birth.value
							: null,
					stamps,
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
