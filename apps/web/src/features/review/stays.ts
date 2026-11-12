import type { Stamp } from "@voyput/core";

export type DatedStamp = Stamp & { date: string };

/** One row of the timeline: an entry paired with its exit, or a stamp alone. */
export type TimelineItem =
	| { kind: "stay"; entry: DatedStamp; exit: DatedStamp; days: number }
	| { kind: "single"; stamp: DatedStamp };

const DAY_MS = 86_400_000;
export const daysBetween = (from: string, to: string): number =>
	Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * Same day: leaving one country comes before entering the next, but entering
 * a country comes before leaving it again (a same-day transit).
 */
const rank = (stamp: Stamp, other: Stamp): number => {
	if (stamp.direction === "unknown") return 2;
	if (stamp.countryCode === other.countryCode)
		return stamp.direction === "entry" ? 0 : 1;
	return stamp.direction === "exit" ? 0 : 1;
};

export const chronological = (stamps: readonly Stamp[]): DatedStamp[] =>
	stamps
		.filter((s): s is DatedStamp => s.date !== null)
		.sort(
			(a, b) =>
				a.date.localeCompare(b.date) ||
				rank(a, b) - rank(b, a) ||
				a.id.localeCompare(b.id),
		);

const startOf = (item: TimelineItem): string =>
	item.kind === "stay" ? item.entry.date : item.stamp.date;
export const endOf = (item: TimelineItem): string =>
	item.kind === "stay" ? item.exit.date : item.stamp.date;

/** Pairs each entry with the next exit from the same country; the rest stay single. */
export function buildTimeline(stamps: readonly Stamp[]): TimelineItem[] {
	const sorted = chronological(stamps);
	const order = new Map(sorted.map((s, i) => [s.id, i]));
	const open = new Map<string, DatedStamp>();
	const items: TimelineItem[] = [];
	for (const stamp of sorted) {
		const code = stamp.countryCode;
		if (!code || stamp.direction === "unknown") {
			items.push({ kind: "single", stamp });
			continue;
		}
		const entry = open.get(code);
		if (stamp.direction === "entry") {
			if (entry) items.push({ kind: "single", stamp: entry });
			open.set(code, stamp);
		} else if (entry) {
			open.delete(code);
			items.push({
				kind: "stay",
				entry,
				exit: stamp,
				days: daysBetween(entry.date, stamp.date),
			});
		} else items.push({ kind: "single", stamp });
	}
	for (const entry of open.values())
		items.push({ kind: "single", stamp: entry });
	const first = (item: TimelineItem) =>
		order.get(item.kind === "stay" ? item.entry.id : item.stamp.id) ?? 0;
	return items.sort(
		(a, b) => startOf(a).localeCompare(startOf(b)) || first(a) - first(b),
	);
}
