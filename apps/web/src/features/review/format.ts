import type { BorderCrossing, Direction } from "@voyput/core";

/** Regional indicator flag for a two-letter code, or a white flag. */
export const flagOf = (code: string | null): string =>
	code && /^[A-Za-z]{2}$/.test(code)
		? String.fromCodePoint(
				...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
			)
		: "🏳️";

export const DIRECTIONS: readonly { value: Direction; label: string }[] = [
	{ value: "entry", label: "Entry" },
	{ value: "exit", label: "Exit" },
	{ value: "unknown", label: "Unknown" },
];

export const CROSSINGS: readonly {
	value: BorderCrossing;
	label: string;
	icon: string;
}[] = [
	{ value: "car", label: "Car", icon: "🚗" },
	{ value: "plane", label: "Plane", icon: "✈️" },
	{ value: "train", label: "Train", icon: "🚆" },
	{ value: "ship", label: "Ship", icon: "🚢" },
	{ value: "foot", label: "On foot", icon: "🚶" },
	{ value: "unknown", label: "Unknown", icon: "❔" },
];

export const directionIcon = (direction: Direction): string =>
	direction === "entry" ? "→" : direction === "exit" ? "←" : "?";

export const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export const crossingIcon = (crossing: BorderCrossing): string =>
	CROSSINGS.find((c) => c.value === crossing)?.icon ?? "";

export const plural = (n: number, one: string, many = `${one}s`): string =>
	`${n} ${n === 1 ? one : many}`;

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
] as const;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const parts = (iso: string) => {
	const match = ISO_DAY.exec(iso);
	const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
	return match && month
		? { year: match[1] ?? "", month, day: String(Number(match[3])) }
		: null;
};

/** "1 May 2023" for a YYYY-MM-DD date, as Review shows dates; other text as given. */
export const formatDay = (iso: string): string => {
	const p = parts(iso);
	return p ? `${p.day} ${p.month} ${p.year}` : iso;
};

/** "26 Apr – 3 May 2023"; both years when they differ. */
export const formatDayRange = (start: string, end: string): string => {
	const a = parts(start);
	const b = parts(end);
	if (!a || !b || a.year !== b.year)
		return `${formatDay(start)} – ${formatDay(end)}`;
	return `${a.day} ${a.month} – ${formatDay(end)}`;
};

/** Free text (notes, AI answers) with every YYYY-MM-DD date written as `formatDay` does. */
export const formatDatesIn = (text: string): string =>
	text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => formatDay(iso));
