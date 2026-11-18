import {
	addDays,
	gapBetween,
	type StayGap,
	staySpan,
	type TravelStay,
} from "@voyput/core";

import type { StayOrder } from "./tripStore";

/** One line of the list: a stay, or the days no stay covers between two stays. */
export type Item =
	| { kind: "stay"; index: number }
	| { kind: "gap"; after: number; gap: StayGap };

/** Items of one year, by the day each stay or gap begins. */
export interface YearGroup {
	year: string;
	items: Item[];
	stays: number;
}

/** Years open until the user folds them: the newest ones. */
export const OPEN_YEARS = 2;

/** The list in chronological order: stays, and gaps between them. */
export function itemsOf(stays: readonly TravelStay[]): Item[] {
	const items: Item[] = [];
	stays.forEach((stay, index) => {
		const prev = stays[index - 1];
		const gap = prev ? gapBetween(prev, stay) : null;
		if (gap) items.push({ kind: "gap", after: index - 1, gap });
		items.push({ kind: "stay", index });
	});
	return items;
}

/**
 * The list cut into years, in the order asked for. A stay belongs to the year
 * it begins (since birth: the birth year, or the year it ends when no birth date
 * is set); a gap to the year of its first day.
 */
export function yearGroups(
	stays: readonly TravelStay[],
	order: StayOrder,
	birth: string | null,
	today: string,
): YearGroup[] {
	const yearOf = (item: Item): string => {
		if (item.kind === "gap") return addDays(item.gap.from, 1).slice(0, 4);
		const stay = stays[item.index] as TravelStay;
		const { start, end } = staySpan(stay, birth, today);
		return (start ?? end ?? today).slice(0, 4);
	};
	const items = itemsOf(stays);
	if (order === "newest") items.reverse();
	const groups: YearGroup[] = [];
	for (const item of items) {
		const year = yearOf(item);
		let group = groups.at(-1);
		if (group?.year !== year) {
			group = { year, items: [], stays: 0 };
			groups.push(group);
		}
		group.items.push(item);
		if (item.kind === "stay") group.stays += 1;
	}
	return groups;
}

/** Years open by default: the newest `OPEN_YEARS` of the list. */
export function defaultOpenYears(groups: readonly YearGroup[]): Set<string> {
	const years = groups.map((g) => g.year).sort((a, b) => b.localeCompare(a));
	return new Set(years.slice(0, OPEN_YEARS));
}
