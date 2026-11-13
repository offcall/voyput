import type { StayHint } from "@voyput/core";
import { countryName, longDay, METHOD_NAMES, plural } from "./format";

/** Hints about the crossing into a stay; shown above its row. */
export const CROSSING_HINTS: ReadonlySet<StayHint["kind"]> = new Set([
	"overnight",
	"long-window",
	"gap",
	"overlap",
	"method-mismatch",
]);

export const HINT_ICONS: Readonly<Record<StayHint["kind"], string>> = {
	overnight: "🌙",
	"long-window": "⛴️",
	gap: "⚠",
	overlap: "⚠",
	"method-mismatch": "⚠",
	order: "⚠",
	"before-birth": "⚠",
	"missing-arrival": "⚠",
	"missing-departure": "⚠",
	"stamp-mismatch": "⚠",
	"passport-validity": "⚠",
};

/** One line of English for a hint. */
export function hintText(hint: StayHint): string {
	switch (hint.kind) {
		case "overnight":
			return `Overnight travel: left ${longDay(hint.from)}, arrived ${longDay(hint.to)}. A night flight or a crossing after midnight; not an error.`;
		case "long-window":
			return `Long travel window: left ${longDay(hint.from)}, arrived ${longDay(hint.to)}. Two days on the way: a ferry, a night train or a long transfer? Check it if needed.`;
		case "gap":
			return `Gap: ${plural(hint.days, "day")} between leaving on ${longDay(hint.from)} and arriving on ${longDay(hint.to)} that no stay covers.`;
		case "overlap":
			return `Overlap: arrives ${longDay(hint.to)}, ${plural(hint.days, "day")} before the previous stay ends (${longDay(hint.from)}).`;
		case "method-mismatch":
			return `Travel method mismatch: left by ${METHOD_NAMES[hint.from].toLowerCase()}, arrived by ${METHOD_NAMES[hint.to].toLowerCase()}.`;
		case "order":
			return "Departure is before arrival.";
		case "before-birth":
			return `Dated before the birth date (${longDay(hint.birth)}).`;
		case "missing-arrival":
			return "Arrival date is missing.";
		case "missing-departure":
			return "Departure date is missing before the next stay.";
		case "stamp-mismatch": {
			const { stamp } = hint;
			const country = countryName(stamp.countryCode);
			const kind =
				stamp.direction === "unknown" ? "stamp" : `${stamp.direction} stamp`;
			return `${country} ${kind} of ${longDay(stamp.date)}: no ${country} stay covers that day.`;
		}
		case "passport-validity": {
			const from = hint.validFrom ? longDay(hint.validFrom) : "…";
			const to = hint.validTo ? longDay(hint.validTo) : "…";
			return `The stamp of ${longDay(hint.stamp.date)} lies outside its passport's validity (${from} – ${to}).`;
		}
	}
}
