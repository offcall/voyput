import { screen, within } from "@testing-library/react";
import type { Stamp } from "@voyput/core";
import { beforeEach, describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { pageProgress } from "../src/features/review/queue";
import { stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

const stamp = (id: string, overrides: Partial<Stamp> = {}): Stamp => ({
	id,
	passportId: "p1",
	photoId: "page-1.png",
	direction: "entry",
	borderCrossing: "plane",
	dateText: "2024-07-03",
	date: "2024-07-03",
	country: "Turkey",
	countryCode: "TR",
	location: null,
	confidence: 90,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: true,
	...overrides,
});
const NO_CHECK = { icloudCheck: "", suggestion: "" };

describe("pageProgress", () => {
	it("counts reviewed stamps and open problems; a hidden problem does not count", () => {
		expect(
			pageProgress(
				[
					stamp("a"),
					stamp("b", { reviewed: false }),
					stamp("c", { reviewed: false, problem: "unreadable date null" }),
					stamp("d", { problem: "misread", dismissed: { problem: true } }),
				].map((s) => ({ stamp: s, check: NO_CHECK })),
			),
		).toEqual({ reviewed: 2, total: 4, problems: 1 });
		expect(pageProgress([])).toEqual({ reviewed: 0, total: 0, problems: 0 });
	});
});

let dbCount = 0;

describe("page strip progress", () => {
	beforeEach(() => stubObjectUrls());

	it("shows reviewed of all and the problems on each page", async () => {
		const db = new VoyputDb(`review-progress-${++dbCount}`);
		await db.passports.put({
			id: "p1",
			name: "Blue",
			validFrom: null,
			validTo: null,
			createdAt: "2024-01-01T00:00:00Z",
		});
		for (const name of ["page-1.png", "page-2.png"])
			await db.photos.put({
				id: name,
				passportId: "p1",
				name,
				mimeType: "image/png",
				rotation: 0,
				addedAt: "2024-01-01T00:00:00Z",
				blob: new Blob(["x"], { type: "image/png" }),
			});
		await db.stamps.bulkPut([
			stamp("a"),
			stamp("b", {
				reviewed: false,
				direction: "exit",
				date: null,
				dateText: "",
				problem: "unreadable date null",
			}),
			stamp("c", {
				photoId: "page-2.png",
				date: "2024-08-01",
				dateText: "2024-08-01",
			}),
			stamp("d", {
				photoId: "page-2.png",
				direction: "exit",
				date: "2024-08-05",
				dateText: "2024-08-05",
			}),
		]);
		renderApp("/collect/review?photo=page-1.png", { db });
		const strip = within(
			await screen.findByRole("navigation", { name: "Review photos" }),
		);
		const page1 = within(
			await strip.findByRole("button", { name: /page-1\.png/ }),
		);
		expect(page1.getByText("1/2 ✓")).toBeTruthy();
		expect(page1.getByText("1 ?").title).toBe("1 with a problem");
	});
});
