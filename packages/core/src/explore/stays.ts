import type { LocationRow } from "../locations/types";
import { countryNameOf } from "../trips/countries";
import { locationDay } from "../trips/evidence";
import type { StayEdge, TravelStay, Trip } from "../trips/types";
import { addDays, spanDays } from "./dates";
import { regionOf } from "./regions";
import type { Stay } from "./types";

export interface StaysOptions {
	home: string | null;
	/** Start of a "since birth" stay; without it that stay is left out. */
	birth: string | null;
	/** End of a stay the traveller is still in. */
	today: string;
	/** Trips derived from the same stays, for each stay's trip id and title. */
	trips?: readonly Trip[];
	/** Photo locations, to count the days each stay was seen on. */
	locations?: readonly LocationRow[];
}

const isEstimated = (...edges: StayEdge[]) =>
	edges.some((e) => e.source === "estimated" || e.source === "photos");

/**
 * Explore's stays: the history's stays with known days, in order. A border
 * day belongs to the next stay only, unless that would leave this one without
 * a day, so stays of a history do not share days.
 */
export function buildStays(
	stays: readonly TravelStay[],
	options: StaysOptions,
): Stay[] {
	const { home, birth, today } = options;
	const tripOf = new Map<string, Trip>();
	for (const trip of options.trips ?? [])
		for (const id of trip.stayIds) tripOf.set(id, trip);
	const photoDay = new Map<string, string>();
	for (const row of options.locations ?? []) {
		const d = locationDay(row);
		if (d) photoDay.set(row.uuid, d);
	}
	const seenDays = (s: TravelStay) => [
		...new Set(s.photoIds.flatMap((id) => photoDay.get(id) ?? [])),
	];
	const out: Omit<Stay, "order">[] = [];
	stays.forEach((s, i) => {
		let start = s.arrival.date ?? birth;
		let end = s.departure.date ?? today;
		if (start === null || start > end) return;
		// A one-day stay before kept the shared day: this stay starts after it.
		const previousEnd = out.at(-1)?.end;
		if (previousEnd && start <= previousEnd && addDays(previousEnd, 1) <= end)
			start = addDays(previousEnd, 1);
		const next = stays[i + 1]?.arrival.date;
		if (next === end && end > start) end = addDays(end, -1);
		const trip = tripOf.get(s.id);
		out.push({
			id: s.id,
			countryCode: s.countryCode,
			country: countryNameOf(s.countryCode),
			region: regionOf(s.countryCode),
			start,
			end,
			days: spanDays(start, end),
			kind: s.kind,
			home: s.countryCode === home,
			tripId: trip?.id ?? null,
			tripTitle: trip?.title ?? "",
			place: s.place,
			entry: { ...s.arrival, date: start },
			exit: { ...s.departure, date: s.departure.date ?? end },
			stamps: s.stampIds.length,
			stopDays: seenDays(s).length,
			estimated: isEstimated(s.arrival, s.departure),
		});
	});
	return out.map((d, order) => ({ ...d, order }));
}

export interface StaysSummary {
	trips: number;
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
		stays: stays.length,
		countries: new Set(stays.map((s) => s.countryCode)).size,
		firstDate: starts[0] ?? null,
		lastDate: ends.at(-1) ?? null,
	};
}
