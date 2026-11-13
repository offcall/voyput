import type { SpriteName } from "@voyput/ui";
import type { ReactNode } from "react";
import { ExtractPage } from "../extract/ExtractPage";
import { LocationsStep } from "../import/LocationsStep";
import { PassportsStep } from "../import/PassportsStep";
import {
	isStepId,
	type Plan,
	STEP_IDS,
	type StepId,
} from "../import/plan/planProgress";
import { ReviewPage } from "../review/ReviewPage";
import { TripsPage } from "../trips/TripsPage";

export interface CollectStep {
	/** URL segment: `/collect/<id>`. */
	id: StepId;
	/** Short name for the stepper. */
	label: string;
	/** Heading above the step content. */
	title: string;
	description: string;
	sprite: SpriteName;
	render: () => ReactNode;
}

const DEFINITIONS: Record<StepId, Omit<CollectStep, "id">> = {
	passports: {
		label: "Passports",
		title: "Passports",
		description:
			"Stamps are read from photos of your passport pages. No passport at hand? Load the demo.",
		sprite: "passport",
		render: () => <PassportsStep />,
	},
	locations: {
		label: "Photo locations",
		title: "iPhone photo locations",
		description:
			"Your photo locations confirm each stamp and fill in the days between them.",
		sprite: "globe",
		render: () => <LocationsStep />,
	},
	extract: {
		label: "Extract",
		title: "Read the stamps",
		description:
			"An AI model reads every stamp on your photos: country, date and direction.",
		sprite: "stamp",
		render: () => <ExtractPage />,
	},
	review: {
		label: "Review",
		title: "Review the stamps",
		description:
			"Check each stamp against its photo and your photo location history.",
		sprite: "star",
		render: () => <ReviewPage />,
	},
	trips: {
		label: "Trips",
		title: "Trips",
		description:
			"Trips built from your stamps and photo locations. Save the ones that are right.",
		sprite: "suitcase",
		render: () => <TripsPage />,
	},
};

/** The Collect steps in wizard order; the router, the stepper and Back/Next read it. */
export const COLLECT_STEPS: readonly CollectStep[] = STEP_IDS.map((id) => ({
	id,
	...DEFINITIONS[id],
}));

export function findStep(id: string | undefined): CollectStep | undefined {
	return isStepId(id)
		? COLLECT_STEPS.find((step) => step.id === id)
		: undefined;
}

/** The step to open on `/collect`: the first one not done, or the last when all are. */
export function firstUnfinishedStep(plan: Plan): StepId {
	return plan.next?.id ?? STEP_IDS[STEP_IDS.length - 1] ?? "trips";
}

const compact = new Intl.NumberFormat("en", {
	notation: "compact",
	maximumFractionDigits: 1,
});
const number = new Intl.NumberFormat("en");

const plural = (count: number, one: string, many = `${one}s`) =>
	`${number.format(count)} ${count === 1 ? one : many}`;

/** The small count under a step in the stepper, or null when there is nothing yet. */
export function stepCount(id: StepId, plan: Plan): string | null {
	const input = plan.input;
	switch (id) {
		case "passports":
			return input.photos > 0 ? plural(input.photos, "photo") : null;
		case "locations":
			return input.locations > 0
				? `${compact.format(input.locations).toLowerCase()} locations`
				: null;
		case "extract":
			if (input.failed > 0) return `${number.format(input.failed)} failed`;
			if (plan.toExtract > 0) return `${number.format(plan.toExtract)} to read`;
			return input.photos > 0 ? "all read" : null;
		case "review":
			if (input.toReview > 0)
				return `${number.format(input.toReview)} to check`;
			return input.stamps > 0 ? plural(input.stamps, "stamp") : null;
		case "trips":
			return plan.trips > 0 ? `${number.format(plan.trips)} saved` : null;
	}
}

/** What the user should do next on a step, as a call to action. */
export function nextAction(id: StepId, plan: Plan): string {
	const input = plan.input;
	switch (id) {
		case "passports":
			return "Add your passport photos";
		case "locations":
			return "Import your photo locations";
		case "extract":
			return input.failed > 0
				? `Fix ${plural(input.failed, "failed photo")}`
				: `Read the stamps on ${plural(plan.toExtract, "photo")}`;
		case "review":
			return input.toReview > 0
				? `Review ${plural(input.toReview, "stamp")}`
				: "Review the stamps";
		case "trips":
			return "Save your trips";
	}
}
