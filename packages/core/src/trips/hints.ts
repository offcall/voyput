import { day } from "../explore/dates";
import type { Passport } from "../passports/types";
import type { DatedStamp } from "./evidence";
import type { TravelMethod, TravelStay } from "./types";

export type HintSeverity = "error" | "warning" | "info";

/**
 * What a stay's row says about it. The crossing hints compare the previous
 * departure (`from`) with this arrival (`to`).
 */
export type StayHint =
	| { kind: "overnight"; severity: "info"; from: string; to: string }
	| { kind: "long-window"; severity: "warning"; from: string; to: string }
	| {
			kind: "gap";
			severity: "error";
			from: string;
			to: string;
			/** Days between them that no stay covers. */
			days: number;
	  }
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
	else if (delta > 2)
		hints.push({ kind: "gap", severity: "error", from, to, days: delta - 1 });
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
		for (const i of covering)
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

/**
 * Stays "Approve clear" approves: no error or warning, and both edges exact
 * (a stamp or set by hand). The first arrival counts once the birth date is
 * known; the last departure may stay open.
 */
export function clearStayIds(
	stays: readonly TravelStay[],
	hints: readonly (readonly StayHint[])[],
	birth: string | null,
): string[] {
	const exact = (source: string) => source === "stamp" || source === "manual";
	return stays.flatMap((s, i) => {
		if (s.approved) return [];
		if (hints[i]?.some((h) => h.severity !== "info")) return [];
		const arrival =
			exact(s.arrival.source) ||
			(i === 0 && s.arrival.date === null && !!birth);
		const departure =
			exact(s.departure.source) ||
			(i === stays.length - 1 && s.departure.date === null);
		return arrival && departure ? [s.id] : [];
	});
}
