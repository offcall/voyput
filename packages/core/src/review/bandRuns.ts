import { dayIso, dayNumber } from "../days";
import { zoneOf } from "../stamps/visits";
import type { DayRun } from "./dayRuns";
import { lowerBound } from "./lowerBound";
import type { PhotoIndex } from "./photoIndex";

/** An entry stamp paired with its exit stamp. Dates are YYYY-MM-DD, both days inside. */
export interface StampStay {
	start: string;
	end: string;
	/** Country code, or "Schengen" for the Schengen area (core `zoneOf`). */
	zone: string;
	/** Country of the entry stamp: fills the stay until a photo shows another one in the zone. */
	countryCode: string;
}

/** A run on the timeline band: from photos, or filled between an entry and an exit stamp. */
export type BandRun = DayRun &
	(
		| { source: "photos" }
		| {
				source: "stamps";
				/** Days of the entry and the exit stamp. */
				entry: string;
				exit: string;
		  }
	);

interface Span {
	start: number;
	end: number;
}

/**
 * Joins photo runs of one country that only days without photos separate:
 * photos in X on day 1 and next on day N, none elsewhere between, make one
 * run in X from day 1 to N, however long the silence. The day after the last
 * photo is unknown again; photos in another country start a new run.
 * `runs` are sorted by start and do not overlap.
 */
export const bridgeSameCountry = (runs: readonly DayRun[]): DayRun[] => {
	const out: DayRun[] = [];
	for (const run of runs) {
		const last = out[out.length - 1];
		if (last && last.countryCode === run.countryCode) last.end = run.end;
		else out.push({ ...run });
	}
	return out;
};

/**
 * Photo runs as they are, plus the days of each stamp stay that no photo run
 * covers, sorted by start. Photos win: a side trip seen in photos keeps its
 * country. A filled day takes the entry's country, or in a Schengen stay the
 * country of the last photo run inside the stay that is in the zone. A day an
 * earlier stay already filled is not filled again.
 */
export const mergeBandRuns = (
	photoRuns: readonly DayRun[],
	stays: readonly StampStay[],
): BandRun[] => {
	const photos: (Span & { code: string; last: string })[] = [];
	for (const run of photoRuns) {
		const start = dayNumber(run.start);
		const end = dayNumber(run.end);
		if (start !== null && end !== null)
			photos.push({ start, end, code: run.countryCode, last: run.end });
	}
	photos.sort((a, b) => a.start - b.start);
	const out: BandRun[] = photoRuns.map((run) => ({
		...run,
		source: "photos",
	}));
	const filled: Span[] = [];
	const ordered = [...stays].sort(
		(a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
	);
	for (const stay of ordered) {
		const from = dayNumber(stay.start);
		const to = dayNumber(stay.end);
		if (from === null || to === null || to < from) continue;
		const taken = [
			...photos,
			...filled.map((span) => ({ ...span, code: "", last: "" })),
		]
			.filter((span) => span.end >= from && span.start <= to)
			.sort((a, b) => a.start - b.start);
		let code = stay.countryCode;
		let cursor = from;
		const fill = (end: number) => {
			if (end < cursor) return;
			filled.push({ start: cursor, end });
			out.push({
				start: dayIso(cursor),
				end: dayIso(end),
				countryCode: code,
				source: "stamps",
				entry: stay.start,
				exit: stay.end,
			});
		};
		for (const span of taken) {
			fill(Math.min(span.start - 1, to));
			if (
				span.code &&
				zoneOf({ countryCode: span.code, date: span.last }) === stay.zone
			)
				code = span.code;
			cursor = Math.max(cursor, span.end + 1);
		}
		fill(to);
	}
	return out.sort((a, b) => a.start.localeCompare(b.start));
};

/** Photos of the run's country taken on its days. */
export const photosInRun = (index: PhotoIndex, run: DayRun): number => {
	const start = dayNumber(run.start);
	const end = dayNumber(run.end);
	if (start === null || end === null) return 0;
	let count = 0;
	const stop = lowerBound(index.days, end + 1);
	for (let i = lowerBound(index.days, start); i < stop; i++)
		if (index.countryCodes[i] === run.countryCode) count++;
	return count;
};
