import type { Trip } from "@voyput/core";
import { describe, expect, it } from "vitest";
import {
	buildPlan,
	daysAbroad,
	type PlanInput,
} from "../src/features/import/plan/planProgress";

const trip = (
	id: string,
	start: string,
	end: string,
	visited: string[],
): Trip => ({
	id,
	title: id,
	start,
	end,
	stayIds: [],
	countries: visited,
	visited,
	approved: true,
});

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
	trips: [],
	home: null,
};

describe("plan progress", () => {
	it("counts overlapping trip days once, start and end included", () => {
		expect(
			daysAbroad([
				trip("a", "2024-03-01", "2024-03-05", []),
				trip("b", "2024-03-04", "2024-03-10", []),
				trip("c", "2024-05-01", "2024-05-01", []),
			]),
		).toBe(11);
		expect(daysAbroad([])).toBe(0);
	});

	it("ticks steps from real data and leaves home out of the countries", () => {
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
			trips: [trip("a", "2024-03-01", "2024-03-05", ["RO", "MD", "BG"])],
			home: "MD",
		});
		expect(plan.steps.map((step) => [step.id, step.state])).toEqual([
			["passports", "done"],
			["locations", "done"],
			["extract", "done"],
			["review", "todo"],
			["trips", "done"],
		]);
		expect(plan.next?.id).toBe("review");
		expect(plan.countries).toBe(2);
		expect(plan.countriesFrom).toBe("trips");
		expect(plan.daysAbroad).toBe(5);
		expect(plan.toDo).toBe(1);
	});

	it("counts countries from the locations until a trip is saved", () => {
		const plan = buildPlan({
			...EMPTY,
			locations: 30,
			locationCountries: ["RO", "MD", "BG"],
			home: "MD",
		});
		expect(plan.countries).toBe(2);
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
