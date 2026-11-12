import { countryColor } from "@voyput/core";

/** Regional indicator flag for a two-letter code, or an empty string. */
export const flagOf = (code: string): string =>
	/^[A-Za-z]{2}$/.test(code)
		? String.fromCodePoint(
				...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
			)
		: "";

/** Same hue as the Visualize charts, so a country looks the same everywhere. */
export const colorOf = (code: string): string => countryColor(code);

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

const short = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
});
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
export const shortDay = (day: string) => short.format(asDate(day));
export const longDay = (day: string) => long.format(asDate(day));
export const weekdayOf = (day: string) => weekday.format(asDate(day));
export const monthOf = (day: string) => monthName.format(asDate(day));

/** "10 – 24 Aug 2016", "28 Jun – 3 Jul 2019" or across years in full. */
export function rangeText(start: string, end: string): string {
	if (start === end) return longDay(start);
	if (start.slice(0, 4) !== end.slice(0, 4))
		return `${longDay(start)} – ${longDay(end)}`;
	return `${shortDay(start)} – ${longDay(end)}`;
}

export const plural = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;
