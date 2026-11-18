import { day } from "../explore/dates";
import type { Passport } from "../passports/types";
import type { DatedStamp } from "./evidence";
import type { TravelMethod, TravelStay } from "./types";

/**
 * What a stay's row says about it. The crossing hints compare the previous
 * departure (`from`) with this arrival (`to`).
 */
export type StayHint =
	| { kind: "overnight"; severity: "info"; from: string; to: string }
	| { kind: "long-window"; severity: "warning"; from: string; to: string }
	| {
			kind: "overlap";
			severity: "error";
			from: string;
			to: string;
			/** Days both stays claim, besides a shared border day. */
			days: number;
	  }
	| {
			kind: "method-mismatch";
			severity: "warning";
			from: TravelMethod;
			to: TravelMethod;
	  }
	| { kind: "order"; severity: "error" }
	| { kind: "before-birth"; severity: "error"; birth: string }
	| { kind: "missing-arrival"; severity: "error" }
	| { kind: "missing-departure"; severity: "error" }
	| { kind: "stamp-mismatch"; severity: "error"; stamp: DatedStamp }
	| {
			kind: "passport-validity";
			severity: "error";
			stamp: DatedStamp;
			validFrom: string | null;
			validTo: string | null;
	  };

export interface HintContext {
	/** Usable stamps, to find ones no stay in their country covers. */
	stamps: readonly DatedStamp[];
	passports: readonly Pick<Passport, "id" | "validFrom" | "validTo">[];
	/** YYYY-MM-DD, or null while unknown. */
	birth: string | null;
}

/** Previous departure → this arrival, in days; 0 is a shared border day. */
function crossingHints(prev: TravelStay, stay: TravelStay): StayHint[] {
	const from = prev.departure.date;
	const to = stay.arrival.date;
	if (from === null || to === null) return [];
	const delta = day(to) - day(from);
	const hints: StayHint[] = [];
	if (delta < 0)
		hints.push({ kind: "overlap", severity: "error", from, to, days: -delta });
	else if (delta === 1)
		hints.push({ kind: "overnight", severity: "info", from, to });
	else if (delta === 2)
		hints.push({ kind: "long-window", severity: "warning", from, to });
	const out = prev.departure.method;
	const into = stay.arrival.method;
	if (
		delta >= 0 &&
		delta <= 1 &&
		out !== "unknown" &&
		into !== "unknown" &&
		out !== into
	)
		hints.push({
			kind: "method-mismatch",
			severity: "warning",
			from: out,
			to: into,
		});
	return hints;
}

/** Days no stay covers between two stays in a row, when there is more than a travel window. */
export interface StayGap {
	/** The earlier stay's departure and the later one's arrival, YYYY-MM-DD. */
	from: string;
	to: string;
	/** Days strictly between them. */
	days: number;
}

/**
 * The gap between `prev` and the stay after it: more than one day between
 * departure and arrival (one day is a travel window, see the hints). Just a
 * gap, not an error: nothing is assumed about days without evidence.
 */
export function gapBetween(prev: TravelStay, next: TravelStay): StayGap | null {
	const from = prev.departure.date;
	const to = next.arrival.date;
	if (from === null || to === null) return null;
	const days = day(to) - day(from) - 1;
	return days > 1 ? { from, to, days } : null;
}

const covers = (s: TravelStay, date: string) =>
	(s.arrival.date === null || s.arrival.date <= date) &&
	(s.departure.date === null || date <= s.departure.date);

/** Hints for every stay, index for index, in the order of `stays`. */
export function stayHints(
	stays: readonly TravelStay[],
	context: HintContext,
): StayHint[][] {
	const passports = new Map(context.passports.map((p) => [p.id, p]));
	const stamps = new Map(context.stamps.map((s) => [s.id, s]));
	const hints = stays.map((stay, i): StayHint[] => {
		const list: StayHint[] = [];
		const prev = stays[i - 1];
		if (prev) list.push(...crossingHints(prev, stay));
		const { arrival, departure } = stay;
		if (arrival.date === null && i > 0)
			list.push({ kind: "missing-arrival", severity: "error" });
		if (departure.date === null && i < stays.length - 1)
			list.push({ kind: "missing-departure", severity: "error" });
		if (
			arrival.date !== null &&
			departure.date !== null &&
			arrival.date > departure.date
		)
			list.push({ kind: "order", severity: "error" });
		const birth = context.birth;
		if (
			birth &&
			((departure.date ?? birth) < birth || (arrival.date ?? birth) < birth)
		)
			list.push({ kind: "before-birth", severity: "error", birth });
		for (const id of stay.stampIds) {
			const stamp = stamps.get(id);
			const passport = stamp && passports.get(stamp.passportId);
			if (!stamp || !passport) continue;
			const { validFrom, validTo } = passport;
			if (
				(validFrom && stamp.date < validFrom) ||
				(validTo && stamp.date > validTo)
			)
				list.push({
					kind: "passport-validity",
					severity: "error",
					stamp,
					validFrom,
					validTo,
				});
		}
		return list;
	});
	// A stamp says the traveller was in its country that day.
	for (const stamp of context.stamps) {
		const covering = stays.flatMap((s, i) =>
			covers(s, stamp.date) ? [i] : [],
		);
		if (covering.some((i) => stays[i]?.countryCode === stamp.countryCode))
			continue;
		// No stay covers the day (a gap, or before or after the history): the
		// stay after it carries the error, or the last one.
		const after = stays.findIndex(
			(s) => s.arrival.date !== null && s.arrival.date > stamp.date,
		);
		const targets =
			covering.length > 0 ? covering : [after >= 0 ? after : stays.length - 1];
		for (const i of targets)
			hints[i]?.push({ kind: "stamp-mismatch", severity: "error", stamp });
	}
	return hints;
}

export const hasError = (hints: readonly StayHint[]) =>
	hints.some((h) => h.severity === "error");

export interface StayCounts {
	/** Not approved yet. */
	left: number;
	withErrors: number;
	approved: number;
}

export function stayCounts(
	stays: readonly TravelStay[],
	hints: readonly (readonly StayHint[])[],
): StayCounts {
	const approved = stays.filter((s) => s.approved).length;
	return {
		left: stays.length - approved,
		withErrors: hints.filter(hasError).length,
		approved,
	};
}

/** Days between the last evidence on one side of a crossing and the first on the other that still confirm it. */
const MEET_DAYS = 1;

/** The first and last day of a stay's photos, by `LocationRow.uuid`. */
function photoSpan(
	stay: TravelStay,
	photoDays: ReadonlyMap<string, string>,
): { first: string; last: string } | null {
	let first: string | null = null;
	let last: string | null = null;
	for (const id of stay.photoIds) {
		const d = photoDays.get(id);
		if (!d) continue;
		if (first === null || d < first) first = d;
		if (last === null || d > last) last = d;
	}
	return first && last ? { first, last } : null;
}

const exact = (source: string) => source === "stamp" || source === "manual";

/**
 * A crossing dated by photos is confirmed when evidence on both sides meets:
 * the last stamp or photo before it and the first after it are at most a day
 * apart (ADR 0034). A week without photos between two countries is not.
 */
function photosMeet(
	before: TravelStay | undefined,
	after: TravelStay | undefined,
	photoDays: ReadonlyMap<string, string>,
): boolean {
	if (!before || !after) return false;
	const out = before.departure;
	const into = after.arrival;
	if (out.source === "estimated" || into.source === "estimated") return false;
	const lastBefore = exact(out.source)
		? out.date
		: (photoSpan(before, photoDays)?.last ?? null);
	const firstAfter = exact(into.source)
		? into.date
		: (photoSpan(after, photoDays)?.first ?? null);
	if (lastBefore === null || firstAfter === null) return false;
	const days = day(firstAfter) - day(lastBefore);
	return days >= 0 && days <= MEET_DAYS;
}

/**
 * Stays "Approve" approves in bulk: no error or warning, no changed evidence,
 * and both edges confirmed: a stamp, set by hand, or photos that meet the
 * evidence across the border (`photoDays`, see `photosMeet`). The first
 * arrival counts once the birth date is known; the last departure may stay open.
 */
export function clearStayIds(
	stays: readonly TravelStay[],
	hints: readonly (readonly StayHint[])[],
	birth: string | null,
	photoDays: ReadonlyMap<string, string> = new Map(),
): string[] {
	return stays.flatMap((s, i) => {
		if (s.approved || s.evidenceChanged) return [];
		if (hints[i]?.some((h) => h.severity !== "info")) return [];
		const arrival =
			exact(s.arrival.source) ||
			(i === 0 && s.arrival.date === null && !!birth) ||
			(s.arrival.source === "photos" && photosMeet(stays[i - 1], s, photoDays));
		const departure =
			exact(s.departure.source) ||
			(i === stays.length - 1 && s.departure.date === null) ||
			(s.departure.source === "photos" &&
				photosMeet(s, stays[i + 1], photoDays));
		return arrival && departure ? [s.id] : [];
	});
}
