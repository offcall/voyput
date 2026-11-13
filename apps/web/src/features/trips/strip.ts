import type { TripStop } from "@voyput/core";
import { daysIn } from "./format";

/** Days a strip block covers and how many of them each country had a stop. */
export interface StripBlock {
	from: string;
	to: string;
	/** Country code → days with a stop there, in order of first visit. */
	countries: { countryCode: string; days: number }[];
}

/**
 * The card's day strip as at most `maxBlocks` blocks: one per day for short
 * trips, otherwise each block takes the same number of days, so the strip
 * always fits the card.
 */
export function stripBlocks(
	start: string,
	end: string,
	stops: readonly TripStop[],
	maxBlocks = 60,
): StripBlock[] {
	const days = daysIn(start, end);
	const size = Math.max(1, Math.ceil(days.length / maxBlocks));
	const byDay = new Map<string, string[]>();
	for (const s of stops)
		byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.countryCode]);
	const blocks: StripBlock[] = [];
	for (let i = 0; i < days.length; i += size) {
		const span = days.slice(i, i + size);
		const counts = new Map<string, number>();
		for (const day of span)
			for (const cc of new Set(byDay.get(day) ?? []))
				counts.set(cc, (counts.get(cc) ?? 0) + 1);
		blocks.push({
			from: span[0] ?? start,
			to: span[span.length - 1] ?? start,
			countries: [...counts].map(([countryCode, n]) => ({
				countryCode,
				days: n,
			})),
		});
	}
	return blocks;
}
