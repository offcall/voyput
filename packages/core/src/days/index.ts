/**
 * Calendar days. A day is a local date, YYYY-MM-DD, with no time and no zone;
 * all arithmetic runs on UTC midnights, so daylight saving never shifts a day.
 */

/** A local calendar date, YYYY-MM-DD. */
export type LocalDay = string;

const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 for a YYYY-MM-DD date (or the date part of an ISO date-time); null when invalid. */
export const dayNumber = (iso: string): number | null => {
	const time = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(time) ? null : Math.floor(time / MS_PER_DAY);
};

/** YYYY-MM-DD for a day number. */
export const dayIso = (day: number): LocalDay =>
	new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

/** Day number of a date the caller knows is valid; an invalid one counts as day 0. */
const day = (iso: string): number => dayNumber(iso) ?? 0;

/** The day `days` after `iso` (before it when negative). Callers pass valid dates. */
export const addDays = (iso: string, days: number): LocalDay =>
	dayIso(day(iso) + days);

/** Days from `from` to `to`: 0 on the same day, negative when `to` is earlier. Callers pass valid dates. */
export const daysBetween = (from: string, to: string): number =>
	day(to) - day(from);

/** Days from `start` to `end`, both included. Callers pass valid dates. */
export const spanDays = (start: string, end: string): number =>
	daysBetween(start, end) + 1;

/** Days shared by two inclusive ranges. */
export const overlapDays = (
	start: string,
	end: string,
	from: string,
	to: string,
): number => {
	const a = start > from ? start : from;
	const b = end < to ? end : to;
	return a > b ? 0 : spanDays(a, b);
};

/**
 * The local day a photo was taken. Its date holds local time with an offset;
 * converting to UTC would move evening photos to the wrong day. Not validated.
 */
export const dayOf = (row: { readonly date: string }): LocalDay =>
	row.date.slice(0, 10);
