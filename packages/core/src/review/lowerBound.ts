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
