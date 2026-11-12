import { dayIso } from "./days";
import type { PhotoIndex } from "./photoIndex";

/** Consecutive days in one country, by the majority of each day's photos. */
export interface DayRun {
	start: string;
	end: string;
	countryCode: string;
}

/** A silence longer than this between photo days ends a run: it is a hole in the record. */
const MAX_BRIDGE_DAYS = 30;

/** One country per photo day, collapsed into runs, for the whole history. */
export const buildDayRuns = (index: PhotoIndex): DayRun[] => {
	const runs: DayRun[] = [];
	let current: { start: number; end: number; code: string } | null = null;
	const { days, countryCodes } = index;
	for (let i = 0; i < days.length; ) {
		const day = days[i] ?? 0;
		const counts = new Map<string, number>();
		for (; i < days.length && days[i] === day; i++) {
			const code = countryCodes[i] ?? "";
			counts.set(code, (counts.get(code) ?? 0) + 1);
		}
		let code = "";
		let best = 0;
		for (const [candidate, count] of counts)
			if (count > best) [code, best] = [candidate, count];
		if (
			current &&
			current.code === code &&
			day - current.end <= MAX_BRIDGE_DAYS
		) {
			current.end = day;
			continue;
		}
		if (current)
			runs.push({
				start: dayIso(current.start),
				end: dayIso(current.end),
				countryCode: current.code,
			});
		current = { start: day, end: day, code };
	}
	if (current)
		runs.push({
			start: dayIso(current.start),
			end: dayIso(current.end),
			countryCode: current.code,
		});
	return runs;
};

/** Runs overlapping [from, to], clipped to it. Dates are YYYY-MM-DD. */
export const runsBetween = (
	runs: readonly DayRun[],
	from: string,
	to: string,
): DayRun[] =>
	runs
		.filter((run) => run.end >= from && run.start <= to)
		.map((run) => ({
			...run,
			start: run.start < from ? from : run.start,
			end: run.end > to ? to : run.end,
		}));
