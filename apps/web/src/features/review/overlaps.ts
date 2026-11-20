import {
	findConflicts,
	pairVisits,
	type Stamp,
	type Visit,
} from "@voyput/core";
import { formatDayRange } from "./format";

/**
 * For every stamp of a stay that overlaps another stay (core `findConflicts`),
 * the other stays as text: "you are also in Turkey 3 – 8 Jul 2024". Both
 * stamps of each stay get it; several overlaps are joined with "; ".
 */
export function overlapNotes(stamps: readonly Stamp[]): Map<string, string> {
	const byId = new Map(stamps.map((stamp) => [stamp.id, stamp]));
	const describe = (visit: Visit): string | null => {
		const entry = byId.get(visit.entryStampId ?? "");
		const exit = byId.get(visit.exitStampId ?? "");
		if (!entry?.date || !exit?.date) return null;
		const place =
			visit.zone === "Schengen"
				? "the Schengen area"
				: (entry.country ?? visit.zone);
		return `you are also in ${place} ${formatDayRange(entry.date, exit.date)}`;
	};
	const notes = new Map<string, string[]>();
	const add = (visit: Visit, other: Visit) => {
		const text = describe(other);
		if (!text) return;
		for (const id of [visit.entryStampId, visit.exitStampId])
			if (id) notes.set(id, [...(notes.get(id) ?? []), text]);
	};
	for (const { first, second } of findConflicts(pairVisits(stamps), stamps)) {
		add(first, second);
		add(second, first);
	}
	return new Map([...notes].map(([id, texts]) => [id, texts.join("; ")]));
}
