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

const isNullableText = (value: unknown): boolean =>
	value === null || (typeof value === "string" && value.trim() !== "");

const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

/** Everything wrong with one raw stamp object (empty list = valid). */
export const stampProblems = (raw: Record<string, unknown>): string[] =>
	[
		DIRECTIONS.includes(raw.direction as string)
			? ""
			: `bad direction ${JSON.stringify(raw.direction)}`,
		isValidDate(raw.date) ? "" : `bad date ${JSON.stringify(raw.date)}`,
		typeof raw.dateText === "string" ? "" : "missing dateText",
		isNullableText(raw.country) ? "" : "bad country",
		isNullableText(raw.location) ? "" : "bad location",
		raw.countryCode === null ||
		(typeof raw.countryCode === "string" && /^[A-Z]{2}$/.test(raw.countryCode))
			? ""
			: `bad countryCode ${JSON.stringify(raw.countryCode)}`,
		typeof raw.confidence === "number" &&
		raw.confidence >= 0 &&
		raw.confidence <= 100
			? ""
			: `bad confidence ${JSON.stringify(raw.confidence)}`,
	].filter(Boolean);

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/** Turns the model's text into checked stamps. Throws with the raw text on failure. */
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

		const stamps = root.stamps.map((value: unknown, index): ReadStamp => {
			if (!isObject(value))
				throw new Error(`stamp ${index + 1} is not an object`);
			const problems = stampProblems(value);
			if (problems.length)
				throw new Error(`stamp ${index + 1}: ${problems.join(", ")}`);
			const date = value.date as string | null;
			const dateText = value.dateText as string;
			return {
				direction: value.direction as Direction,
				borderCrossing: CROSSINGS.includes(value.borderCrossing as string)
					? (value.borderCrossing as BorderCrossing)
					: "unknown",
				dateText,
				date,
				country: value.country as string | null,
				countryCode: value.countryCode as string | null,
				location: value.location as string | null,
				confidence: value.confidence as number,
				notes: typeof value.notes === "string" ? value.notes : "",
				problem: dateProblem(date, dateText, range),
			};
		});

		return { notes: typeof root.notes === "string" ? root.notes : "", stamps };
	} catch (error) {
		throw new Error(
			`invalid model output (${errorMessage(error)})\n--- raw response ---\n${raw.slice(0, 1000)}`,
		);
	}
};
