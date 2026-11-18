import { addDays, type EdgeSource, type TravelMethod } from "@voyput/core";

/** The kit's `flagEmoji` under the name the Stays files use. */
export { flagEmoji as flagOf } from "@voyput/ui";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (cc: string): string => {
	try {
		return regionNames.of(cc) ?? cc;
	} catch {
		return cc;
	}
};

export function daysIn(start: string, end: string): string[] {
	const days: string[] = [];
	for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
	return days;
}

const weekday = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	timeZone: "UTC",
});
const monthName = new Intl.DateTimeFormat("en-GB", {
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
/** "1 May 2023". */
export const longDay = (day: string) => {
	const p = parts(day);
	return `${p.d} ${p.m} ${p.y}`;
};
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
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

const parts = (day: string) => ({
	d: Number(day.slice(8, 10)),
	m: MONTHS[Number(day.slice(5, 7)) - 1] ?? "",
	y: day.slice(0, 4),
});

/**
 * "21 → 25 Jun 2016", "21 Jun → 16 Jul 2016" or "21 Jun 2016 → 3 Jul 2017".
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
	if (s.y === e.y && s.m === e.m)
		return s.d === e.d
			? `${s.d} ${s.m} ${s.y}`
			: `${s.d} → ${e.d} ${e.m} ${e.y}`;
	if (s.y === e.y) return `${s.d} ${s.m} → ${e.d} ${e.m} ${e.y}`;
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
