import {
	buildDayRuns,
	buildPhotoIndex,
	type DayRun,
	type LocationRow,
	type PhotoIndex,
} from "@voyput/core";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import { useDb } from "../db/DbContext";
import { buildPhotoDays, type PhotoDays } from "./photoDays";
import { type LiveQueryResult, useLiveQuery } from "./useLiveQuery";

/**
 * One read of the `locations` table and what the sections build from it.
 * Each view is built the first time it is read, then kept: every consumer
 * of the same read shares one build. A new read makes a new `Locations`.
 */
export class Locations {
	#photoIndex: PhotoIndex | undefined;
	#dayRuns: DayRun[] | undefined;
	#photoDays: PhotoDays | undefined;

	/** The rows as stored; do not change them. */
	readonly rows: readonly LocationRow[];

	constructor(rows: readonly LocationRow[]) {
		this.rows = rows;
	}

	/** Rows sorted by day, as day numbers and country codes (core `buildPhotoIndex`). */
	get photoIndex(): PhotoIndex {
		this.#photoIndex ??= buildPhotoIndex(this.rows);
		return this.#photoIndex;
	}

	/** Runs of consecutive photo days (core `buildDayRuns`). */
	get dayRuns(): DayRun[] {
		this.#dayRuns ??= buildDayRuns(this.photoIndex);
		return this.#dayRuns;
	}

	/** Photos per day and country. */
	get photoDays(): PhotoDays {
		this.#photoDays ??= buildPhotoDays(this.rows);
		return this.#photoDays;
	}
}

/** uuid prefix of the demo's location rows: stored data, never change it. */
export const DEMO_LOCATION_PREFIX = "demo-";

const LocationsContext = createContext<LiveQueryResult<Locations> | null>(null);

/** Reads `locations` once per change for the whole app (ADR 0038). */
export function LocationsProvider({ children }: { children: ReactNode }) {
	const db = useDb();
	const { data: rows, error } = useLiveQuery(
		useCallback(() => db.locations.toArray(), [db]),
	);
	const value = useMemo(
		() => ({ data: rows ? new Locations(rows) : undefined, error }),
		[rows, error],
	);
	return (
		<LocationsContext.Provider value={value}>
			{children}
		</LocationsContext.Provider>
	);
}

/** The current locations, undefined while the first read runs. */
export function useLocations(): LiveQueryResult<Locations> {
	const locations = useContext(LocationsContext);
	if (!locations)
		throw new Error("useLocations() needs a <LocationsProvider> above it");
	return locations;
}
