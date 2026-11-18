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

import { dayNumber } from "@voyput/core";
import type { Sources } from "./sources";

/** What the plan is built from; all of it is read from the database. */
export interface PlanInput {
	/** The sources chosen on Collect, or null/missing before a choice. */
	sources?: Sources | null;
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
	/** Stamps in the Review queue: unreviewed, or with an open warning. */
	toReview: number;
	/** Unreviewed stamps with a problem the extraction flagged. */
	problems: number;
	/** The saved stays. */
	stays: readonly PlanStay[];
	/** Birth country set on the Trips step, or null. */
	birthCountry: string | null;
}

/** A saved stay as the plan counts it: first and last day, YYYY-MM-DD, null while unknown. */
export interface PlanStay {
	countryCode: string;
	kind: "stay" | "transit";
	start: string | null;
	end: string | null;
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
	/** The steps shown for the chosen sources, in wizard order. */
	steps: PlanStep[];
	/** The sources chosen on Collect, or null before a choice. */
	sources: Sources | null;
	/** Any passport, photo, location, stamp or stay stored. */
	hasData: boolean;
	doneCount: number;
	/** First step not done yet, or null when all are done. */
	next: PlanStep | null;
	/** The raw numbers, for step counts and the next call to action. */
	input: PlanInput;
	/** Photos without a successful extraction. */
	toExtract: number;
	/** Countries stayed in: from saved stays, or from the locations before any stay is saved. */
	countries: number;
	countriesFrom: "stays" | "locations";
	/** Days in saved stays outside the birth country (all of them while none is set). */
	daysAbroad: number;
	stays: number;
	/** Open items: photos to extract, stamps to review, plus one per empty step. */
	toDo: number;
}

/** Days covered by at least one span, start and end included; overlaps count once. */
export function daysCovered(
	spans: readonly { start: string; end: string }[],
): number {
	const days = spans
		.map((span): [number, number] => {
			const from = dayNumber(span.start) ?? Number.NaN;
			const to = dayNumber(span.end) ?? Number.NaN;
			return from <= to ? [from, to] : [to, from];
		})
		.filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to))
		.sort((a, b) => a[0] - b[0]);
	let total = 0;
	let reached = Number.NEGATIVE_INFINITY;
	for (const [from, to] of days) {
		const start = Math.max(from, reached + 1);
		if (to >= start) total += to - start + 1;
		reached = Math.max(reached, to);
	}
	return total;
}

/**
 * The steps the chosen sources need: photos only skips the passport steps, passport
 * only skips the photo locations. Stored data wins over the choice: stamps or
 * passport photos show the passport steps, locations show their step.
 */
export function visibleSteps(input: PlanInput): StepId[] {
	const sources = input.sources ?? null;
	const passport =
		sources !== "photos" ||
		input.passports > 0 ||
		input.photos > 0 ||
		input.stamps > 0;
	const locations = sources !== "passport" || input.locations > 0;
	return STEP_IDS.filter((id) =>
		id === "locations"
			? locations
			: id === "passports" || id === "extract" || id === "review"
				? passport
				: true,
	);
}

/** The Collect steps for the chosen sources, each done or not, and the counters. */
export function buildPlan(input: PlanInput): Plan {
	const stayCount = input.stays.length;
	const toExtract = Math.max(0, input.photos - input.extracted);
	const done: Record<StepId, boolean> = {
		passports: input.photos > 0,
		locations: input.locations > 0,
		extract: input.photos > 0 && toExtract === 0,
		review: input.stamps > 0 && input.toReview === 0,
		trips: stayCount > 0,
	};
	const attention: Record<StepId, boolean> = {
		passports: false,
		locations: false,
		extract: input.failed > 0,
		review: input.problems > 0,
		trips: false,
	};
	const shown = visibleSteps(input);
	const steps: PlanStep[] = shown.map((id) => ({
		id,
		done: done[id],
		state: done[id] ? "done" : attention[id] ? "attention" : "todo",
	}));
	// Transits are passed through, not visited.
	const fromStays = new Set(
		input.stays.filter((s) => s.kind === "stay").map((s) => s.countryCode),
	);
	const countries =
		stayCount > 0 ? fromStays : new Set(input.locationCountries);
	const emptySteps = (["passports", "locations", "trips"] as const).filter(
		(id) => shown.includes(id) && !done[id],
	).length;
	return {
		steps,
		sources: input.sources ?? null,
		hasData:
			input.passports +
				input.photos +
				input.locations +
				input.stamps +
				stayCount >
			0,
		doneCount: steps.filter((step) => step.done).length,
		next: steps.find((step) => !step.done) ?? null,
		input,
		toExtract,
		countries: countries.size,
		countriesFrom: stayCount > 0 ? "stays" : "locations",
		daysAbroad: daysCovered(
			input.stays.flatMap(({ countryCode, start, end }) =>
				countryCode !== input.birthCountry && start && end
					? [{ start, end }]
					: [],
			),
		),
		stays: stayCount,
		toDo: toExtract + input.toReview + emptySteps,
	};
}
