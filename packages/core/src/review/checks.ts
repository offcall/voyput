import { dayIso, dayNumber } from "../days";
import type { Direction } from "../stamps/types";
import { lowerBound } from "./lowerBound";
import { countryLabel, type PhotoIndex } from "./photoIndex";

/** A dated photo near a stamp's date. */
export interface NearbyPhoto {
	date: string;
	countryCode: string;
	country: string;
	filename: string;
	/** Days between the photo and the stamp. */
	gap: number;
}

/** What the location history says about a stamp; both texts empty when it agrees. */
export interface StampCheck {
	icloudCheck: string;
	suggestion: string;
	/** The date the suggestion points to, for a one-click fix; missing when it points to none. */
	fixDate?: string;
}

const NEAR_DAYS = 2;
/** Default for `checkStamp`'s `window`: how far a photo in another country still warns. */
const STAMP_CHECK_WINDOW = 10;
const SUGGEST_WINDOW = 30;
const NEARBY_COUNT = 5;
/** Days either side of the same date a year earlier or later that still count. */
const YEAR_TOLERANCE = 3;

const NO_CHECK: StampCheck = { icloudCheck: "", suggestion: "" };

/** The `count` photos closest in time to `date`, nearest first. */
export const nearbyPhotos = (
	index: PhotoIndex,
	date: string | null,
	count = NEARBY_COUNT,
): NearbyPhoto[] => {
	const target = date ? dayNumber(date) : null;
	if (target === null) return [];
	const { days } = index;
	const result: NearbyPhoto[] = [];
	// Walk outwards from the insertion point, always taking the closer side.
	let right = lowerBound(days, target);
	let left = right - 1;
	while (result.length < count && (left >= 0 || right < days.length)) {
		const leftGap = left >= 0 ? target - (days[left] ?? 0) : Infinity;
		const rightGap =
			right < days.length ? (days[right] ?? 0) - target : Infinity;
		const i = leftGap <= rightGap ? left-- : right++;
		const code = index.countryCodes[i] ?? "";
		result.push({
			date: dayIso(days[i] ?? 0),
			countryCode: code,
			country: countryLabel(index, code),
			filename: index.filenames[i] ?? "",
			gap: Math.min(leftGap, rightGap),
		});
	}
	return result;
};

interface FoundPhoto {
	gap: number;
	date: string;
	filename: string;
	countryCode: string;
}

/**
 * The photo closest to `target` on the days `target + from` to `target + to`
 * that `match` accepts; the earlier one on a tie.
 */
const nearestWhere = (
	index: PhotoIndex,
	target: number,
	[from, to]: [number, number],
	match: (code: string) => boolean,
): FoundPhoto | null => {
	const end = lowerBound(index.days, target + to + 1);
	let best: FoundPhoto | null = null;
	for (let i = lowerBound(index.days, target + from); i < end; i++) {
		const code = index.countryCodes[i] ?? "";
		if (!match(code)) continue;
		const day = index.days[i] ?? 0;
		const gap = Math.abs(day - target);
		if (!best || gap < best.gap)
			best = {
				gap,
				date: dayIso(day),
				filename: index.filenames[i] ?? "",
				countryCode: code,
			};
	}
	return best;
};

/**
 * Days around the stamp date (as offsets) on which a photo in the stamp's
 * country confirms it. An entry may be followed by photos only the next day
 * (a night arrival); an exit may follow the last photos of the day before
 * (a night departure). Photos in other countries on those days, such as
 * home before a morning flight or an airside transit, do not count against it.
 */
const confirmingDays = (
	direction: Direction | null | undefined,
): [number, number] =>
	direction === "entry" ? [0, 1] : direction === "exit" ? [-1, 0] : [-1, 1];

/**
 * Days around the stamp date (as offsets) on which a photo in another country
 * contradicts it. After an exit the traveller is expected elsewhere, and so
 * before an entry: an exit is contradicted only by photos on or before its
 * date, an entry only by photos on or after it; an unknown direction by both.
 */
const contradictingDays = (
	direction: Direction | null | undefined,
	window: number,
): [number, number] =>
	direction === "entry"
		? [0, window]
		: direction === "exit"
			? [-window, 0]
			: [-window, window];

const hasPhotoIn = (
	index: PhotoIndex,
	code: string,
	from: number,
	to: number,
): boolean => {
	const end = lowerBound(index.days, to + 1);
	for (let i = lowerBound(index.days, from); i < end; i++)
		if (index.countryCodes[i] === code) return true;
	return false;
};

/** `iso` moved by `years` years; 29 February lands on 28 February. */
const shiftYear = (iso: string, years: number): string | null => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!match) return null;
	const year = Number(match[1]) + years;
	const month = Number(match[2]);
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const day = Math.min(Number(match[3]), lastDay);
	return `${String(year).padStart(4, "0")}-${match[2]}-${String(day).padStart(2, "0")}`;
};

interface OtherYear {
	/** The stamp date in that year. */
	date: string;
	first: string;
	last: string;
	gap: number;
}

/**
 * Photos in `code` within `YEAR_TOLERANCE` days of the same date one year
 * before or after `date`, which hint at a misread year; the year whose nearest
 * photo is closer wins, the earlier one on a tie.
 */
const otherYearPhotos = (
	index: PhotoIndex,
	code: string,
	date: string,
): OtherYear | null => {
	let best: OtherYear | null = null;
	for (const years of [-1, 1]) {
		const shifted = shiftYear(date, years);
		const target = shifted ? dayNumber(shifted) : null;
		if (!shifted || target === null) continue;
		let first: number | null = null;
		let last = 0;
		let gap = Infinity;
		const end = lowerBound(index.days, target + YEAR_TOLERANCE + 1);
		for (
			let i = lowerBound(index.days, target - YEAR_TOLERANCE);
			i < end;
			i++
		) {
			if (index.countryCodes[i] !== code) continue;
			const day = index.days[i] ?? 0;
			first ??= day;
			last = day;
			gap = Math.min(gap, Math.abs(day - target));
		}
		if (first !== null && (!best || gap < best.gap))
			best = { date: shifted, first: dayIso(first), last: dayIso(last), gap };
	}
	return best;
};

/**
 * Checks a stamp against the photo locations around its date. It agrees when
 * the stamp's country has a photo on its confirming days (`confirmingDays`).
 * Otherwise the nearest photo in another country within `window` days (10 by
 * default) on the side that contradicts the stamp (`contradictingDays`: on or
 * before an exit, on or after an entry, either side when the direction is
 * unknown) is a warning; with none, nothing contradicts the stamp. The
 * suggestion points to the nearest photo in the stamp's own country within
 * 30 days, which hints at a misread date. With no such photo, photos in the
 * stamp's country within 3 days of the same date a year earlier or later hint
 * at a misread year: that suggestion comes with or without a warning. The
 * date a suggestion points to is `fixDate`.
 */
export const checkStamp = (
	index: PhotoIndex,
	stamp: {
		date: string | null;
		countryCode: string | null;
		direction?: Direction | null;
	},
	window = STAMP_CHECK_WINDOW,
): StampCheck => {
	const code = (stamp.countryCode ?? "").toUpperCase();
	const target = stamp.date ? dayNumber(stamp.date) : null;
	if (!code || target === null) return NO_CHECK;
	const [from, to] = confirmingDays(stamp.direction);
	if (hasPhotoIn(index, code, target + from, target + to)) return NO_CHECK;
	const stampCountry = countryLabel(index, code);
	const confirm = nearestWhere(
		index,
		target,
		[-SUGGEST_WINDOW, SUGGEST_WINDOW],
		(c) => c === code,
	);
	const year =
		confirm || !stamp.date ? null : otherYearPhotos(index, code, stamp.date);
	const yearHint = year
		? `Maybe ${year.date.slice(0, 4)}? Photos in ${stampCountry} ${
				year.first === year.last
					? `on ${year.first}`
					: `from ${year.first} to ${year.last}`
			}`
		: "";
	const fixDate = confirm?.date ?? year?.date;
	const fix = fixDate ? { fixDate } : {};
	const nearest = nearestWhere(
		index,
		target,
		contradictingDays(stamp.direction, window),
		(c) => c !== code,
	);
	if (!nearest)
		return year ? { icloudCheck: "", suggestion: yearHint, ...fix } : NO_CHECK;
	const country = countryLabel(index, nearest.countryCode);
	const photo = `photo${nearest.filename ? ` "${nearest.filename}"` : ""}`;

	if (nearest.gap <= NEAR_DAYS)
		return {
			icloudCheck: `${nearest.gap} day(s) from the stamp date, a ${photo} was taken in ${country}, not ${stampCountry}`,
			suggestion: confirm
				? `Possible correct date is around ${confirm.date} (photo "${confirm.filename}" in ${stampCountry}, ${confirm.gap} day(s) from the stamp date)`
				: yearHint ||
					`No photos in ${stampCountry} within ${SUGGEST_WINDOW} days: the country may be misread (nearby photos show ${country})`,
			...fix,
		};
	return {
		icloudCheck: `Possible inaccuracy: the nearest ${photo} (${nearest.gap} day(s) away) is in ${country}`,
		suggestion: confirm
			? `There is also a photo in ${stampCountry} on ${confirm.date} ("${confirm.filename}", ${confirm.gap} day(s) away); check which date is right`
			: yearHint ||
				`No photos in ${stampCountry} within ${SUGGEST_WINDOW} days: check by hand`,
		...fix,
	};
};
