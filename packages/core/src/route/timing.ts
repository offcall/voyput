/** Slow-fast-slow curve: every leg gets a takeoff and a landing instead of constant speed. Clamps `t` to [0, 1]. */
export function easeInOutCubic(t: number): number {
	const c = Math.max(0, Math.min(1, t));
	return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

/**
 * The whole route plays in about this long at 1×, whether it has 4 stays or
 * 4,000 photo clusters: a fixed budget split across legs, not a sum of legs.
 */
export const DEFAULT_TRIP_MS = 120_000;

/** Shortest a leg may be while the budget allows it. */
export const MIN_LEG_MS = 12;

/**
 * Splits `totalMs` across legs, weighted by sqrt(distance): a long flight gets
 * more time than a hop in the same city, but not linearly more. The sum is
 * always `totalMs`.
 *
 * Water-filling keeps that sum: every leg whose share would fall below the floor
 * is pinned to the floor, its time is taken from the budget, and the rest is
 * split again among the other legs, until no leg needs pinning. When even the
 * floor does not fit (`n * MIN_LEG_MS > totalMs`), the floor shrinks to
 * `totalMs / n`, so every leg gets an equal share and the total still holds.
 *
 * Durations are at 1×; playback speed scales elapsed time (`advanceElapsed`).
 */
export function computeLegDurations(
	distancesKm: readonly number[],
	totalMs: number = DEFAULT_TRIP_MS,
): number[] {
	const n = distancesKm.length;
	if (n === 0) return [];
	const floor = Math.min(MIN_LEG_MS, totalMs / n);
	const weights = distancesKm.map((d) => Math.sqrt(Math.max(0, d)) + 0.25);
	const durations = new Array<number>(n).fill(0);
	let active = weights.map((_, i) => i);
	let remaining = totalMs;

	while (active.length > 0) {
		let sumActive = 0;
		for (const i of active) sumActive += weights[i] ?? 0;
		const kept: number[] = [];
		const floored: number[] = [];
		for (const i of active) {
			if (((weights[i] ?? 0) / sumActive) * remaining < floor) floored.push(i);
			else kept.push(i);
		}
		if (floored.length === 0) {
			for (const i of active)
				durations[i] = ((weights[i] ?? 0) / sumActive) * remaining;
			break;
		}
		for (const i of floored) durations[i] = floor;
		remaining = Math.max(0, remaining - floor * floored.length);
		active = kept;
	}
	return durations;
}

const BORDER_BASE_MS = 150;
const BORDER_GROWTH_MS_PER_SQRT_KM = 9;

/** A border leg never takes longer than this, however far the flight was. */
export const MAX_BORDER_LEG_MS = 1000;

/** A border leg's own duration: grows with distance, capped at `MAX_BORDER_LEG_MS`, independent of other legs. */
export function borderLegNominalMs(distanceKm: number): number {
	return Math.min(
		MAX_BORDER_LEG_MS,
		BORDER_BASE_MS +
			Math.sqrt(Math.max(0, distanceKm)) * BORDER_GROWTH_MS_PER_SQRT_KM,
	);
}

/**
 * Durations for the "exact by photos" route, which mixes a few border crossings
 * with possibly thousands of local hops. Border legs get `borderLegNominalMs`;
 * the budget left over is water-filled across the local legs
 * (`computeLegDurations`). If border legs alone exceed the budget, local legs
 * get nothing left to share and the total is the border sum.
 */
export function computePhotoLegDurations(
	distancesKm: readonly number[],
	isBorder: readonly boolean[],
	totalMs: number = DEFAULT_TRIP_MS,
): number[] {
	const n = distancesKm.length;
	const durations = new Array<number>(n).fill(0);
	const localIndex: number[] = [];
	const localDistance: number[] = [];
	let borderTotal = 0;
	for (let i = 0; i < n; i++) {
		const distance = distancesKm[i] ?? 0;
		if (isBorder[i]) {
			const d = borderLegNominalMs(distance);
			durations[i] = d;
			borderTotal += d;
		} else {
			localIndex.push(i);
			localDistance.push(distance);
		}
	}
	const local = computeLegDurations(
		localDistance,
		Math.max(0, totalMs - borderTotal),
	);
	localIndex.forEach((index, j) => {
		durations[index] = local[j] ?? 0;
	});
	return durations;
}
