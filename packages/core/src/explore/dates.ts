import { dayIso, dayNumber } from "../review/days";

/** Day number of a YYYY-MM-DD date; callers pass valid dates. */
export const day = (iso: string): number => dayNumber(iso) ?? 0;

export const addDays = (iso: string, days: number): string =>
	dayIso(day(iso) + days);

/** Days from `start` to `end`, both included. */
export const spanDays = (start: string, end: string): number =>
	day(end) - day(start) + 1;

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
