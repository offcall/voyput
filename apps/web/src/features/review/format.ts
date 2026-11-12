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

/** Stable colour per country code, from the kit's categorical palette. */
export const countryColor = (code: string | null): string => {
	if (!code) return "var(--vp-muted-2)";
	const hash = [...code.toUpperCase()].reduce(
		(h, c) => (h * 31 + c.charCodeAt(0)) % 9973,
		7,
	);
	return `var(--vp-cat-${(hash % 10) + 1})`;
};

export const crossingIcon = (crossing: BorderCrossing): string =>
	CROSSINGS.find((c) => c.value === crossing)?.icon ?? "";

export const plural = (n: number, one: string, many = `${one}s`): string =>
	`${n} ${n === 1 ? one : many}`;
