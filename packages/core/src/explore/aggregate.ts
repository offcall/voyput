import { addDays, overlapDays } from "./dates";
import { DURATION_LABELS, METHOD_LABELS } from "./labels";
import { REGIONS, type Region } from "./regions";
import type { FilteredStay, Stay } from "./types";

export interface ExploreKpis {
	stays: number;
	countries: number;
	/** Days inside the range, home stays included. */
	days: number;
	/** The same without home stays. */
	daysAbroad: number;
	/** Stays of a single day. */
	oneDay: number;
	transits: number;
	estimated: number;
	/** Most clipped days; the earliest one on a tie. */
	longest: FilteredStay | null;
}

export function exploreKpis(rows: readonly FilteredStay[]): ExploreKpis {
	let longest: FilteredStay | null = null;
	for (const r of rows)
		if (!longest || r.clippedDays > longest.clippedDays) longest = r;
	const sum = (list: readonly FilteredStay[]) =>
		list.reduce((n, r) => n + r.clippedDays, 0);
	return {
		stays: rows.length,
		countries: new Set(rows.map((r) => r.countryCode)).size,
		days: sum(rows),
		daysAbroad: sum(rows.filter((r) => !r.home)),
		oneDay: rows.filter((r) => r.days === 1).length,
		transits: rows.filter((r) => r.kind === "transit").length,
		estimated: rows.filter((r) => r.estimated).length,
		longest,
	};
}

export interface CountryGroup {
	countryCode: string;
	country: string;
	region: Region;
	days: number;
	visits: number;
	stamps: number;
	stopDays: number;
	estimated: number;
	transits: number;
	/** Longest single visit, in clipped days. */
	longest: number;
}

/** One group per country, most days first. */
export function groupByCountry(rows: readonly FilteredStay[]): CountryGroup[] {
	const groups = new Map<string, CountryGroup>();
	for (const r of rows) {
		let g = groups.get(r.countryCode);
		if (!g) {
			g = {
				countryCode: r.countryCode,
				country: r.country,
				region: r.region,
				days: 0,
				visits: 0,
				stamps: 0,
				stopDays: 0,
				estimated: 0,
				transits: 0,
				longest: 0,
			};
			groups.set(r.countryCode, g);
		}
		g.days += r.clippedDays;
		g.visits++;
		g.stamps += r.stamps;
		g.stopDays += r.stopDays;
		if (r.estimated) g.estimated++;
		if (r.kind === "transit") g.transits++;
		g.longest = Math.max(g.longest, r.clippedDays);
	}
	return [...groups.values()].sort(
		(a, b) => b.days - a.days || a.country.localeCompare(b.country),
	);
}

export interface YearRow {
	year: number;
	/** Stays that start in this year. */
	visits: number;
	countries: number;
	days: number;
	/** Every region, in `REGIONS` order; the days add up to `days`. */
	regions: { region: Region; days: number }[];
}

/** One row per year from `from` to `to`, days counted inside each year. */
export function buildYearRows(
	rows: readonly FilteredStay[],
	from: string,
	to: string,
): YearRow[] {
	if (!from || !to) return [];
	const out: YearRow[] = [];
	for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
		const a = `${y}-01-01`;
		const b = `${y}-12-31`;
		const byRegion = new Map<Region, number>();
		const countries = new Set<string>();
		let days = 0;
		for (const r of rows) {
			const d = overlapDays(r.clipStart, r.clipEnd, a, b);
			if (!d) continue;
			days += d;
			countries.add(r.countryCode);
			byRegion.set(r.region, (byRegion.get(r.region) ?? 0) + d);
		}
		out.push({
			year: y,
			visits: rows.filter((r) => r.start.startsWith(String(y))).length,
			countries: countries.size,
			days,
			regions: REGIONS.map((region) => ({
				region,
				days: byRegion.get(region) ?? 0,
			})),
		});
	}
	return out;
}

export interface StayRoute {
	from: string;
	to: string;
	/** "Moldova → Romania". */
	label: string;
	count: number;
}

/**
 * Country changes between stays that follow each other directly: next in the
 * original order and starting the day after. A filtered-out stay in between
 * breaks the link. Most frequent first.
 */
export function buildStayRoutes(rows: readonly Stay[]): StayRoute[] {
	const routes = new Map<string, StayRoute>();
	for (let i = 1; i < rows.length; i++) {
		const a = rows[i - 1] as Stay;
		const b = rows[i] as Stay;
		if (b.order !== a.order + 1 || a.countryCode === b.countryCode) continue;
		if (b.start !== addDays(a.end, 1)) continue;
		const key = `${a.countryCode}>${b.countryCode}`;
		const route = routes.get(key) ?? {
			from: a.countryCode,
			to: b.countryCode,
			label: `${a.country} → ${b.country}`,
			count: 0,
		};
		route.count++;
		routes.set(key, route);
	}
	return [...routes.values()].sort(
		(a, b) => b.count - a.count || a.label.localeCompare(b.label),
	);
}

export interface Bar {
	id: string;
	label: string;
	value: number;
	countryCode?: string;
}

/** The `limit` largest bars and the scale maximum (at least 1). */
export function topBars(
	bars: readonly Bar[],
	limit: number,
): { bars: Bar[]; max: number } {
	const top = [...bars].sort((a, b) => b.value - a.value).slice(0, limit);
	return { bars: top, max: Math.max(1, ...top.map((b) => b.value)) };
}

/** Longest stays as bars: "Romania · 2016-06", clipped days. */
export function longestStayBars(rows: readonly FilteredStay[]): Bar[] {
	return rows.map((r) => ({
		id: r.id,
		label: `${r.country} · ${r.start.slice(0, 7)}`,
		value: r.clippedDays,
		countryCode: r.countryCode,
	}));
}

const LENGTH_BUCKETS: readonly [string, number, number][] = [
	[DURATION_LABELS.day, 1, 1],
	[DURATION_LABELS.short, 2, 7],
	[DURATION_LABELS.medium, 8, 30],
	["31–90 days", 31, 90],
	["91+ days", 91, Number.POSITIVE_INFINITY],
];

/** Stays per length bucket, by full length, shortest bucket first. */
export function durationBars(rows: readonly Stay[]): Bar[] {
	return LENGTH_BUCKETS.map(([label, min, max]) => ({
		id: label,
		label,
		value: rows.filter((r) => r.days >= min && r.days <= max).length,
	}));
}

/** Stays per entry method, in `METHOD_LABELS` order. */
export function entryMethodBars(rows: readonly Stay[]): Bar[] {
	return Object.entries(METHOD_LABELS).map(([method, label]) => ({
		id: method,
		label,
		value: rows.filter((r) => r.entry.method === method).length,
	}));
}

/** Rows that are the first stay ever in their country (judged on `all`). */
export function firstVisits<T extends Stay>(
	all: readonly Stay[],
	rows: readonly T[],
): T[] {
	const first = new Map<string, Stay>();
	for (const s of all) {
		const seen = first.get(s.countryCode);
		if (!seen || s.start < seen.start) first.set(s.countryCode, s);
	}
	return rows.filter((r) => first.get(r.countryCode)?.id === r.id);
}
