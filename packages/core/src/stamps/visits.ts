import type { Stamp } from "./types";

/** One stay in a zone, built from an entry stamp, an exit stamp, or both. */
export interface Visit {
	/** Country code, or "Schengen" for the Schengen area. */
	zone: string;
	entryStampId: string | null;
	exitStampId: string | null;
}

/** Two visits in different zones that overlap in time. */
export interface Conflict {
	first: Visit;
	second: Visit;
}

const each = (codes: string, date: string) =>
	codes.split(" ").map((code) => [code, date] as const);

/**
 * Date each country joined Schengen, as dated by the Schengen implementing
 * decisions: from then on its external-border stamps are Schengen stamps.
 * Some countries kept checks at internal borders of one kind (air, or land)
 * for a while after that. That split matters only for a crossing between two
 * members, which a stamp cannot tell apart, so it is not modelled:
 * - BE DE ES FR LU NL PT: 1995-03-26 (Schengen Convention in force).
 * - IT: 1997-10-26; AT: 1997-12-01 (internal land checks until 1998-04-01).
 * - GR: 2000-01-01 (internal checks until 2000-03-26).
 * - DK FI IS NO SE: 2001-03-25 (Nordic states).
 * - CZ EE HU LT LV MT PL SI SK: 2007-12-21 (internal air checks until 2008-03-30).
 * - CH: 2008-12-12 (internal air checks until 2009-03-29). LI: 2011-12-19.
 * - HR: 2023-01-01 (internal air checks until 2023-03-26).
 * - BG RO: 2024-03-31 (internal land checks until 2025-01-01).
 */
const SCHENGEN_SINCE: Record<string, string> = Object.fromEntries([
	...each("BE DE ES FR LU NL PT", "1995-03-26"),
	...each("IT", "1997-10-26"),
	...each("AT", "1997-12-01"),
	...each("GR", "2000-01-01"),
	...each("DK FI IS NO SE", "2001-03-25"),
	...each("CZ EE HU LT LV MT PL SI SK", "2007-12-21"),
	...each("CH", "2008-12-12"),
	...each("LI", "2011-12-19"),
	...each("HR", "2023-01-01"),
	...each("BG RO", "2024-03-31"),
]);

/**
 * Where a stay is counted: the whole Schengen area is one zone
 * (enter in Spain, exit in Italy = one visit), other countries are their own zone.
 */
export const zoneOf = (stamp: Stamp): string => {
	const joined = SCHENGEN_SINCE[stamp.countryCode ?? ""];
	return joined && (stamp.date ?? "") >= joined
		? "Schengen"
		: (stamp.countryCode ?? "?");
};

const toVisit = (
	stamp: Stamp,
	entry: Stamp | null,
	exit: Stamp | null,
): Visit => ({
	zone: zoneOf(stamp),
	entryStampId: entry?.id ?? null,
	exitStampId: exit?.id ?? null,
});

/**
 * Pairs stamps of ONE zone, already in date order: each entry is closed by the next exit.
 * Two entries in a row → the first stays unpaired. An exit with no open entry → unpaired.
 * A chronological heuristic: a missing or duplicate stamp can create a wrong pair.
 */
export const pairCountry = (stamps: readonly Stamp[]): Visit[] => {
	const visits: Visit[] = [];
	let open: Stamp | null = null;
	for (const stamp of stamps) {
		if (stamp.direction === "entry") {
			if (open) visits.push(toVisit(open, open, null));
			open = stamp;
		} else {
			visits.push(toVisit(open ?? stamp, open, stamp));
			open = null;
		}
	}
	if (open) visits.push(toVisit(open, open, null));
	return visits;
};

/**
 * Stamps of one zone by date. On one day, exits come first while an entry is
 * open (leaving and coming back, a visa run), entries first otherwise (in and
 * out on the same day, a transit). Same day and direction: by id, so the
 * result never depends on input order.
 */
const inDayOrder = (stamps: readonly Stamp[]): Stamp[] => {
	const byDate = [...stamps].sort(
		(a, b) =>
			(a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id),
	);
	const ordered: Stamp[] = [];
	for (let i = 0; i < byDate.length; ) {
		const date = byDate[i]?.date;
		const day = byDate.slice(i).filter((stamp) => stamp.date === date);
		const exits = day.filter((stamp) => stamp.direction === "exit");
		const entries = day.filter((stamp) => stamp.direction === "entry");
		const open = ordered.at(-1)?.direction === "entry";
		ordered.push(...(open ? [...exits, ...entries] : [...entries, ...exits]));
		i += day.length;
	}
	return ordered;
};

/** Builds visits from all stamps. Unknown-direction stamps and stamps with an open (not hidden) problem are not used. */
export const pairVisits = (stamps: readonly Stamp[]): Visit[] => {
	const directed = stamps.filter(
		(stamp) =>
			stamp.direction !== "unknown" &&
			(!stamp.problem || stamp.dismissed?.problem === true),
	);
	const pairable = directed.filter((stamp) => stamp.date && stamp.countryCode);
	const unpairable = directed.filter(
		(stamp) => !stamp.date || !stamp.countryCode,
	);

	const zones = new Map<string, Stamp[]>();
	for (const stamp of pairable) {
		const zone = zoneOf(stamp);
		zones.set(zone, [...(zones.get(zone) ?? []), stamp]);
	}
	const paired = [...zones.values()].flatMap((zoneStamps) =>
		pairCountry(inDayOrder(zoneStamps)),
	);
	const single = unpairable.map((stamp) =>
		stamp.direction === "entry"
			? toVisit(stamp, stamp, null)
			: toVisit(stamp, null, stamp),
	);
	return [...paired, ...single];
};

/**
 * Visits in different zones that overlap in time (nobody is in two places at once).
 * Leaving one country and entering another on the same day is fine.
 * Every conflict means at least one of the four dates or directions is misread.
 */
export const findConflicts = (
	visits: readonly Visit[],
	stamps: readonly Stamp[],
): Conflict[] => {
	const byId = new Map(stamps.map((stamp) => [stamp.id, stamp]));
	const spans = visits.flatMap((visit) => {
		const from = visit.entryStampId ? byId.get(visit.entryStampId)?.date : null;
		const to = visit.exitStampId ? byId.get(visit.exitStampId)?.date : null;
		return from && to ? [{ visit, from, to }] : [];
	});
	return spans.flatMap((a, index) =>
		spans
			.slice(index + 1)
			.filter(
				(b) => a.visit.zone !== b.visit.zone && a.from < b.to && b.from < a.to,
			)
			.map((b) => ({ first: a.visit, second: b.visit })),
	);
};
