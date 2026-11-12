import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_PASSPORT_ID } from "../src/features/demo/loadDemo";
import { stubDemoFetch, stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("demo data", () => {
	it("loads photos, stamps and locations, and replaces them on a second load", async () => {
		stubDemoFetch();
		stubObjectUrls();
		const user = userEvent.setup();
		const { db } = renderApp("/");
		await db.passports.put({
			id: "mine",
			name: "My passport",
			validFrom: null,
			validTo: null,
			createdAt: "2026-01-01T00:00:00.000Z",
		});

		const button = await screen.findByRole("button", {
			name: "Load demo data",
		});
		await user.click(button);
		await screen.findByText(/Loaded 5 demo pages, 16 stamps and \d+ locations/);

		const counts = async () => ({
			passports: await db.passports.count(),
			photos: await db.photos.count(),
			extractions: await db.extractions.count(),
			stamps: await db.stamps.count(),
			locations: await db.locations.count(),
		});
		const first = await counts();
		expect(first).toMatchObject({
			passports: 2,
			photos: 5,
			extractions: 5,
			stamps: 16,
		});
		expect(first.locations).toBeGreaterThan(2000);
		const stamps = await db.stamps.toArray();
		expect(stamps.every((s) => s.passportId === DEMO_PASSPORT_ID)).toBe(true);
		expect(stamps.map((s) => s.dateText)).toContain("◁ 10 08 16 05");

		await user.click(button);
		await screen.findByText(/Loaded 5 demo pages/);
		expect(await counts()).toEqual(first);
		expect(await db.passports.get("mine")).toBeTruthy();
	});
});
