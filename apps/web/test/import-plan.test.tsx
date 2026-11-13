import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Stamp, Trip } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import {
	buildPlan,
	daysAbroad,
} from "../src/features/import/plan/planProgress";
import { renderApp } from "./renderApp";

URL.createObjectURL = () => "blob:test";
URL.revokeObjectURL = () => {};

const stamp = (id: string, reviewed: boolean): Stamp => ({
	id,
	passportId: "p1",
	photoId: "ph1",
	direction: "entry",
	borderCrossing: "plane",
	dateText: "2024-03-01",
	date: "2024-03-01",
	country: "Romania",
	countryCode: "RO",
	location: "Otopeni",
	confidence: 95,
	notes: "",
	problem: null,
	source: "ai",
	reviewed,
});

const trip = (
	id: string,
	start: string,
	end: string,
	countries: string[],
): Trip => ({
	id,
	title: id,
	start,
	end,
	confirmed: true,
	arrival: { date: start, method: "plane", source: "stamp" },
	departure: { date: end, method: "plane", source: "stamp" },
	stops: countries.map((countryCode, index) => ({
		id: `${id}-${index}`,
		day: start,
		countryCode,
		country: countryCode,
		cities: [],
		kind: "stay",
	})),
	stampIds: [],
});

const EMPTY = {
	photos: 0,
	extracted: 0,
	stamps: 0,
	toReview: 0,
	trips: [],
	home: null,
	visualized: false,
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
		expect(buildPlan(EMPTY).next?.key).toBe("import");

		const plan = buildPlan({
			...EMPTY,
			photos: 2,
			extracted: 2,
			stamps: 3,
			toReview: 1,
			trips: [trip("a", "2024-03-01", "2024-03-05", ["RO", "MD", "BG"])],
			home: "MD",
		});
		expect(plan.steps.map((step) => step.done)).toEqual([
			true,
			true,
			false,
			true,
			false,
		]);
		expect(plan.next?.key).toBe("review");
		expect(plan.countries).toBe(2);
		expect(plan.daysAbroad).toBe(5);
	});

	it("needs saved trips before Visualize counts as done", () => {
		expect(buildPlan({ ...EMPTY, visualized: true }).steps[4]?.done).toBe(
			false,
		);
	});
});

describe("Your plan on Import", () => {
	it("shows what waits for review and links to Review", async () => {
		const db = new VoyputDb("plan-review");
		await db.stamps.bulkPut([stamp("s1", false), stamp("s2", false)]);
		renderApp("/import", { db });

		const plan = await screen.findByRole(
			"region",
			{ name: "Your plan" },
			{ timeout: 10000 },
		);
		expect(within(plan).getByText("0/5 done")).toBeTruthy();
		expect(within(plan).getByText(/Ready for review/).textContent).toMatch(
			/Ready for review\s*2/,
		);
		expect(
			within(plan)
				.getByRole("link", { name: "Review stamps" })
				.getAttribute("href"),
		).toBe("/review");
		expect(
			within(plan)
				.getByRole("progressbar", { name: "Plan progress" })
				.getAttribute("aria-valuenow"),
		).toBe("0");
	});

	it("reaches 5/5 with a trophy once Visualize is opened with saved trips", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("plan-complete");
		await db.passports.put({
			id: "p1",
			name: "Blue",
			validFrom: null,
			validTo: null,
			createdAt: "2024-01-01T00:00:00Z",
		});
		await db.photos.put({
			id: "ph1",
			passportId: "p1",
			name: "page-1.png",
			mimeType: "image/png",
			rotation: 0,
			addedAt: "2024-01-01T00:00:00Z",
			blob: new Blob(["x"], { type: "image/png" }),
		});
		await db.extractions.put({
			photoId: "ph1",
			status: "ok",
			notes: "",
			model: "test",
			seconds: 1,
			finishedAt: "2024-01-01T00:00:00Z",
		});
		await db.stamps.put(stamp("s1", true));
		await db.trips.bulkPut([
			trip("t1", "2024-03-01", "2024-03-05", ["RO"]),
			trip("t2", "2024-06-01", "2024-06-02", ["BG", "RO"]),
		]);
		renderApp("/import", { db });

		const plan = await screen.findByRole(
			"region",
			{ name: "Your plan" },
			{ timeout: 10000 },
		);
		await waitFor(() =>
			expect(within(plan).getByText("4/5 done")).toBeTruthy(),
		);
		expect(within(plan).getByText("Next: Visualize")).toBeTruthy();
		expect(
			within(plan).getByRole("link", { name: "Step 5: Visualize, next" }),
		).toBeTruthy();
		const stat = (label: string) =>
			[...plan.querySelectorAll("dt")].find((dt) => dt.textContent === label)
				?.nextElementSibling?.textContent;
		expect(stat("Countries")).toBe("2");
		expect(stat("Days abroad")).toBe("7");
		expect(stat("Trips")).toBe("2");

		await user.click(screen.getByRole("link", { name: "Visualize" }));
		await screen.findByRole("heading", { level: 1, name: "Visualize" });
		await waitFor(async () =>
			expect((await db.kv.get("plan:visualized"))?.value).toBe(true),
		);
		await user.click(screen.getByRole("link", { name: "Collect" }));
		const done = await screen.findByRole(
			"region",
			{ name: "Your plan" },
			{ timeout: 10000 },
		);
		await waitFor(() =>
			expect(within(done).getByText("5/5 done")).toBeTruthy(),
		);
		expect(within(done).getByRole("status").textContent).toBe("All steps done");
	});
});
