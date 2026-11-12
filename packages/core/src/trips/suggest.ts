import type { LocationRow } from "../locations/types";
import { type DatedStamp, daysBetween, locationDay } from "./evidence";
import type { Boundary, Trip, TripStop } from "./types";

/** What trips are built from. `home` is the country trips leave from. */
export interface TripEvidence {
	stamps: readonly DatedStamp[];
	locations: readonly LocationRow[];
	home: string;
}

/**
 * Days without any evidence that still count as one trip. Longer silences
 * end a trip, unless a foreign entry stamp is still waiting for its exit.
 */
const MAX_SILENT_DAYS = 3;

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

/** Start and end days of each stay outside the home country. */
function findPeriods(evidence: TripEvidence): [string, string][] {
	const { home } = evidence;
	const periods: [string, string][] = [];
	let open: {
		start: string;
		lastForeign: string | null;
		waiting: Set<string>;
	} | null = null;
	const close = (end: string) => {
		if (open?.lastForeign) periods.push([open.start, end]);
		open = null;
	};

	for (const [day, d] of collectDays(evidence)) {
		const homeStamp = (direction: "entry" | "exit") =>
			d.stamps.some((s) => s.countryCode === home && s.direction === direction);
		if (open) {
			const last = open.lastForeign ?? open.start;
			if (open.waiting.size === 0 && daysBetween(last, day) > MAX_SILENT_DAYS)
				close(last);
		}
		if (!open && (d.foreign.size > 0 || homeStamp("exit")))
			open = { start: day, lastForeign: null, waiting: new Set() };
		if (!open) continue;

		for (const s of d.stamps) {
			if (s.countryCode === home) continue;
			if (s.direction === "entry") open.waiting.add(s.countryCode);
			if (s.direction === "exit") open.waiting.delete(s.countryCode);
		}
		if (d.foreign.size > 0) open.lastForeign = day;

		if (homeStamp("entry")) close(day);
		else if (d.homePhoto && d.foreign.size === 0 && !homeStamp("exit"))
			close(open.lastForeign ?? open.start);
	}
	const last = open as { start: string; lastForeign: string | null } | null;
	if (last) close(last.lastForeign ?? last.start);
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
				country: country || countryCode,
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
	return [...new Set(stops.map((s) => s.country))].join(" → ") || "New trip";
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

const overlaps = (a: Trip, b: Trip) => a.start <= b.end && b.start <= a.end;

/**
 * Stored trips win: a suggestion is shown only when it was not dismissed,
 * not saved already, and does not overlap a stored trip.
 */
export function visibleTrips(
	stored: readonly Trip[],
	suggestions: readonly Trip[],
	dismissed: readonly string[],
): { trip: Trip; stored: boolean }[] {
	const fresh = suggestions.filter(
		(s) =>
			!dismissed.includes(s.id) &&
			!stored.some((t) => t.id === s.id || overlaps(t, s)),
	);
	return [
		...stored.map((trip) => ({ trip, stored: true })),
		...fresh.map((trip) => ({ trip, stored: false })),
	].sort((a, b) => a.trip.start.localeCompare(b.trip.start));
}
