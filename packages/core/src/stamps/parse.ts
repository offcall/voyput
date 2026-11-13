import { type DateRange, dateProblem, isValidDate } from "./dates";
import type { BorderCrossing, Direction, Stamp } from "./types";

/** The fields of a stamp that come from the model, plus our date check. */
export type ReadStamp = Pick<
	Stamp,
	| "direction"
	| "borderCrossing"
	| "dateText"
	| "date"
	| "country"
	| "countryCode"
	| "location"
	| "confidence"
	| "notes"
	| "problem"
>;

const DIRECTIONS: readonly string[] = ["entry", "exit", "unknown"];
const CROSSINGS: readonly string[] = [
	"car",
	"plane",
	"train",
	"ship",
	"foot",
	"unknown",
];

const text = (value: unknown): string | null =>
	typeof value === "string" && value.trim() !== "" ? value : null;

const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

/** "ro" → "RO"; anything that is not two letters is unknown. */
const countryCodeOf = (value: unknown): string | null => {
	const code = typeof value === "string" ? value.trim().toUpperCase() : "";
	return /^[A-Z]{2}$/.test(code) ? code : null;
};

const confidenceOf = (value: unknown): number => {
	const number =
		typeof value === "string" && value.trim() !== "" ? Number(value) : value;
	return typeof number === "number" && Number.isFinite(number)
		? Math.min(100, Math.max(0, number))
		: 0;
};

/**
 * Fields the model wrote but we could not use, as review warnings
 * (empty list = valid). Such fields are read as unknown, not rejected.
 */
export const stampProblems = (raw: Record<string, unknown>): string[] =>
	[
		DIRECTIONS.includes(raw.direction as string)
			? ""
			: `unreadable direction ${JSON.stringify(raw.direction)}`,
		isValidDate(raw.date ?? null)
			? ""
			: `unreadable date ${JSON.stringify(raw.date)}`,
		raw.countryCode == null || countryCodeOf(raw.countryCode)
			? ""
			: `unreadable country code ${JSON.stringify(raw.countryCode)}`,
	].filter(Boolean);

/** One raw stamp object, with bad fields read as unknown and named in `problem`. */
const readStamp = (
	raw: Record<string, unknown>,
	range: DateRange,
): ReadStamp => {
	const date = isValidDate(raw.date ?? null)
		? (raw.date as string | null)
		: null;
	const dateText = typeof raw.dateText === "string" ? raw.dateText : "";
	const problems = [
		...stampProblems(raw),
		dateProblem(date, dateText, range) ?? "",
	].filter(Boolean);
	return {
		direction: DIRECTIONS.includes(raw.direction as string)
			? (raw.direction as Direction)
			: "unknown",
		borderCrossing: CROSSINGS.includes(raw.borderCrossing as string)
			? (raw.borderCrossing as BorderCrossing)
			: "unknown",
		dateText,
		date,
		country: text(raw.country),
		countryCode: countryCodeOf(raw.countryCode),
		location: text(raw.location),
		confidence: confidenceOf(raw.confidence),
		notes: typeof raw.notes === "string" ? raw.notes : "",
		problem: problems.length ? problems.join("; ") : null,
	};
};

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Turns the model's text into checked stamps. Throws with the raw text only
 * when the text is not stamps at all (not JSON, no stamps array); a bad field
 * becomes unknown and a warning on its stamp.
 */
export const parsePhotoResponse = (
	raw: string,
	range: DateRange,
): { notes: string; stamps: ReadStamp[] } => {
	try {
		// Accept a single ```json fence, nothing else.
		const json = raw
			.trim()
			.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
		const root: unknown = JSON.parse(json);
		if (!isObject(root) || !Array.isArray(root.stamps))
			throw new Error("expected { notes, stamps[] }");

		const objects = root.stamps.filter(isObject);
		const skipped = root.stamps.length - objects.length;
		const notes = [
			typeof root.notes === "string" ? root.notes : "",
			skipped
				? `Skipped ${skipped} ${skipped === 1 ? "entry that is" : "entries that are"} not a stamp.`
				: "",
		]
			.filter(Boolean)
			.join(" ");
		return { notes, stamps: objects.map((stamp) => readStamp(stamp, range)) };
	} catch (error) {
		throw new Error(
			`invalid model output (${errorMessage(error)})\n--- raw response ---\n${raw.slice(0, 1000)}`,
		);
	}
};
