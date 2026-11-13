import type { TruthStamp } from "./groundTruth.ts";

/** The fields of a parsed model stamp that the trial scores. */
export interface ReadFields {
	countryCode: string | null;
	date: string | null;
	direction: string;
}

export interface PageScore {
	/** Required truth stamps on the page. */
	required: number;
	found: number;
	/** Model stamps matching no truth stamp, optional ones excluded. */
	extra: number;
	countryCorrect: number;
	/** Required truth stamps with a readable date / direction. */
	datesScored: number;
	dateCorrect: number;
	directionsScored: number;
	directionCorrect: number;
}

/** 2 for the same date, 1 for the same country; 0 means no match. */
const affinity = (truth: TruthStamp, read: ReadFields): number =>
	(truth.date !== null && truth.date === read.date ? 2 : 0) +
	(read.countryCode !== null && truth.countryCodes.includes(read.countryCode)
		? 1
		: 0);

/**
 * Pairs model stamps with truth stamps greedily by affinity, then counts.
 * A required stamp that was not found counts as wrong in every field.
 */
export function scorePage(truth: TruthStamp[], read: ReadFields[]): PageScore {
	const pairs = truth
		.flatMap((t, ti) => read.map((r, ri) => ({ ti, ri, a: affinity(t, r) })))
		.filter((pair) => pair.a > 0)
		.sort((x, y) => y.a - x.a || x.ti - y.ti || x.ri - y.ri);
	const truthMatch = new Map<number, number>();
	const readUsed = new Set<number>();
	for (const { ti, ri } of pairs) {
		if (truthMatch.has(ti) || readUsed.has(ri)) continue;
		truthMatch.set(ti, ri);
		readUsed.add(ri);
	}

	const score: PageScore = {
		required: 0,
		found: 0,
		extra: read.length - readUsed.size,
		countryCorrect: 0,
		datesScored: 0,
		dateCorrect: 0,
		directionsScored: 0,
		directionCorrect: 0,
	};
	truth.forEach((t, ti) => {
		if (t.optional) return;
		score.required++;
		if (t.date !== null) score.datesScored++;
		if (t.direction !== null) score.directionsScored++;
		const ri = truthMatch.get(ti);
		const r = ri === undefined ? undefined : read[ri];
		if (!r) return;
		score.found++;
		if (r.countryCode !== null && t.countryCodes.includes(r.countryCode))
			score.countryCorrect++;
		if (t.date !== null && r.date === t.date) score.dateCorrect++;
		if (t.direction !== null && r.direction === t.direction)
			score.directionCorrect++;
	});
	return score;
}

export const addScores = (a: PageScore, b: PageScore): PageScore => ({
	required: a.required + b.required,
	found: a.found + b.found,
	extra: a.extra + b.extra,
	countryCorrect: a.countryCorrect + b.countryCorrect,
	datesScored: a.datesScored + b.datesScored,
	dateCorrect: a.dateCorrect + b.dateCorrect,
	directionsScored: a.directionsScored + b.directionsScored,
	directionCorrect: a.directionCorrect + b.directionCorrect,
});

export const EMPTY_SCORE: PageScore = {
	required: 0,
	found: 0,
	extra: 0,
	countryCorrect: 0,
	datesScored: 0,
	dateCorrect: 0,
	directionsScored: 0,
	directionCorrect: 0,
};
