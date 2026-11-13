import { type DayRun, type Direction, dayIso, dayNumber } from "@voyput/core";
import { formatDayRange } from "./format";

/** Whole days `start`–`end` (day numbers, inclusive) in one country, or without photos. */
export interface StripSegment {
	start: number;
	end: number;
	/** Null: no photo on these days. */
	countryCode: string | null;
}

/**
 * Where the stamp line sits, as a day edge: an entry (or a stamp of unknown
 * direction) at the start of the stamp day, an exit at its end. With the right
 * date the line then falls on the change from one country to the next.
 */
export const lineEdge = (day: number, direction: Direction): number =>
	direction === "exit" ? day + 1 : day;

/**
 * The days shown: `radius` days on each side of the line, so the line is
 * always in the exact middle. `from` is a fraction while the strip is dragged.
 */
export const stripWindow = (
	edge: number,
	radius: number,
	shift = 0,
): { from: number; days: number } => ({
	from: edge + shift - radius,
	days: radius * 2,
});

/**
 * Sorted runs over the whole days `first`–`last`, cut to them; the days no run
 * covers come out as segments without a country, so every day is in one.
 */
export function stripSegments(
	runs: readonly DayRun[],
	first: number,
	last: number,
): StripSegment[] {
	const segments: StripSegment[] = [];
	let next = first;
	for (const run of runs) {
		const start = dayNumber(run.start);
		const end = dayNumber(run.end);
		if (start === null || end === null || end < next || start > last) continue;
		const from = Math.max(start, next);
		if (from > next)
			segments.push({ start: next, end: from - 1, countryCode: null });
		const to = Math.min(end, last);
		segments.push({ start: from, end: to, countryCode: run.countryCode });
		next = to + 1;
	}
	if (next <= last)
		segments.push({ start: next, end: last, countryCode: null });
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

/** "SG · 26 Apr – 26 Apr 2023", or "No photos · …". */
export const segmentTip = (segment: StripSegment): string =>
	`${segment.countryCode ?? "No photos"} · ${formatDayRange(
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
