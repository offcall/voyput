import type { LocationRow } from "../locations/types";
import { countryNameOf } from "./countries";
import { type DatedStamp, daysBetween, locationDay } from "./evidence";
import type { Boundary, Trip, TripStop } from "./types";

/** What trips are built from. `home` is the country trips leave from. */
export interface TripEvidence {
	stamps: readonly DatedStamp[];
	locations: readonly LocationRow[];
	home: string;
}

/**
 * Days without any evidence after which a trip ends on its own. Photo
 * libraries have gaps of weeks, so this is long; explicit crossings and home
 * photos end trips much earlier.
 */
const MAX_SILENT_DAYS = 30;
/** The same, while a foreign entry stamp still waits for an exit. */
const MAX_SILENT_DAYS_AFTER_ENTRY = 180;

interface Day {
	foreign: Set<string>;
	homePhoto: boolean;
	stamps: DatedStamp[];
}

function collectDays({ stamps, locations, home }: TripEvidence) {
	const days = new Map<string, Day>();
	const at = (day: string) => {
		let d = days.get(day);
		if (!d) {
			d = { foreign: new Set(), homePhoto: false, stamps: [] };
			days.set(day, d);
		}
		return d;
	};
	for (const row of locations) {
		const day = locationDay(row);
		if (!day) continue;
		if (row.countryCode === home) at(day).homePhoto = true;
		else at(day).foreign.add(row.countryCode);
	}
	for (const s of stamps) {
		const d = at(s.date);
		d.stamps.push(s);
		if (s.countryCode !== home) d.foreign.add(s.countryCode);
	}
	return [...days].sort((a, b) => a[0].localeCompare(b[0]));
}

interface OpenPeriod {
	start: string;
	/** Last day with any evidence of being away. */
	last: string;
	/** Foreign countries entered by stamp and not left yet. */
	waiting: Set<string>;
}

/**
 * Start and end days of each stay outside the home country. A day's stamps
 * are applied as a set, because their order within a day is unknown.
 */
function findPeriods(evidence: TripEvidence): [string, string][] {
	const { home } = evidence;
	const periods: [string, string][] = [];
	let open: OpenPeriod | null = null;
	const close = (period: OpenPeriod, end: string) => {
		periods.push([period.start, end]);
		open = null;
	};

	for (const [day, d] of collectDays(evidence)) {
		const has = (cc: string, direction: "entry" | "exit") =>
			d.stamps.some((s) => s.countryCode === cc && s.direction === direction);
		const homeExit = has(home, "exit");
		const homeEntry = has(home, "entry");

		if (open && !homeEntry) {
			const period: OpenPeriod = open;
			const limit =
				period.waiting.size > 0 ? MAX_SILENT_DAYS_AFTER_ENTRY : MAX_SILENT_DAYS;
			// Leaving home again proves the previous trip is over.
			if (homeExit || daysBetween(period.last, day) > limit)
				close(period, period.last);
		}
		if (!open && (d.foreign.size > 0 || homeExit))
			open = { start: day, last: day, waiting: new Set() };
		const period: OpenPeriod | null = open;
		if (!period) continue;

		// A country entered and left on the same day is not waited for.
		const foreign = (direction: "entry" | "exit") =>
			new Set(
				d.stamps
					.filter((s) => s.countryCode !== home && s.direction === direction)
					.map((s) => s.countryCode),
			);
		const entries = foreign("entry");
		const exits = foreign("exit");
		// Any foreign exit ends the wait: Schengen and similar areas stamp
		// the entry in one country and the exit in another.
		if ([...exits].some((cc) => !entries.has(cc))) period.waiting.clear();
		for (const cc of entries) if (!exits.has(cc)) period.waiting.add(cc);
		if (d.foreign.size > 0 || homeExit) period.last = day;

		if (homeEntry) close(period, day);
		else if (d.homePhoto && d.foreign.size === 0 && !homeExit)
			close(period, period.last);
	}
	const last: OpenPeriod | null = open;
	if (last) close(last, last.last);
	return periods;
}

/** Foreign stops by day between `start` and `end`, with their cities. */
export function stopsByDay(
	evidence: TripEvidence,
	start: string,
	end: string,
): TripStop[] {
	const { stamps, locations, home } = evidence;
	const stops = new Map<string, TripStop & { fromPhotos: boolean }>();
	const stop = (day: string, countryCode: string, country: string) => {
		const id = `${day}|${countryCode}`;
		let s = stops.get(id);
		if (!s) {
			s = {
				id,
				day,
				countryCode,
				// A missing name, or one that is just the code, becomes the English name.
				country:
					country && country !== countryCode
						? country
						: countryNameOf(countryCode),
				cities: [],
				kind: "stay",
				fromPhotos: false,
			};
			stops.set(id, s);
		}
		return s;
	};
	for (const row of locations) {
		const day = locationDay(row);
		if (!day || day < start || day > end || row.countryCode === home) continue;
		const s = stop(day, row.countryCode, row.country);
		s.fromPhotos = true;
		if (row.city && !s.cities.includes(row.city)) s.cities.push(row.city);
	}
	for (const st of stamps) {
		if (st.date < start || st.date > end || st.countryCode === home) continue;
		const s = stop(st.date, st.countryCode, st.country ?? "");
		// Photo cities are better; a border post only names a stop without photos.
		if (!s.fromPhotos && st.location && !s.cities.includes(st.location))
			s.cities.push(st.location);
	}
	return [...stops.values()]
		.map(({ fromPhotos: _, ...s }) => s)
		.sort(
			(a, b) =>
				a.day.localeCompare(b.day) ||
				a.countryCode.localeCompare(b.countryCode),
		);
}

const stampBoundary = (s: DatedStamp): Boundary => ({
	date: s.date,
	source: "stamp",
	stampId: s.id,
	method: s.borderCrossing,
});

const unknownBoundary = (date: string): Boundary => ({
	date,
	source: "unknown",
	method: "unknown",
});

/** Countries of the stops, in the order they were first visited. */
export function tripTitle(stops: readonly TripStop[]): string {
	return (
		[...new Set(stops.map((s) => s.country))].join(" → ") ||
		"Unknown destination"
	);
}

/** Stops and stamps for a period; boundaries come from stamps on its edge days. */
export function buildTrip(
	evidence: TripEvidence,
	start: string,
	end: string,
): Trip {
	const { stamps, home } = evidence;
	const inside = stamps.filter((s) => s.date >= start && s.date <= end);
	const stops = stopsByDay(evidence, start, end);
	const onDay = (day: string, direction: "entry" | "exit") =>
		inside.filter((s) => s.date === day && s.direction === direction);
	const leaving =
		onDay(start, "exit").find((s) => s.countryCode === home) ??
		onDay(start, "entry").find((s) => s.countryCode !== home);
	const returning =
		onDay(end, "entry").find((s) => s.countryCode === home) ??
		onDay(end, "exit")
			.filter((s) => s.countryCode !== home)
			.at(-1);
	return {
		id: `suggested-${start}-${(stops[0]?.countryCode ?? "xx").toLowerCase()}`,
		title: tripTitle(stops),
		start,
		end,
		confirmed: false,
		arrival: leaving ? stampBoundary(leaving) : unknownBoundary(start),
		departure: returning ? stampBoundary(returning) : unknownBoundary(end),
		stops,
		stampIds: inside.map((s) => s.id),
	};
}

/** Trips outside the home country, from stamps and photo locations. */
export function suggestTrips(evidence: TripEvidence): Trip[] {
	return findPeriods(evidence).map(([start, end]) =>
		buildTrip(evidence, start, end),
	);
}

/**
 * The user moved a trip's start or end: refresh its stops and stamps and
 * mark a moved edge as a manual boundary. Title and id stay.
 */
export function changePeriod(
	trip: Trip,
	evidence: TripEvidence,
	start: string,
	end: string,
): Trip {
	const rebuilt = buildTrip(evidence, start, end);
	const edge = (old: Boundary, date: string, was: string): Boundary =>
		date === was ? old : { date, source: "manual", method: old.method };
	return {
		...trip,
		start,
		end,
		arrival: edge(trip.arrival, start, trip.start),
		departure: edge(trip.departure, end, trip.end),
		stops: rebuilt.stops,
		stampIds: rebuilt.stampIds,
	};
}

/** A span of days, both ends included. */
export interface Period {
	start: string;
	end: string;
}

const overlaps = (a: Period, b: Period) => a.start <= b.end && b.start <= a.end;

/**
 * Stored trips win: a suggestion is shown only when it does not overlap a
 * stored trip or a period the user dismissed. Suggestion ids change when the
 * data changes, so dismissals are kept by period.
 */
export function visibleTrips(
	stored: readonly Trip[],
	suggestions: readonly Trip[],
	dismissed: readonly Period[],
): { trip: Trip; stored: boolean }[] {
	const fresh = suggestions.filter(
		(s) =>
			!dismissed.some((p) => overlaps(p, s)) &&
			!stored.some((t) => t.id === s.id || overlaps(t, s)),
	);
	return [
		...stored.map((trip) => ({ trip, stored: true })),
		...fresh.map((trip) => ({ trip, stored: false })),
	].sort((a, b) => a.trip.start.localeCompare(b.trip.start));
}
