import { type DayRun, type Direction, dayIso, dayNumber } from "@voyput/core";
import { formatDay, formatDayRange } from "./format";

/** Whole days `start`–`end` (day numbers, inclusive) in one country, or without photos. */
export interface StripSegment {
	start: number;
	end: number;
	/** Null: no photo on these days, or a travel day (see `via`). */
	countryCode: string | null;
	/** A travel day (`start` = `end`): its countries in the order of their first photo. */
	via?: readonly string[];
}

/** Days with photos in more than one country, by day number: the countries in order of their first photo that day. */
export type TravelDays = ReadonlyMap<number, readonly string[]>;

export const NO_TRAVEL_DAYS: TravelDays = new Map();

/**
 * Travel days from location rows. A row's day is its local date, as in the
 * photo index; the order within a day is by photo time.
 */
export function travelDaysOf(
	rows: readonly { date: string; countryCode: string }[],
): TravelDays {
	const firsts = new Map<number, Map<string, number>>();
	for (const row of rows) {
		const code = row.countryCode.trim().toUpperCase();
		const day = dayNumber(row.date);
		if (!code || day === null) continue;
		const parsed = Date.parse(row.date);
		const time = Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
		const first = firsts.get(day) ?? new Map<string, number>();
		firsts.set(day, first);
		const seen = first.get(code);
		if (seen === undefined || time < seen) first.set(code, time);
	}
	const travel = new Map<number, string[]>();
	for (const [day, first] of firsts)
		if (first.size > 1)
			travel.set(
				day,
				[...first]
					.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
					.map(([code]) => code),
			);
	return travel;
}

/**
 * Where the stamp line sits, in days from day 0. On a travel day with a change
 * into (entry) or out of (exit) the stamp's country, exactly on that change:
 * the day is split in equal parts, one per country. Otherwise on a day edge:
 * an entry (or a stamp of unknown direction) at the start of the stamp day, an
 * exit at its end. With the right date the line then falls on the change from
 * one country to the next.
 */
export function stampLine(
	day: number,
	direction: Direction,
	stampCode: string | null,
	travelDays: TravelDays,
): number {
	const via = travelDays.get(day);
	const at = via && stampCode ? via.indexOf(stampCode) : -1;
	if (via && direction === "entry" && at > 0) return day + at / via.length;
	if (via && direction === "exit" && at >= 0 && at < via.length - 1)
		return day + (at + 1) / via.length;
	return direction === "exit" ? day + 1 : day;
}

/**
 * The days shown: `radius` days on each side of the line, so the line is
 * always in the exact middle. `from` is a fraction when the line is inside a
 * travel day or the strip is being dragged.
 */
export const stripWindow = (
	line: number,
	radius: number,
	shift = 0,
): { from: number; days: number } => ({
	from: line + shift - radius,
	days: radius * 2,
});

/**
 * Every whole day `first`–`last` in one segment: runs of days in one country
 * (sorted `runs`, cut to the range), days without photos, and each travel day
 * on its own.
 */
export function stripSegments(
	runs: readonly DayRun[],
	travelDays: TravelDays,
	first: number,
	last: number,
): StripSegment[] {
	const codes: (string | null)[] = Array.from(
		{ length: Math.max(0, last - first + 1) },
		() => null,
	);
	for (const run of runs) {
		const start = dayNumber(run.start);
		const end = dayNumber(run.end);
		if (start === null || end === null) continue;
		for (let d = Math.max(start, first); d <= Math.min(end, last); d++)
			codes[d - first] = run.countryCode;
	}
	const segments: StripSegment[] = [];
	for (let d = first; d <= last; d++) {
		const via = travelDays.get(d);
		if (via) {
			segments.push({ start: d, end: d, countryCode: null, via });
			continue;
		}
		const code = codes[d - first] ?? null;
		const previous = segments.at(-1);
		if (previous && !previous.via && previous.countryCode === code)
			previous.end = d;
		else segments.push({ start: d, end: d, countryCode: code });
	}
	return segments;
}

/** Left and right offsets in % of the window; neighbours share an edge exactly. */
export const segmentBox = (
	segment: StripSegment,
	from: number,
	days: number,
): { left: number; right: number } => ({
	left: ((segment.start - from) / days) * 100,
	right: ((from + days - segment.end - 1) / days) * 100,
});

/** "SG · 26 Apr – 26 Apr 2023", "No photos · …", or "UA → ES · 10 Aug 2016" for a travel day. */
export const segmentTip = (segment: StripSegment): string =>
	segment.via
		? `${segment.via.join(" → ")} · ${formatDay(dayIso(segment.start))}`
		: `${segment.countryCode ?? "No photos"} · ${formatDayRange(
				dayIso(segment.start),
				dayIso(segment.end),
			)}`;

/**
 * Core day runs bridge silences of up to 30 days in one country; the review
 * strips show those days as days without photos, so runs are cut at every day
 * that has none. `photoDays` are the sorted day numbers of all photos.
 */
export function photoDayRuns(
	runs: readonly DayRun[],
	photoDays: ArrayLike<number>,
): DayRun[] {
	const out: DayRun[] = [];
	let i = 0;
	for (const run of runs) {
		const start = dayNumber(run.start);
		const end = dayNumber(run.end);
		if (start === null || end === null) continue;
		while (i < photoDays.length && (photoDays[i] ?? 0) < start) i++;
		let pieceStart: number | null = null;
		let previous = start;
		const push = () => {
			if (pieceStart !== null)
				out.push({
					start: dayIso(pieceStart),
					end: dayIso(previous),
					countryCode: run.countryCode,
				});
		};
		for (; i < photoDays.length && (photoDays[i] ?? 0) <= end; i++) {
			const day = photoDays[i] ?? 0;
			if (pieceStart !== null && day > previous + 1) {
				push();
				pieceStart = null;
			}
			pieceStart ??= day;
			previous = day;
		}
		push();
	}
	return out;
}
