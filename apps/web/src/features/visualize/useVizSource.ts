import type { LocationRow, Trip } from "@voyput/core";
import { useEffect, useState } from "react";
import { useDb } from "../../db/DbContext";

export interface VizSource {
	rows: LocationRow[];
	trips: Trip[];
}

/** Locations and trips, read once when the page opens. `null` while loading. */
export function useVizSource(): VizSource | null {
	const db = useDb();
	const [source, setSource] = useState<VizSource | null>(null);
	useEffect(() => {
		let alive = true;
		Promise.all([db.locations.toArray(), db.trips.orderBy("start").toArray()])
			.then(([rows, trips]) => {
				if (alive) setSource({ rows, trips });
			})
			.catch((error: unknown) => {
				console.error("Could not load locations or trips", error);
				if (alive) setSource({ rows: [], trips: [] });
			});
		return () => {
			alive = false;
		};
	}, [db]);
	return source;
}
