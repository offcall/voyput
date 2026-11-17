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

/**
 * Full month names (and Russian/Ukrainian genitive forms), January first, in
 * English, French, German, Spanish, Italian, Portuguese, Turkish, Russian and
 * Ukrainian. A stamp abbreviation is any start of one of them: "JUIL", "DEZ", "ОКТ".
 */
const MONTH_FORMS: readonly string[][] = [
	[
		"JANUARY",
		"JANVIER",
		"JANUAR",
		"ENERO",
		"GENNAIO",
		"JANEIRO",
		"OCAK",
		"ЯНВАРЬ",
		"ЯНВАРЯ",
		"СІЧЕНЬ",
		"СІЧНЯ",
	],
	[
		"FEBRUARY",
		"FÉVRIER",
		"FEBRUAR",
		"FEBRERO",
		"FEBBRAIO",
		"FEVEREIRO",
		"ŞUBAT",
		"ФЕВРАЛЬ",
		"ФЕВРАЛЯ",
		"ЛЮТИЙ",
		"ЛЮТОГО",
	],
	[
		"MARCH",
		"MARS",
		"MÄRZ",
		"MARZO",
		"MARÇO",
		"MART",
		"МАРТ",
		"МАРТА",
		"БЕРЕЗЕНЬ",
		"БЕРЕЗНЯ",
	],
	[
		"APRIL",
		"AVRIL",
		"ABRIL",
		"APRILE",
		"NISAN",
		"АПРЕЛЬ",
		"АПРЕЛЯ",
		"КВІТЕНЬ",
		"КВІТНЯ",
	],
	[
		"MAY",
		"MAI",
		"MAYO",
		"MAGGIO",
		"MAIO",
		"MAYIS",
		"МАЙ",
		"МАЯ",
		"ТРАВЕНЬ",
		"ТРАВНЯ",
	],
	[
		"JUNE",
		"JUIN",
		"JUNI",
		"JUNIO",
		"GIUGNO",
		"JUNHO",
		"HAZIRAN",
		"ИЮНЬ",
		"ИЮНЯ",
		"ЧЕРВЕНЬ",
		"ЧЕРВНЯ",
	],
	[
		"JULY",
		"JUILLET",
		"JULI",
		"JULIO",
		"LUGLIO",
		"JULHO",
		"TEMMUZ",
		"ИЮЛЬ",
		"ИЮЛЯ",
		"ЛИПЕНЬ",
		"ЛИПНЯ",
	],
	[
		"AUGUST",
		"AOÛT",
		"AGOSTO",
		"AĞUSTOS",
		"АВГУСТ",
		"АВГУСТА",
		"СЕРПЕНЬ",
		"СЕРПНЯ",
	],
	[
		"SEPTEMBER",
		"SEPTEMBRE",
		"SEPTIEMBRE",
		"SETTEMBRE",
		"SETEMBRO",
		"EYLÜL",
		"СЕНТЯБРЬ",
		"СЕНТЯБРЯ",
		"ВЕРЕСЕНЬ",
		"ВЕРЕСНЯ",
	],
	[
		"OCTOBER",
		"OCTOBRE",
		"OKTOBER",
		"OCTUBRE",
		"OTTOBRE",
		"OUTUBRO",
		"EKİM",
		"ОКТЯБРЬ",
		"ОКТЯБРЯ",
		"ЖОВТЕНЬ",
		"ЖОВТНЯ",
	],
	[
		"NOVEMBER",
		"NOVEMBRE",
		"NOVIEMBRE",
		"NOVEMBRO",
		"KASIM",
		"НОЯБРЬ",
		"НОЯБРЯ",
		"ЛИСТОПАД",
		"ЛИСТОПАДА",
	],
	[
		"DECEMBER",
		"DÉCEMBRE",
		"DEZEMBER",
		"DICIEMBRE",
		"DICEMBRE",
		"DEZEMBRO",
		"ARALIK",
		"ДЕКАБРЬ",
		"ДЕКАБРЯ",
		"ГРУДЕНЬ",
		"ГРУДНЯ",
	],
];

/** Upper case without accents, so "Juil", "AOÛT", "ŞUBAT" and "Ekim" compare as printed on most stamps. */
const plainUpper = (word: string): string =>
	word.toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");

const PLAIN_FORMS = MONTH_FORMS.map((forms) => forms.map(plainUpper));

/**
 * Month number (1–12) of a whole word that starts one month name: "DEC", "SEPT",
 * "JUIL", "ОКТ"; 0 for shorter words, for other words such as "DECLARATION", and
 * for starts shared by two months, such as French "JUI" (juin, juillet).
 */
const monthOf = (word: string): number => {
	const plain = plainUpper(word);
	if (plain.length < 3) return 0;
	const months = PLAIN_FORMS.flatMap((forms, index) =>
		forms.some((form) => form.startsWith(plain)) ? [index + 1] : [],
	);
	return months.length === 1 ? (months[0] ?? 0) : 0;
};

const ROMAN_MONTHS = [
	"I",
	"II",
	"III",
	"IV",
	"V",
	"VI",
	"VII",
	"VIII",
	"IX",
	"X",
	"XI",
	"XII",
];

/** True when the word sits between two numbers, as in "12.VII.2019" or "12 OUT 2019". */
const betweenNumbers = (word: string, offset: number, text: string): boolean =>
	/\d[^\p{L}\d]*$/u.test(text.slice(0, offset)) &&
	/^[^\p{L}\d]*\d/u.test(text.slice(offset + word.length));

/** Month abbreviations that are also border-stamp labels: Portuguese "OUT" (outubro) is the English exit label. */
const LABEL_MONTHS = new Set(["OUT"]);

/**
 * How a word reads in a printed date: a month name, a Roman month, or nothing.
 * Roman months and label-like names count only between two numbers, so a stray
 * "V" or an "OUT 12 05 19" exit label stays a word.
 */
const wordMonth = (
	word: string,
	offset: number,
	text: string,
): { month: number; kind: "name" | "roman" } | null => {
	const month = monthOf(word);
	if (
		month > 0 &&
		(!LABEL_MONTHS.has(plainUpper(word)) || betweenNumbers(word, offset, text))
	)
		return { month, kind: "name" };
	const roman = ROMAN_MONTHS.indexOf(word) + 1;
	return roman > 0 && betweenNumbers(word, offset, text)
		? { month: roman, kind: "roman" }
		: null;
};

const twoDigits = (month: number): string => String(month).padStart(2, "0");

/** "2 DEC 2019" → " 2  12  2019", "12.VII.2019" → "12. 07 .2019": every format becomes plain digit groups. */
export const monthNamesToNumbers = (text: string): string =>
	text.replace(/\p{L}+/gu, (word, offset: number) => {
		const read = wordMonth(word, offset, text);
		return read ? ` ${twoDigits(read.month)} ` : " ";
	});

/** One number of the printed date; a month word becomes its two-digit month. */
interface Group {
	digits: string;
	kind: "number" | "name" | "roman";
}

const groupsOf = (text: string): Group[] =>
	[...text.matchAll(/\d+|\p{L}+/gu)].flatMap((match): Group[] => {
		const token = match[0];
		if (/^\d/.test(token)) return [{ digits: token, kind: "number" }];
		const read = wordMonth(token, match.index, text);
		return read ? [{ digits: twoDigits(read.month), kind: read.kind }] : [];
	});

/** A single printed digit: several in a row are one number printed apart ("1 7" is 17). */
const isSpaced = (group: Group | undefined): boolean =>
	group?.kind === "number" && group.digits.length === 1;

/** One date part: which groups may fill it and which value it needs. */
interface Part {
	kinds: readonly Group["kind"][];
	matches: (value: string) => boolean;
}

/**
 * Can the parts be read, in order, from consecutive digit groups? A part is one
 * group, or a run of single digits printed apart: "1 7" is 17, "0 6" is 06.
 * A run is never cut where no part goes on: "3 1 MAY" is not day 1, and
 * "2 0 2 3" is not year 20.
 */
const readsInOrder = (
	groups: readonly Group[],
	parts: readonly Part[],
): boolean => {
	const readFrom = (index: number, rest: readonly Part[]): boolean => {
		const [part, ...others] = rest;
		if (!part) return true;
		let value = "";
		for (let end = index; end < groups.length; end++) {
			const group = groups[end];
			if (!group || !part.kinds.includes(group.kind)) break;
			if (end > index && (!isSpaced(group) || value.length >= 4)) break;
			value += group.digits;
			const cutsRun =
				isSpaced(group) && isSpaced(groups[end + 1]) && others.length === 0;
			if (!cutsRun && part.matches(value) && readFrom(end + 1, others))
				return true;
			if (!isSpaced(group)) break;
		}
		return false;
	};
	return groups.some(
		(group, start) =>
			!(isSpaced(group) && isSpaced(groups[start - 1])) &&
			readFrom(start, parts),
	);
};

/**
 * Do day, month and year appear next to each other in the printed text?
 * Day-month-year: "14 06 21 03", "17.05.22 41", "28 02 20 9 <", "2 DEC 2019", "12.VII.2019".
 * Month-day-year only with a month name (US style): "MAR 24 2023", "JUL 1 7 2004".
 * Year-month-day only with a four-digit year: "2026/06/06", "2005 -11- 0 6".
 * A month word only ever fills the month.
 * Catches the classic mistake of reading an officer number as the year.
 */
export const dateMatchesText = (date: string, text: string): boolean => {
	const [year = "", month = "", day = ""] = date.split("-");
	const number = (wanted: string) => (value: string) =>
		/^\d{1,2}$/.test(value) && Number(value) === Number(wanted); // "09" matches "9" or "09"
	const dayPart: Part = { kinds: ["number"], matches: number(day) };
	const monthPart: Part = {
		kinds: ["number", "name", "roman"],
		matches: number(month),
	};
	const namedMonth: Part = { kinds: ["name"], matches: number(month) };
	const yearPart = (short: boolean): Part => ({
		kinds: ["number"],
		matches: (value) => value === year || (short && value === year.slice(2)),
	});
	const groups = groupsOf(text);
	// Unevenly spaced digits: "1 5 07 1 9 9 <" → "2208189" contains "220818".
	const packed = monthNamesToNumbers(text)
		.replace(/\D/g, "")
		.includes(`${day}${month}${year.slice(2)}`);
	return (
		readsInOrder(groups, [dayPart, monthPart, yearPart(true)]) ||
		readsInOrder(groups, [namedMonth, dayPart, yearPart(true)]) ||
		readsInOrder(groups, [yearPart(false), monthPart, dayPart]) ||
		packed
	);
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
		return `date ${date} does not match printed "${dateText.replaceAll(";", ",")}"`;
	return null;
};
