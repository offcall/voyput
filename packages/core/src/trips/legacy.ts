import {
	type EdgeSource,
	type StayEdge,
	TRAVEL_METHODS,
	type TravelMethod,
	type TravelStay,
} from "./types";

export interface LegacyBoundary {
	date: string;
	source: "manual" | "stamp" | "unknown";
	stampId?: string;
	method: string;
}

export interface LegacyStop {
	id: string;
	day: string;
	countryCode: string;
	country: string;
	cities: string[];
	kind: "stay" | "transit";
}

/** A trip as stored before stays (Dexie version 2): read only to migrate it. */
export interface LegacyTrip {
	id: string;
	title: string;
	start: string;
	end: string;
	confirmed: boolean;
	arrival: LegacyBoundary;
	departure: LegacyBoundary;
	stops: LegacyStop[];
	stampIds: string[];
}

const legacySource = (b: LegacyBoundary): EdgeSource =>
	b.source === "unknown" ? "estimated" : b.source;

const legacyMethod = (method: string): TravelMethod =>
	method === "foot"
		? "walk"
		: (TRAVEL_METHODS as readonly string[]).includes(method)
			? (method as TravelMethod)
			: "unknown";

const legacyEdge = (b: LegacyBoundary, date: string): StayEdge => ({
	date,
	source: legacySource(b),
	method: legacyMethod(b.method),
	...(b.stampId && b.source === "stamp" ? { stampId: b.stampId } : {}),
});

/**
 * A stored trip as stays: its stops grouped into runs of one country, the
 * trip's arrival and departure on the outer edges, photo days between them.
 * A confirmed trip gives approved stays. A trip without stops gives none.
 */
export function legacyTripStays(trip: LegacyTrip): TravelStay[] {
	const days = [...new Set(trip.stops.map((s) => s.day))].sort();
	const runs: {
		countryCode: string;
		first: string;
		last: string;
		stops: LegacyStop[];
	}[] = [];
	for (const d of days) {
		const open = runs.at(-1)?.countryCode;
		const today = trip.stops
			.filter((s) => s.day === d)
			.sort(
				(a, b) =>
					Number(b.countryCode === open) - Number(a.countryCode === open) ||
					a.countryCode.localeCompare(b.countryCode),
			);
		for (const stop of today) {
			const run = runs.at(-1);
			if (run && run.countryCode === stop.countryCode) {
				run.last = d;
				run.stops.push(stop);
			} else
				runs.push({
					countryCode: stop.countryCode,
					first: d,
					last: d,
					stops: [stop],
				});
		}
	}
	return runs.map((run, i) => {
		const next = runs[i + 1];
		const photos = (date: string): StayEdge => ({
			date,
			source: "photos",
			method: "unknown",
		});
		return {
			id: `${trip.id}-${i}`,
			countryCode: run.countryCode,
			place: [...new Set(run.stops.flatMap((s) => s.cities))].join(", "),
			kind: run.stops.every((s) => s.kind === "transit") ? "transit" : "stay",
			arrival:
				i === 0 ? legacyEdge(trip.arrival, trip.start) : photos(run.first),
			departure: next
				? photos(next.first)
				: legacyEdge(trip.departure, trip.end),
			stampIds: i === 0 ? [...trip.stampIds] : [],
			photoIds: [],
			approved: trip.confirmed,
		};
	});
}
