import type { Stamp } from "../stamps/types";
import { countryNameOf } from "../trips/countries";
import type { Boundary, Trip, TripStop } from "../trips/types";
import { addDays, spanDays } from "./dates";
import { regionOf } from "./regions";
import type { EdgeSource, Stay, StayEdge } from "./types";

/** Stamp fields used to count a stay's stamps. */
export type StayStamp = Pick<Stamp, "id" | "date" | "countryCode">;

const boundaryEdge = (b: Boundary, date: string): StayEdge => ({
	date,
	source: b.source,
	method: b.method,
	...(b.stampId ? { stampId: b.stampId } : {}),
});

const photosEdge = (date: string): StayEdge => ({
	date,
	source: "photos",
	method: "unknown",
});

const isEstimated = (...sources: EdgeSource[]) =>
	sources.some((s) => s === "unknown" || s === "photos");

type Draft = Omit<Stay, "order">;

/**
 * Stops grouped into runs of one country, in day order. On a day with stops in
 * several countries, the country of the run already open comes first, so a
 * border day continues the current run instead of splitting it.
 */
function countryRuns(stops: readonly TripStop[]): TripStop[][] {
	const byDay = new Map<string, TripStop[]>();
	for (const stop of stops) {
		const day = byDay.get(stop.day);
		if (day) day.push(stop);
		else byDay.set(stop.day, [stop]);
	}
	const runs: TripStop[][] = [];
	for (const day of [...byDay.keys()].sort()) {
		const open = runs.at(-1)?.[0]?.countryCode;
		const rank = (s: TripStop) => (s.countryCode === open ? 0 : 1);
		const ordered = (byDay.get(day) ?? []).sort(
			(a, b) => rank(a) - rank(b) || a.countryCode.localeCompare(b.countryCode),
		);
		for (const stop of ordered) {
			const run = runs.at(-1);
			if (run && run[0]?.countryCode === stop.countryCode) run.push(stop);
			else runs.push([stop]);
		}
	}
	return runs;
}

function tripStays(trip: Trip, stamps: readonly StayStamp[]): Draft[] {
	const runs = countryRuns(trip.stops);
	const tripStamps = new Set(trip.stampIds);
	let previousEnd: string | null = null;
	return runs.map((run, i) => {
		const first = run[0] as TripStop;
		const next = runs[i + 1]?.[0];
		// Stays tile the trip: each starts the day after the previous one ends.
		const start = previousEnd === null ? trip.start : addDays(previousEnd, 1);
		const last = (run.at(-1) as TripStop).day;
		// A border day (shared with the next run) belongs to the next stay only,
		// unless this stay would be left without a day.
		const until = next ? addDays(next.day, -1) : trip.end;
		const end = until < start ? start : until;
		previousEnd = end;
		// Stamps of the border day still count for this stay.
		const stampEnd = last > end ? last : end;
		const entry =
			i === 0 ? boundaryEdge(trip.arrival, start) : photosEdge(start);
		const exit = next ? photosEdge(end) : boundaryEdge(trip.departure, end);
		const cc = first.countryCode;
		return {
			id: `${trip.id}:${i}`,
			countryCode: cc,
			country: countryNameOf(cc),
			region: regionOf(cc),
			start,
			end,
			days: spanDays(start, end),
			kind: run.every((s) => s.kind === "transit") ? "transit" : "stay",
			home: false,
			tripId: trip.id,
			tripTitle: trip.title,
			place: [...new Set(run.flatMap((s) => s.cities))].join(", "),
			entry,
			exit,
			stamps: stamps.filter(
				(s) =>
					tripStamps.has(s.id) &&
					s.countryCode === cc &&
					s.date !== null &&
					s.date >= start &&
					s.date <= stampEnd,
			).length,
			stopDays: new Set(run.map((s) => s.day)).size,
			estimated: isEstimated(entry.source, exit.source),
		};
	});
}

function homeStay(
	home: string,
	start: string,
	end: string,
	before: Boundary,
	after: Boundary,
): Draft {
	const entry = boundaryEdge(before, start);
	const exit = boundaryEdge(after, end);
	return {
		id: `home:${start}`,
		countryCode: home,
		country: countryNameOf(home),
		region: regionOf(home),
		start,
		end,
		days: spanDays(start, end),
		kind: "stay",
		home: true,
		tripId: null,
		tripTitle: "",
		place: "",
		entry,
		exit,
		stamps: 0,
		stopDays: 0,
		estimated: isEstimated(entry.source, exit.source),
	};
}

/**
 * Stays in chronological order: each trip's stops grouped into runs of one
 * country, plus home stays filling the gaps between trips when `home` is set.
 * Trips without stops give no stay. `stamps` only feeds the stamp counts.
 */
export function buildStays(
	trips: readonly Trip[],
	home: string | null,
	stamps: readonly StayStamp[] = [],
): Stay[] {
	const sorted = [...trips].sort(
		(a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
	);
	const drafts: Draft[] = [];
	let previous: Trip | null = null;
	for (const trip of sorted) {
		if (home && previous) {
			const start = addDays(previous.end, 1);
			const end = addDays(trip.start, -1);
			if (start <= end)
				drafts.push(
					homeStay(home, start, end, previous.departure, trip.arrival),
				);
		}
		drafts.push(...tripStays(trip, stamps));
		// Overlapping trips: the gap starts after the one that ends last.
		if (!previous || trip.end > previous.end) previous = trip;
	}
	return drafts.map((d, order) => ({ ...d, order }));
}

export interface StaysSummary {
	trips: number;
	/** Trips that gave no stay because they have no stops. */
	tripsWithoutStops: number;
	stays: number;
	countries: number;
	firstDate: string | null;
	lastDate: string | null;
}

export function summarizeStays(
	trips: readonly Trip[],
	stays: readonly Stay[],
): StaysSummary {
	const starts = stays.map((s) => s.start).sort();
	const ends = stays.map((s) => s.end).sort();
	return {
		trips: trips.length,
		tripsWithoutStops: trips.filter((t) => t.stops.length === 0).length,
		stays: stays.length,
		countries: new Set(stays.map((s) => s.countryCode)).size,
		firstDate: starts[0] ?? null,
		lastDate: ends.at(-1) ?? null,
	};
}
