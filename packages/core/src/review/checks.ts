import { dayIso, dayNumber, lowerBound } from "./days";
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
}

const NEAR_DAYS = 2;
/** Default for `checkStamp`'s `window`: how far a photo in another country still warns. */
const STAMP_CHECK_WINDOW = 10;
const SUGGEST_WINDOW = 30;
const NEARBY_COUNT = 5;

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

/** The photo in `code` closest to `target` within `window` days, if any. */
const nearestInCountry = (
	index: PhotoIndex,
	target: number,
	code: string,
	window = SUGGEST_WINDOW,
): { gap: number; date: string; filename: string } | null => {
	const end = lowerBound(index.days, target + window + 1);
	let best: { gap: number; date: string; filename: string } | null = null;
	for (let i = lowerBound(index.days, target - window); i < end; i++) {
		if (index.countryCodes[i] !== code) continue;
		const day = index.days[i] ?? 0;
		const gap = Math.abs(day - target);
		if (!best || gap < best.gap)
			best = { gap, date: dayIso(day), filename: index.filenames[i] ?? "" };
	}
	return best;
};

/**
 * Compares a stamp with the nearest photo in time. A photo in another country
 * within `window` days (10 by default) is a warning; the suggestion points to the nearest photo in
 * the stamp's own country within 30 days, which hints at a misread date.
 */
export const checkStamp = (
	index: PhotoIndex,
	stamp: { date: string | null; countryCode: string | null },
	window = STAMP_CHECK_WINDOW,
): StampCheck => {
	const code = (stamp.countryCode ?? "").toUpperCase();
	const target = stamp.date ? dayNumber(stamp.date) : null;
	if (!code || target === null) return NO_CHECK;
	const [nearest] = nearbyPhotos(index, stamp.date, 1);
	if (!nearest || nearest.countryCode === code || nearest.gap > window)
		return NO_CHECK;
	const photo = `photo${nearest.filename ? ` "${nearest.filename}"` : ""}`;
	const stampCountry = countryLabel(index, code);
	const confirm = nearestInCountry(index, target, code);

	if (nearest.gap <= NEAR_DAYS)
		return {
			icloudCheck: `${nearest.gap} day(s) from the stamp date, a ${photo} was taken in ${nearest.country}, not ${stampCountry}`,
			suggestion: confirm
				? `Possible correct date is around ${confirm.date} (photo "${confirm.filename}" in ${stampCountry}, ${confirm.gap} day(s) from the stamp date)`
				: `No photos in ${stampCountry} within ${SUGGEST_WINDOW} days: the country may be misread (nearby photos show ${nearest.country})`,
		};
	return {
		icloudCheck: `Possible inaccuracy: the nearest ${photo} (${nearest.gap} day(s) away) is in ${nearest.country}`,
		suggestion: confirm
			? `There is also a photo in ${stampCountry} on ${confirm.date} ("${confirm.filename}", ${confirm.gap} day(s) away); check which date is right`
			: `No photos in ${stampCountry} within ${SUGGEST_WINDOW} days: check by hand`,
	};
};
