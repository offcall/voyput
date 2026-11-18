import { daysBetween, pairVisits, type Stamp } from "@voyput/core";

export type DatedStamp = Stamp & { date: string };

/** One row of the timeline: an entry paired with its exit, or a stamp alone. */
export type TimelineItem =
	| {
			kind: "stay";
			/** Country code, or "Schengen" for the Schengen area. */
			zone: string;
			entry: DatedStamp;
			exit: DatedStamp;
			days: number;
	  }
	| { kind: "single"; stamp: DatedStamp };

const isDated = (s: Stamp): s is DatedStamp => s.date !== null;

/**
 * A problem the user has not marked "Looks right". Core `pairVisits` and
 * `usableStamps` leave such stamps out; a hidden problem no longer counts.
 */
export const hasOpenProblem = (s: Stamp): boolean =>
	Boolean(s.problem) && s.dismissed?.problem !== true;

/** Same day: leaving comes before entering; unknown direction last. */
const DIRECTION_RANK = { exit: 0, entry: 1, unknown: 2 } as const;

/** Dated stamps by date, then direction, then id: a total order. */
export const chronological = (stamps: readonly Stamp[]): DatedStamp[] =>
	stamps
		.filter(isDated)
		.sort(
			(a, b) =>
				a.date.localeCompare(b.date) ||
				DIRECTION_RANK[a.direction] - DIRECTION_RANK[b.direction] ||
				a.id.localeCompare(b.id),
		);

export const startOf = (item: TimelineItem): string =>
	item.kind === "stay" ? item.entry.date : item.stamp.date;
export const endOf = (item: TimelineItem): string =>
	item.kind === "stay" ? item.exit.date : item.stamp.date;

/** Same start day: a lone exit, then stays, then a lone entry, then the rest. */
const itemRank = (item: TimelineItem): number =>
	item.kind === "stay"
		? 1
		: ([0, 2, 3][DIRECTION_RANK[item.stamp.direction]] ?? 3);
const itemId = (item: TimelineItem): string =>
	item.kind === "stay" ? item.entry.id : item.stamp.id;

/**
 * Pairs entries with exits with core `pairVisits` (the Schengen area is one
 * zone), like trips; unknown-direction stamps, those with an open problem and
 * those without a country stay single. Pairing and item order are total
 * orders, so the result never depends on input order. Undated stamps are left out.
 */
export function buildTimeline(stamps: readonly Stamp[]): TimelineItem[] {
	const dated = stamps.filter(isDated);
	const byId = new Map(dated.map((s) => [s.id, s]));
	const used = new Set<string>();
	const items: TimelineItem[] = [];
	for (const visit of pairVisits(stamps)) {
		const entry = visit.entryStampId ? byId.get(visit.entryStampId) : undefined;
		const exit = visit.exitStampId ? byId.get(visit.exitStampId) : undefined;
		if (entry && exit)
			items.push({
				kind: "stay",
				zone: visit.zone,
				entry,
				exit,
				days: daysBetween(entry.date, exit.date),
			});
		else {
			const stamp = entry ?? exit;
			if (stamp) items.push({ kind: "single", stamp });
		}
		for (const s of [entry, exit]) if (s) used.add(s.id);
	}
	for (const stamp of dated)
		if (!used.has(stamp.id)) items.push({ kind: "single", stamp });
	return items.sort(
		(a, b) =>
			startOf(a).localeCompare(startOf(b)) ||
			itemRank(a) - itemRank(b) ||
			endOf(a).localeCompare(endOf(b)) ||
			itemId(a).localeCompare(itemId(b)),
	);
}
