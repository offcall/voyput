const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 for a YYYY-MM-DD date (or the date part of an ISO date-time). */
export const dayNumber = (iso: string): number | null => {
	const time = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(time) ? null : Math.floor(time / MS_PER_DAY);
};

/** YYYY-MM-DD for a day number. */
export const dayIso = (day: number): string =>
	new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

/** First index whose value is >= target, in an ascending array. */
export const lowerBound = (
	values: ArrayLike<number>,
	target: number,
): number => {
	let lo = 0;
	let hi = values.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if ((values[mid] ?? 0) < target) lo = mid + 1;
		else hi = mid;
	}
	return lo;
};
