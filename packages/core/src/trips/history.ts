import { spanDays } from "../explore/dates";
import type { LocationRow } from "../locations/types";
import { countryNameOf } from "./countries";
import { locationDay } from "./evidence";
import type { TravelStay, Trip } from "./types";

/** First and last day of a stay; null where it is unknown. */
export interface StaySpan {
	start: string | null;
	end: string | null;
}

/**
 * A stay's days, with "since birth" read as the birth date and "still there"
 * as `today`.
 */
export function staySpan(
	stay: TravelStay,
	birth: string | null,
	today: string,
): StaySpan {
	return {
		start: stay.arrival.date ?? birth,
		end: stay.departure.date ?? today,
	};
}

/** Calendar days of a span, both ends included; null when an end is unknown or reversed. */
export function spanLength({ start, end }: StaySpan): number | null {
	if (start === null || end === null || start > end) return null;
	return spanDays(start, end);
}

/**
 * The country of most stays (transits left out): the one the traveller keeps
 * returning to. Ties go to the one with more known days, then by code.
 */
export function homeOf(stays: readonly TravelStay[]): string | null {
	const counts = new Map<string, { stays: number; days: number }>();
	for (const s of stays) {
		if (s.kind === "transit") continue;
		const c = counts.get(s.countryCode) ?? { stays: 0, days: 0 };
		c.stays++;
		c.days += spanLength({ start: s.arrival.date, end: s.departure.date }) ?? 0;
		counts.set(s.countryCode, c);
	}
	let best: string | null = null;
	let top = { stays: 0, days: -1 };
	for (const [cc, c] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
		if (c.stays > top.stays || (c.stays === top.stays && c.days > top.days)) {
			best = cc;
			top = c;
		}
	}
	return best;
}

const unique = (codes: readonly string[]) => [...new Set(codes)];

/** Trips: each run of stays outside `home`, from its first arrival to its last departure. */
export function deriveTrips(
	stays: readonly TravelStay[],
	home: string | null,
): Trip[] {
	if (!home) return [];
	const runs: TravelStay[][] = [];
	let run: TravelStay[] | null = null;
	for (const s of stays) {
		if (s.countryCode === home) run = null;
		else if (run) run.push(s);
		else {
			run = [s];
			runs.push(run);
		}
	}
	return runs.map((list) => {
		const first = list[0] as TravelStay;
		const last = list.at(-1) as TravelStay;
		const countries = unique(list.map((s) => s.countryCode));
		const visited = unique(
			list.filter((s) => s.kind === "stay").map((s) => s.countryCode),
		);
		const start = first.arrival.date ?? first.departure.date ?? "";
		return {
			id: `trip-${first.id}`,
			title: (visited.length > 0 ? visited : countries)
				.map(countryNameOf)
				.join(" → "),
			start,
			end: last.departure.date ?? last.arrival.date ?? start,
			stayIds: list.map((s) => s.id),
			countries,
			visited,
			approved: list.every((s) => s.approved),
		};
	});
}

/**
 * Photo locations without the ones taken in a transit country during the
 * transit: an airport layover is not a visit, so its photos do not count.
 */
export function withoutTransitRows(
	rows: readonly LocationRow[],
	stays: readonly TravelStay[],
): LocationRow[] {
	const transits = stays.filter((s) => s.kind === "transit");
	if (transits.length === 0) return [...rows];
	return rows.filter((row) => {
		const d = locationDay(row);
		return !(
			d &&
			transits.some(
				(s) =>
					s.countryCode === row.countryCode &&
					(s.arrival.date === null || s.arrival.date <= d) &&
					(s.departure.date === null || d <= s.departure.date),
			)
		);
	});
}
