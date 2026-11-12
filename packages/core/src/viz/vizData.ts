import type { LocationRow } from "../locations/types";
import {
	buildCityPoints,
	buildCountryCounts,
	buildDayCounts,
	buildDistances,
	buildHeatPoints,
	buildMovements,
	buildTransitions,
	type CityPoint,
	type CountryStat,
	type Distances,
	type Movement,
	type Transition,
} from "./aggregates";

/** Every aggregate the charts read, computed in one pass over the rows. */
export interface VizData {
	photoCount: number;
	movements: Movement[];
	countries: CountryStat[];
	transitions: Transition[];
	cityPoints: CityPoint[];
	dayCounts: Record<string, number>;
	/** Years with at least one photo, ascending. */
	years: string[];
	distances: Distances;
	heatPoints: Float32Array;
}

export function buildVizData(rows: readonly LocationRow[]): VizData {
	const movements = buildMovements(rows);
	const dayCounts = buildDayCounts(rows);
	return {
		photoCount: rows.length,
		movements,
		countries: buildCountryCounts(rows),
		transitions: buildTransitions(movements),
		cityPoints: buildCityPoints(rows),
		dayCounts,
		years: [
			...new Set(Object.keys(dayCounts).map((d) => d.slice(0, 4))),
		].sort(),
		distances: buildDistances(rows),
		heatPoints: buildHeatPoints(rows),
	};
}
