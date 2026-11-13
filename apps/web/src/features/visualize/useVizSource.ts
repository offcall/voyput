import {
	isIsoDate,
	type LocationRow,
	sortStays,
	type TravelStay,
} from "@voyput/core";
import { useEffect, useState } from "react";
import { useDb } from "../../db/DbContext";
import { BIRTH_KEY } from "../trips/tripStore";

export type VizSource =
	| { status: "loading" }
	| { status: "error"; message: string }
	| {
			status: "ready";
			rows: LocationRow[];
			/** The stored stays, in date order: the chart filter lists them. */
			stays: TravelStay[];
			/** The birth date, the first day of a stay since birth; null while unknown. */
			birth: string | null;
	  };

/** Locations and stored stays, read once when the page opens. */
export function useVizSource(): VizSource {
	const db = useDb();
	const [source, setSource] = useState<VizSource>({ status: "loading" });
	useEffect(() => {
		let alive = true;
		Promise.all([
			db.locations.toArray(),
			db.stays.toArray(),
			db.kv.get(BIRTH_KEY),
		])
			.then(([rows, stored, birth]) => {
				if (!alive) return;
				setSource({
					status: "ready",
					rows,
					stays: sortStays(stored),
					birth:
						typeof birth?.value === "string" && isIsoDate(birth.value)
							? birth.value
							: null,
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
