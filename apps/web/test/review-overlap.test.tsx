import { screen, waitFor, within } from "@testing-library/react";
import type { Direction, Stamp } from "@voyput/core";
import { beforeEach, describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { overlapNotes } from "../src/features/review/overlaps";
import { stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

const stamp = (
	id: string,
	photoId: string,
	direction: Direction,
	date: string,
	[countryCode, country]: [string, string],
): Stamp => ({
	id,
	passportId: "p1",
	photoId,
	direction,
	borderCrossing: "plane",
	dateText: date,
	date,
	country,
	countryCode,
	location: null,
	confidence: 90,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: true,
});

const TR: [string, string] = ["TR", "Turkey"];
const GE: [string, string] = ["GE", "Georgia"];
const AM: [string, string] = ["AM", "Armenia"];

// Turkey 3–8 Jul overlaps Georgia 5–10 Jul; Armenia 10–12 Jul starts the day Georgia ends.
const stamps = [
	stamp("tr-in", "page-1.png", "entry", "2024-07-03", TR),
	stamp("tr-out", "page-1.png", "exit", "2024-07-08", TR),
	stamp("ge-in", "page-2.png", "entry", "2024-07-05", GE),
	stamp("ge-out", "page-2.png", "exit", "2024-07-10", GE),
	stamp("am-in", "page-3.png", "entry", "2024-07-10", AM),
	stamp("am-out", "page-3.png", "exit", "2024-07-12", AM),
];

describe("overlapNotes", () => {
	it("notes the other stay on both stamps of each overlapping stay", () => {
		const notes = overlapNotes(stamps);
		expect(notes.get("tr-in")).toBe(
			"you are also in Georgia 5 Jul – 10 Jul 2024",
		);
		expect(notes.get("tr-out")).toBe(notes.get("tr-in"));
		expect(notes.get("ge-in")).toBe(
			"you are also in Turkey 3 Jul – 8 Jul 2024",
		);
		expect(notes.get("ge-out")).toBe(notes.get("ge-in"));
		// Leaving one country and entering another the same day is fine.
		expect(notes.has("am-in")).toBe(false);
		expect(notes.has("am-out")).toBe(false);
	});

	it("has nothing to say without overlaps", () => {
		expect(overlapNotes(stamps.slice(0, 2)).size).toBe(0);
	});
});

let dbCount = 0;

describe("overlaps in Review", () => {
	beforeEach(() => stubObjectUrls());

	it("shows a red note on the overlapping stamps and counts them as problems", async () => {
		const db = new VoyputDb(`review-overlap-${++dbCount}`);
		await db.passports.put({
			id: "p1",
			name: "Blue",
			validFrom: null,
			validTo: null,
			createdAt: "2024-01-01T00:00:00Z",
		});
		for (const name of ["page-1.png", "page-2.png", "page-3.png"])
			await db.photos.put({
				id: name,
				passportId: "p1",
				name,
				mimeType: "image/png",
				rotation: 0,
				addedAt: "2024-01-01T00:00:00Z",
				blob: new Blob(["x"], { type: "image/png" }),
			});
		await db.stamps.bulkPut(stamps);
		renderApp("/collect/review?photo=page-1.png", { db });

		const card = within(
			await screen.findByRole("article", { name: "Stamp 1" }),
		);
		expect(card.getByText("Overlap")).toBeTruthy();
		expect(
			card.getByText("you are also in Georgia 5 Jul – 10 Jul 2024"),
		).toBeTruthy();
		const select = await screen.findByRole("combobox", { name: "Pages" });
		await waitFor(() =>
			expect(
				within(select).getByRole("option", { name: "Problems (2)" }),
			).toBeTruthy(),
		);
	});
});
