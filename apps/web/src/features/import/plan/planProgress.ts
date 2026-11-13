import type { Trip } from "@voyput/core";

/** The Collect steps in wizard order; `/collect/<id>` opens one. */
export const STEP_IDS = [
	"passports",
	"locations",
	"extract",
	"review",
	"trips",
] as const;

export type StepId = (typeof STEP_IDS)[number];

export function isStepId(value: unknown): value is StepId {
	return (STEP_IDS as readonly unknown[]).includes(value);
}

/** What the plan is built from; all of it is read from the database. */
export interface PlanInput {
	passports: number;
	photos: number;
	/** Location rows stored (CSV and demo). */
	locations: number;
	/** Country codes found in the stored locations. */
	locationCountries: readonly string[];
	/** Photos with a successful extraction. */
	extracted: number;
	/** Photos whose last extraction failed. */
	failed: number;
	stamps: number;
	/** Stamps not marked reviewed. */
	toReview: number;
	/** Unreviewed stamps with a problem the extraction flagged. */
	problems: number;
	/** Trips of the saved stays. */
	trips: readonly Pick<Trip, "start" | "end" | "visited">[];
	/** Home country chosen on Trips, or null. */
	home: string | null;
}

/**
 * `done`: nothing left to do here. `attention`: something went wrong and needs the user
 * (failed extractions, flagged stamps). `todo`: not done yet.
 */
export type StepState = "done" | "attention" | "todo";

export interface PlanStep {
	id: StepId;
	state: StepState;
	done: boolean;
}

export interface Plan {
	steps: PlanStep[];
	doneCount: number;
	/** First step not done yet, or null when all are done. */
	next: PlanStep | null;
	/** The raw numbers, for step counts and the next call to action. */
	input: PlanInput;
	/** Photos without a successful extraction. */
	toExtract: number;
	/** Countries outside home: from saved trips, or from the locations before any trip is saved. */
	countries: number;
	countriesFrom: "trips" | "locations";
	daysAbroad: number;
	trips: number;
	/** Open items: photos to extract, stamps to review, plus one per empty step. */
	toDo: number;
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

/** The five Collect steps, each done or not, and the counters for the success header. */
export function buildPlan(input: PlanInput): Plan {
	const tripCount = input.trips.length;
	const toExtract = Math.max(0, input.photos - input.extracted);
	const done: Record<StepId, boolean> = {
		passports: input.photos > 0,
		locations: input.locations > 0,
		extract: input.photos > 0 && toExtract === 0,
		review: input.stamps > 0 && input.toReview === 0,
		trips: tripCount > 0,
	};
	const attention: Record<StepId, boolean> = {
		passports: false,
		locations: false,
		extract: input.failed > 0,
		review: input.problems > 0,
		trips: false,
	};
	const steps: PlanStep[] = STEP_IDS.map((id) => ({
		id,
		done: done[id],
		state: done[id] ? "done" : attention[id] ? "attention" : "todo",
	}));
	// Transits are passed through, not visited.
	const fromTrips = new Set(input.trips.flatMap((trip) => trip.visited));
	const countries =
		tripCount > 0 ? fromTrips : new Set(input.locationCountries);
	if (input.home) countries.delete(input.home);
	const emptySteps = (["passports", "locations", "trips"] as const).filter(
		(id) => !done[id],
	).length;
	return {
		steps,
		doneCount: steps.filter((step) => step.done).length,
		next: steps.find((step) => !step.done) ?? null,
		input,
		toExtract,
		countries: countries.size,
		countriesFrom: tripCount > 0 ? "trips" : "locations",
		daysAbroad: daysAbroad(input.trips),
		trips: tripCount,
		toDo: toExtract + input.toReview + emptySteps,
	};
}
