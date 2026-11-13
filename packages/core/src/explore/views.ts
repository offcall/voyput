import type { CountryGroup } from "./aggregate";
import { addDays, day, overlapDays } from "./dates";
import type { FilteredStay } from "./types";

export const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

/** Monday first. */
export const WEEKDAY_LABELS = [
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat",
	"Sun",
] as const;

export interface CalendarDay {
	date: string;
	/** Day of the month, 1-based. */
	day: number;
	stays: FilteredStay[];
	/** Country to colour the cell with: a longer stay wins over a one-day one. */
	countryCode: string | null;
	/** A one-day stay falls on this day. */
	oneDay: boolean;
}

export interface CalendarMonth {
	/** 0 = January. */
	month: number;
	label: string;
	/** Empty cells before the 1st in a Monday-first week. */
	offset: number;
	days: CalendarDay[];
}

/** Twelve months of `year`, each day with the stays (clipped days) that cover it. */
export function buildStayCalendar(
	rows: readonly FilteredStay[],
	year: number,
): CalendarMonth[] {
	const byDay = new Map<string, FilteredStay[]>();
	const first = `${year}-01-01`;
	const last = `${year}-12-31`;
	for (const r of rows) {
		const a = r.clipStart > first ? r.clipStart : first;
		const b = r.clipEnd < last ? r.clipEnd : last;
		for (let d = a; d <= b; d = addDays(d, 1)) {
			const list = byDay.get(d) ?? [];
			list.push(r);
			byDay.set(d, list);
		}
	}
	return MONTH_LABELS.map((label, month) => {
		const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
		const days = Array.from({ length: count }, (_, i): CalendarDay => {
			const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
			const stays = byDay.get(date) ?? [];
			return {
				date,
				day: i + 1,
				stays,
				countryCode:
					(stays.find((s) => s.days > 1) ?? stays[0])?.countryCode ?? null,
				oneDay: stays.some((s) => s.days === 1),
			};
		});
		return { month, label, offset, days };
	});
}

export interface TimelineBar {
	stay: FilteredStay;
	/** Position and width as fractions of the year (0–1). */
	left: number;
	width: number;
	/** A one-day stay: drawn as a marker, not a bar. */
	oneDay: boolean;
}

export interface TimelineYear {
	year: number;
	bars: TimelineBar[];
}

/** One lane per year with stays, each stay placed by its clipped days. */
export function buildStayTimeline(
	rows: readonly FilteredStay[],
): TimelineYear[] {
	const years = new Set<number>();
	for (const r of rows)
		for (
			let y = Number(r.clipStart.slice(0, 4));
			y <= Number(r.clipEnd.slice(0, 4));
			y++
		)
			years.add(y);
	return [...years]
		.sort((a, b) => a - b)
		.map((year) => {
			const a = `${year}-01-01`;
			const b = `${year}-12-31`;
			const length = day(b) - day(a) + 1;
			const bars = rows.flatMap((stay): TimelineBar[] => {
				const width = overlapDays(stay.clipStart, stay.clipEnd, a, b);
				if (!width) return [];
				const start = stay.clipStart > a ? stay.clipStart : a;
				return [
					{
						stay,
						left: (day(start) - day(a)) / length,
						width: width / length,
						oneDay: stay.days === 1,
					},
				];
			});
			return { year, bars };
		});
}

export interface ScatterPoint {
	countryCode: string;
	country: string;
	visits: number;
	days: number;
	/** 0–1 along the visits axis. */
	x: number;
	/** 0–1 along the days axis, 0 at the bottom. */
	y: number;
	/** Far enough from the origin to carry a text label. */
	labelled: boolean;
}

export interface CountryScatter {
	points: ScatterPoint[];
	maxVisits: number;
	maxDays: number;
	/** Tick values at 0, ¼, ½, ¾ and the maximum. */
	visitTicks: number[];
	dayTicks: number[];
}

/** Countries placed by visits (x) and days (y). */
export function buildCountryScatter(
	groups: readonly CountryGroup[],
): CountryScatter {
	const maxVisits = Math.max(1, ...groups.map((g) => g.visits));
	const maxDays = Math.max(1, ...groups.map((g) => g.days));
	const ticks = (max: number) =>
		[0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * max));
	return {
		points: groups.map((g) => ({
			countryCode: g.countryCode,
			country: g.country,
			visits: g.visits,
			days: g.days,
			x: g.visits / maxVisits,
			y: g.days / maxDays,
			labelled: g.visits > maxVisits * 0.3 || g.days > maxDays * 0.3,
		})),
		maxVisits,
		maxDays,
		visitTicks: ticks(maxVisits),
		dayTicks: ticks(maxDays),
	};
}
