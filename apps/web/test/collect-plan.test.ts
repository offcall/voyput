import { describe, expect, it } from "vitest";
import {
	buildPlan,
	daysCovered,
	type PlanInput,
	type PlanStay,
} from "../src/features/import/plan/planProgress";

const stay = (
	countryCode: string,
	start: string,
	end: string,
	kind: PlanStay["kind"] = "stay",
): PlanStay => ({ countryCode, start, end, kind });

const EMPTY: PlanInput = {
	passports: 0,
	photos: 0,
	locations: 0,
	locationCountries: [],
	extracted: 0,
	failed: 0,
	stamps: 0,
	toReview: 0,
	problems: 0,
	stays: [],
	birthCountry: null,
};

describe("plan progress", () => {
	it("shows only the steps the chosen sources need, unless data is already there", () => {
		const ids = (input: PlanInput) => buildPlan(input).steps.map((s) => s.id);
		expect(ids({ ...EMPTY, sources: "photos" })).toEqual([
			"locations",
			"trips",
		]);
		expect(ids({ ...EMPTY, sources: "passport" })).toEqual([
			"passports",
			"extract",
			"review",
			"trips",
		]);
		expect(ids({ ...EMPTY, sources: "both" })).toHaveLength(5);
		expect(ids(EMPTY)).toHaveLength(5);
		expect(ids({ ...EMPTY, sources: "photos", stamps: 1 })).toHaveLength(5);
		expect(ids({ ...EMPTY, sources: "passport", locations: 3 })).toHaveLength(
			5,
		);
		// Hidden steps leave the next step and the open items alone.
		const photos = buildPlan({ ...EMPTY, sources: "photos" });
		expect(photos.next?.id).toBe("locations");
		expect(photos.toDo).toBe(2);
		expect(photos.hasData).toBe(false);
	});

	it("counts overlapping days once, start and end included", () => {
		expect(
			daysCovered([
				{ start: "2024-03-01", end: "2024-03-05" },
				{ start: "2024-03-04", end: "2024-03-10" },
				{ start: "2024-05-01", end: "2024-05-01" },
			]),
		).toBe(11);
		expect(daysCovered([])).toBe(0);
	});

	it("ticks steps from real data; days abroad leave the birth country out", () => {
		expect(buildPlan(EMPTY).doneCount).toBe(0);
		expect(buildPlan(EMPTY).next?.id).toBe("passports");
		expect(buildPlan(EMPTY).toDo).toBe(3);

		const plan = buildPlan({
			...EMPTY,
			passports: 1,
			photos: 2,
			locations: 10,
			locationCountries: ["RO", "MD", "BG", "TR"],
			extracted: 2,
			stamps: 3,
			toReview: 1,
			stays: [
				stay("MD", "2024-01-01", "2024-03-01"),
				stay("RO", "2024-03-01", "2024-03-03"),
				stay("QA", "2024-03-03", "2024-03-03", "transit"),
				stay("BG", "2024-03-03", "2024-03-05"),
			],
			birthCountry: "MD",
		});
		expect(plan.steps.map((step) => [step.id, step.state])).toEqual([
			["passports", "done"],
			["locations", "done"],
			["extract", "done"],
			["review", "todo"],
			["trips", "done"],
		]);
		expect(plan.next?.id).toBe("review");
		// Transits are passed through, not visited.
		expect(plan.countries).toBe(3);
		expect(plan.countriesFrom).toBe("stays");
		expect(plan.stays).toBe(4);
		expect(plan.daysAbroad).toBe(5);
		expect(plan.toDo).toBe(1);
		// Without a birth country every stay's days count.
		expect(buildPlan({ ...EMPTY, stays: plan.input.stays }).daysAbroad).toBe(
			65,
		);
	});

	it("counts countries from the locations until a stay is saved", () => {
		const plan = buildPlan({
			...EMPTY,
			locations: 30,
			locationCountries: ["RO", "MD", "BG"],
		});
		expect(plan.countries).toBe(3);
		expect(plan.countriesFrom).toBe("locations");
	});

	it("flags failed extractions and problem stamps as needing attention", () => {
		const plan = buildPlan({
			...EMPTY,
			photos: 3,
			extracted: 1,
			failed: 2,
			stamps: 2,
			toReview: 2,
			problems: 1,
		});
		const state = (id: string) =>
			plan.steps.find((step) => step.id === id)?.state;
		expect(state("extract")).toBe("attention");
		expect(state("review")).toBe("attention");
		expect(state("locations")).toBe("todo");
		expect(plan.toExtract).toBe(2);
	});
});
