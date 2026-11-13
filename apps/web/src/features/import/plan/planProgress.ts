import type { Trip } from "@voyput/core";

/** What the plan is built from; all of it is read from the database. */
export interface PlanInput {
	photos: number;
	/** Photos with a successful extraction. */
	extracted: number;
	stamps: number;
	/** Stamps not marked reviewed. */
	toReview: number;
	/** Saved trips. */
	trips: readonly Pick<Trip, "start" | "end" | "stops">[];
	/** Home country chosen on Trips, or null. */
	home: string | null;
	/** Visualize was opened while saved trips existed. */
	visualized: boolean;
}

export type StepKey = "import" | "extract" | "review" | "trips" | "visualize";

export interface PlanStep {
	key: StepKey;
	label: string;
	to: `/${StepKey}`;
	done: boolean;
}

export interface Plan {
	steps: PlanStep[];
	doneCount: number;
	/** First step not done yet, or null when all are done. */
	next: PlanStep | null;
	toReview: number;
	countries: number;
	daysAbroad: number;
	trips: number;
}

const DAY_MS = 86_400_000;

const dayNumber = (iso: string) =>
	Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** Days covered by at least one trip, start and end included; overlaps count once. */
export function daysAbroad(
	trips: readonly Pick<Trip, "start" | "end">[],
): number {
	const spans = trips
		.map((trip): [number, number] => {
			const from = dayNumber(trip.start);
			const to = dayNumber(trip.end);
			return from <= to ? [from, to] : [to, from];
		})
		.filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to))
		.sort((a, b) => a[0] - b[0]);
	let total = 0;
	let reached = Number.NEGATIVE_INFINITY;
	for (const [from, to] of spans) {
		const start = Math.max(from, reached + 1);
		if (to >= start) total += to - start + 1;
		reached = Math.max(reached, to);
	}
	return total;
}

/** The five workflow steps, each done or not, and the counters for the plan card. */
export function buildPlan(input: PlanInput): Plan {
	const tripCount = input.trips.length;
	const done: Record<StepKey, boolean> = {
		import: input.photos > 0,
		extract: input.photos > 0 && input.extracted >= input.photos,
		review: input.stamps > 0 && input.toReview === 0,
		trips: tripCount > 0,
		visualize: tripCount > 0 && input.visualized,
	};
	const steps: PlanStep[] = (
		[
			["import", "Import"],
			["extract", "Extract"],
			["review", "Review"],
			["trips", "Trips"],
			["visualize", "Visualize"],
		] as const
	).map(([key, label]) => ({ key, label, to: `/${key}`, done: done[key] }));
	const countries = new Set(
		input.trips.flatMap((trip) => trip.stops.map((stop) => stop.countryCode)),
	);
	if (input.home) countries.delete(input.home);
	return {
		steps,
		doneCount: steps.filter((step) => step.done).length,
		next: steps.find((step) => !step.done) ?? null,
		toReview: input.toReview,
		countries: countries.size,
		daysAbroad: daysAbroad(input.trips),
		trips: tripCount,
	};
}
