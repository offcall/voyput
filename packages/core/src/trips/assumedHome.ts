import { addDays, daysBetween } from "../days";
import type { DatedStamp } from "./evidence";
import { gapBetween, type StayGap } from "./hints";
import type { TravelStay } from "./types";

/**
 * Days no stay covers, assumed to be in the home country the user picked
 * (ADR 0051). Never a stored stay: the list and Insights only show it.
 */
export interface AssumedHome extends StayGap {
	countryCode: string;
	/** Index of the stay before it. */
	after: number;
}

/**
 * The gaps between stays (`gapBetween`) and the days after the last stay up
 * to `today`, filled with `home`. A gap with a stamp inside stays a gap: the
 * stamp says where the traveller was, and the list shows it as an error.
 * Without a home country there is nothing to assume.
 */
export function assumedHomeGaps(
	stays: readonly TravelStay[],
	home: string | null,
	stamps: readonly Pick<DatedStamp, "date">[],
	today: string,
): AssumedHome[] {
	if (!home) return [];
	const gaps: { gap: StayGap; after: number }[] = [];
	stays.forEach((stay, i) => {
		const prev = stays[i - 1];
		const gap = prev ? gapBetween(prev, stay) : null;
		if (gap) gaps.push({ gap, after: i - 1 });
	});
	const last = stays.at(-1)?.departure.date ?? null;
	if (last !== null && daysBetween(last, today) > 1)
		gaps.push({
			gap: {
				from: last,
				to: addDays(today, 1),
				days: daysBetween(last, today),
			},
			after: stays.length - 1,
		});
	return gaps
		.filter(
			({ gap }) => !stamps.some((s) => gap.from < s.date && s.date < gap.to),
		)
		.map(({ gap, after }) => ({ ...gap, countryCode: home, after }));
}
