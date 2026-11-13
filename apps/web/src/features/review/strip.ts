import { type DayRun, type Direction, dayIso, dayNumber } from "@voyput/core";
import { formatDay, formatDayRange } from "./format";
import { snapShift } from "./stripPan";

/** Whole days `start`–`end` (day numbers, inclusive) in one country, or without photos. */
export interface StripSegment {
	start: number;
	end: number;
	/** Null: no photo on these days, or a travel day (see `via`). */
	countryCode: string | null;
	/** A travel day (`start` = `end`): its countries in the order of their first photo. */
	via?: readonly string[];
}

/**
 * Days with photos in more than one country, by day number: the countries in
 * photo-time order, one entry per stretch, so a same-day return stays in
 * ("UA", "ES", "UA").
 */
export type TravelDays = ReadonlyMap<number, readonly string[]>;

export const NO_TRAVEL_DAYS: TravelDays = new Map();

/**
 * Travel days from location rows. A row's day is its local date, as in the
 * photo index; within a day the rows are ordered by their instant (the
 * timestamp with its UTC offset applied), so a flight across time zones keeps
 * its real order. Rows without a readable time go last.
 */
export function travelDaysOf(
	rows: readonly { date: string; countryCode: string }[],
): TravelDays {
	const byDay = new Map<number, { time: number; code: string }[]>();
	for (const row of rows) {
		const code = row.countryCode.trim().toUpperCase();
		const day = dayNumber(row.date);
		if (!code || day === null) continue;
		const parsed = Date.parse(row.date);
		const time = Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
		const photos = byDay.get(day) ?? [];
		byDay.set(day, photos);
		photos.push({ time, code });
	}
	const travel = new Map<number, string[]>();
	for (const [day, photos] of byDay) {
		photos.sort((a, b) => a.time - b.time || a.code.localeCompare(b.code));
		const stretches: string[] = [];
		for (const { code } of photos)
			if (stretches.at(-1) !== code) stretches.push(code);
		if (stretches.length > 1) travel.set(day, stretches);
	}
	return travel;
}

/**
 * Where the stamp line sits, in days from day 0. A travel day is split in
 * equal parts, one per stretch. If the stamp day has a change into (entry) or
 * out of (exit) the stamp's country, the line is on that change; with several,
 * on the last one, the crossing whose side the day ends on. Otherwise on a day
 * edge: an entry (or a stamp of unknown direction) at the start of the stamp
 * day, an exit at its end. With the right date the line then falls on the
 * change from one country to the next.
 */
export function stampLine(
	day: number,
	direction: Direction,
	stampCode: string | null,
	travelDays: TravelDays,
): number {
	const via = travelDays.get(day) ?? [];
	for (let i = via.length - 1; i > 0; i--) {
		const into = direction === "entry" && via[i] === stampCode;
		const outOf = direction === "exit" && via[i - 1] === stampCode;
		if (into || outOf) return day + i / via.length;
	}
	return direction === "exit" ? day + 1 : day;
}

/**
 * The strip at a drag `shift` from the stamp `day`: the day under the line
 * (where a release lands), the line for that day, and `radius` days on each
 * side of it, so the line is always in the exact middle. The drawn strip, the
 * caption and the release all use this one result.
 */
export function stripView(
	stamp: {
		day: number;
		direction: Direction;
		stampCode: string | null;
		travelDays: TravelDays;
	},
	radius: number,
	shift = 0,
): { day: number; line: number; from: number; days: number } {
	const day = stamp.day + snapShift(shift);
	const line =
		stampLine(day, stamp.direction, stamp.stampCode, stamp.travelDays) +
		(shift - snapShift(shift));
	return { day, line, from: line - radius, days: radius * 2 };
}

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
