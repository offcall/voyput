import type { LocationRow } from "../locations/types";
import {
	buildCityPoints,
	buildCountryCounts,
	buildDayCounts,
	buildDistances,
	buildHeatPoints,
	buildMovements,
	buildMoves,
	buildTransitions,
	type CityPoint,
	type CountryStat,
	type Distances,
	type Move,
	type Movement,
	type Transition,
} from "./aggregates";

/** Every aggregate the charts read. */
export interface VizData {
	photoCount: number;
	movements: Movement[];
	/** Changes of country inside a range; never across the gap between two ranges. */
	moves: Move[];
	countries: CountryStat[];
	transitions: Transition[];
	cityPoints: CityPoint[];
	dayCounts: Record<string, number>;
	/** Years with at least one photo, ascending. */
	years: string[];
	distances: Distances;
	heatPoints: Float32Array;
}

/**
 * Aggregates rows grouped by date range (see `splitRowsByTrips`). Movements,
 * moves and distances stay inside each range; counts use all rows.
 */
export function buildVizData(
	ranges: readonly (readonly LocationRow[])[],
): VizData {
	const rows = ranges.flat();
	const movements = ranges.flatMap((group, i) => buildMovements(group, i));
	const moves = buildMoves(movements);
	const dayCounts = buildDayCounts(rows);
	return {
		photoCount: rows.length,
		movements,
		moves,
		countries: buildCountryCounts(rows),
		transitions: buildTransitions(moves),
		cityPoints: buildCityPoints(rows),
		dayCounts,
		years: [
			...new Set(Object.keys(dayCounts).map((d) => d.slice(0, 4))),
		].sort(),
		distances: buildDistances(ranges),
		heatPoints: buildHeatPoints(rows),
	};
}
