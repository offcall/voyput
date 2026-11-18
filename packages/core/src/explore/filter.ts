import { spanDays } from "../days";
import type { ExploreFilters, FilteredStay, Stay } from "./types";

/** Earliest start and latest end, or empty strings without stays. */
export function staysRange(stays: readonly Stay[]): [string, string] {
	let from = "";
	let to = "";
	for (const s of stays) {
		if (!from || s.start < from) from = s.start;
		if (!to || s.end > to) to = s.end;
	}
	return [from, to];
}

/** Everything shown, over the whole history. */
export function defaultExploreFilters(stays: readonly Stay[]): ExploreFilters {
	const [from, to] = staysRange(stays);
	return {
		from,
		to,
		countries: [],
		stayIds: [],
		region: "all",
		kind: "all",
		method: "all",
		evidence: "all",
		duration: "all",
		search: "",
	};
}

/** January 1 to December 31 of `year`, the end cut to the last stay's end. */
export function yearRange(
	year: number,
	stays: readonly Stay[],
): { from: string; to: string } {
	const last = staysRange(stays)[1];
	const end = `${year}-12-31`;
	return { from: `${year}-01-01`, to: last && last < end ? last : end };
}

/** Years from the first stay's start to the last stay's end. */
export function stayYears(stays: readonly Stay[]): number[] {
	const [from, to] = staysRange(stays);
	if (!from) return [];
	const first = Number(from.slice(0, 4));
	const last = Number(to.slice(0, 4));
	return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** Country codes of the stays, sorted by English name. */
export function stayCountries(stays: readonly Stay[]): string[] {
	const names = new Map(stays.map((s) => [s.countryCode, s.country]));
	return [...names.keys()].sort((a, b) =>
		(names.get(a) ?? a).localeCompare(names.get(b) ?? b),
	);
}

function matchesDuration(days: number, f: ExploreFilters["duration"]) {
	switch (f) {
		case "day":
			return days === 1;
		case "short":
			return days >= 2 && days <= 7;
		case "medium":
			return days >= 8 && days <= 30;
		case "long":
			return days >= 31;
		default:
			return true;
	}
}

function matchesEvidence(s: Stay, f: ExploreFilters["evidence"]) {
	const sources = [s.entry.source, s.exit.source];
	switch (f) {
		case "exact":
			return sources.every((x) => x === "stamp" || x === "manual");
		case "estimated":
			return s.estimated;
		case "stamps":
			return sources.includes("stamp");
		default:
			return true;
	}
}

/**
 * Stays that pass every filter and touch the date range, each cut to the
 * range. Duration buckets use the stay's full length, not the cut one.
 */
export function filterStays(
	stays: readonly Stay[],
	f: ExploreFilters,
): FilteredStay[] {
	const search = f.search.trim().toLowerCase();
	return stays
		.filter(
			(s) =>
				(!f.countries.length || f.countries.includes(s.countryCode)) &&
				(!f.stayIds.length || f.stayIds.includes(s.id)) &&
				(f.region === "all" || s.region === f.region) &&
				(f.kind === "all" || s.kind === f.kind) &&
				(f.method === "all" || s.entry.method === f.method) &&
				matchesEvidence(s, f.evidence) &&
				matchesDuration(s.days, f.duration) &&
				(!search ||
					`${s.country} ${s.countryCode} ${s.place}`
						.toLowerCase()
						.includes(search)) &&
				(!f.from || s.end >= f.from) &&
				(!f.to || s.start <= f.to),
		)
		.map((s) => {
			const clipStart = f.from && f.from > s.start ? f.from : s.start;
			const clipEnd = f.to && f.to < s.end ? f.to : s.end;
			return {
				...s,
				clipStart,
				clipEnd,
				clippedDays: spanDays(clipStart, clipEnd),
			};
		});
}
