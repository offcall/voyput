/** Passport validity window used to catch misread years. Bounds are YYYY-MM-DD. */
export interface DateRange {
	from: string | null;
	to: string | null;
}

/** True for null or a real calendar date written as YYYY-MM-DD. */
export const isValidDate = (value: unknown): value is string | null => {
	if (value === null) return true;
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
		return false;
	const time = Date.parse(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
	);
};

const MONTH_NAMES = [
	"JAN",
	"FEB",
	"MAR",
	"APR",
	"MAY",
	"JUN",
	"JUL",
	"AUG",
	"SEP",
	"OCT",
	"NOV",
	"DEC",
];

/** "2 DEC 2019" → "2  12  2019", so every format becomes plain digit groups. */
export const monthNamesToNumbers = (text: string): string =>
	text.toUpperCase().replace(/[A-Z]{3,}/g, (word) => {
		const index = MONTH_NAMES.indexOf(word.slice(0, 3));
		return index < 0 ? " " : ` ${String(index + 1).padStart(2, "0")} `;
	});

/**
 * Do day, month and year appear next to each other in the printed text?
 * Accepts "14 06 21 03", "17.05.22 41", "28 02 20 9 <", "2 DEC 2019".
 * Catches the classic mistake of reading an officer number as the year.
 */
export const dateMatchesText = (date: string, text: string): boolean => {
	const [year = "", month = "", day = ""] = date.split("-");
	const digits = (value: string) => `0?${Number(value)}`; // "09" matches "9" or "09"
	const pattern = new RegExp(
		`(^|\\D)${digits(day)}\\D+${digits(month)}\\D+(20)?${year.slice(2)}(\\D|$)`,
	);
	const normalized = monthNamesToNumbers(text);
	// Unevenly spaced digits: "1 5 07 1 9 9 <" → "2208189" contains "220818".
	const packed = normalized
		.replace(/\D/g, "")
		.includes(`${day}${month}${year.slice(2)}`);
	return pattern.test(normalized) || packed;
};

export const isInRange = (date: string, range: DateRange): boolean =>
	(!range.from || date >= range.from) && (!range.to || date <= range.to);

/** Why a readable stamp date looks wrong, or null if it looks fine. */
export const dateProblem = (
	date: string | null,
	dateText: string,
	range: DateRange,
): string | null => {
	if (date === null) return null;
	if (!isInRange(date, range))
		return `date ${date} is outside passport validity`;
	if (!dateMatchesText(date, dateText))
		return `date ${date} does not match printed "${dateText}"`;
	return null;
};
