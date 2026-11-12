import type { LocationRow, Trip } from "@voyput/core";
import { useEffect, useState } from "react";
import { useDb } from "../../db/DbContext";

export type VizSource =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; rows: LocationRow[]; trips: Trip[] };

/** Locations and trips, read once when the page opens. */
export function useVizSource(): VizSource {
	const db = useDb();
	const [source, setSource] = useState<VizSource>({ status: "loading" });
	useEffect(() => {
		let alive = true;
		Promise.all([db.locations.toArray(), db.trips.orderBy("start").toArray()])
			.then(([rows, trips]) => {
				if (alive) setSource({ status: "ready", rows, trips });
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
