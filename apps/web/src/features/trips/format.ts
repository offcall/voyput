import type { EdgeSource, TravelMethod } from "@voyput/core";

/** Regional indicator flag for a two-letter code, or an empty string. */
export const flagOf = (code: string): string =>
	/^[A-Za-z]{2}$/.test(code)
		? String.fromCodePoint(
				...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
			)
		: "";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (cc: string): string => {
	try {
		return regionNames.of(cc) ?? cc;
	} catch {
		return cc;
	}
};

const DAY_MS = 86_400_000;
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

export const addDays = (day: string, n: number): string =>
	new Date(toMs(day) + n * DAY_MS).toISOString().slice(0, 10);

/** Calendar days from `start` to `end`, both included. */
export const dayCount = (start: string, end: string): number =>
	Math.round((toMs(end) - toMs(start)) / DAY_MS) + 1;

export function daysIn(start: string, end: string): string[] {
	const days: string[] = [];
	for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
	return days;
}

const long = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});
const weekday = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	timeZone: "UTC",
});
const monthName = new Intl.DateTimeFormat("en-GB", {
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});

const asDate = (day: string) => new Date(toMs(day));
export const longDay = (day: string) => long.format(asDate(day));
export const weekdayOf = (day: string) => weekday.format(asDate(day));
export const monthOf = (day: string) => monthName.format(asDate(day));

export const plural = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

/** Today in the browser's time zone, YYYY-MM-DD: the end of a stay still going on. */
export function localToday(now = new Date()): string {
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${now.getFullYear()}-${m}-${d}`;
}

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const parts = (day: string) => ({
	d: Number(day.slice(8, 10)),
	m: MONTHS[Number(day.slice(5, 7)) - 1] ?? "",
	y: day.slice(0, 4),
});

/**
 * "21 → 25 June, 2016", "21 June → 16 July, 2016" or "21 June 2016 → 3 July 2017".
 * Null ends read "Since birth" and "now".
 */
export function stayRange(start: string | null, end: string | null): string {
	if (start === null && end === null) return "Since birth → now";
	if (start === null) {
		const e = parts(end ?? "");
		return `Since birth → ${e.d} ${e.m} ${e.y}`;
	}
	const s = parts(start);
	if (end === null) return `${s.d} ${s.m} ${s.y} → now`;
	const e = parts(end);
	if (s.y === e.y && s.m === e.m) return `${s.d} → ${e.d} ${e.m}, ${e.y}`;
	if (s.y === e.y) return `${s.d} ${s.m} → ${e.d} ${e.m}, ${e.y}`;
	return `${s.d} ${s.m} ${s.y} → ${e.d} ${e.m} ${e.y}`;
}

export const METHOD_NAMES: Readonly<Record<TravelMethod, string>> = {
	walk: "On foot",
	car: "Car",
	bus: "Bus",
	train: "Train",
	plane: "Plane",
	ship: "Ship",
	unknown: "Unknown method",
};

export const METHOD_ICONS: Readonly<Record<TravelMethod, string>> = {
	walk: "🚶",
	car: "🚗",
	bus: "🚌",
	train: "🚆",
	plane: "✈️",
	ship: "⛴️",
	unknown: "❔",
};

export const SOURCE_NAMES: Readonly<Record<EdgeSource, string>> = {
	stamp: "Stamp",
	photos: "From photos",
	estimated: "Estimated",
	manual: "Set by hand",
};
