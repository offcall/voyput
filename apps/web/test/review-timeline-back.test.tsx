import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateReviewSearch } from "../src/app/router";
import { VoyputDb } from "../src/db/db";
import { seedDemo, stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

let dbCount = 0;

async function demoDb(): Promise<VoyputDb> {
	const db = new VoyputDb(`timeline-back-${++dbCount}`);
	await seedDemo(db);
	return db;
}

const bandRange = async () =>
	(
		await screen.findByRole("region", { name: "Countries by day" })
	).querySelector(".review-band-range")?.textContent;

describe("review search", () => {
	it("keeps a real band start day", () => {
		expect(
			validateReviewSearch({ tab: "timeline", from: "2024-02-29" }),
		).toEqual({ tab: "timeline", from: "2024-02-29" });
	});

	it("drops a band start that is not a real day", () => {
		for (const from of ["2023-02-29", "2024-13-01", "2024-1-01", "x", 20240101])
			expect(validateReviewSearch({ from })).toEqual({});
	});
});

describe("back to the timeline", () => {
	beforeEach(() => stubObjectUrls());
	afterEach(() => vi.restoreAllMocks());

	it("returns to the same band and scroll after opening a stamp", async () => {
		const db = await demoDb();
		const user = userEvent.setup();
		const { router } = renderApp("/review?tab=timeline", { db });

		const initial = await bandRange();
		await user.click(screen.getByRole("button", { name: "Later →" }));
		const moved = await bandRange();
		expect(moved).not.toBe(initial);
		expect(router.state.location.search.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);

		vi.spyOn(window, "scrollY", "get").mockReturnValue(640);
		const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
		const chronology = screen.getByRole("list", { name: "Stamps by date" });
		await user.click(
			within(chronology).getByRole("button", {
				name: "Open stamp: 2017-06-15 entry Georgia",
			}),
		);
		await screen.findByRole("heading", { name: /page-2\.png/ });

		await user.click(
			screen.getByRole("button", { name: "← Back to timeline" }),
		);
		expect(await bandRange()).toBe(moved);
		await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 640));
		expect(
			screen.queryByRole("button", { name: "← Back to timeline" }),
		).toBeNull();
	});

	it("returns to the same band with browser Back", async () => {
		const db = await demoDb();
		const user = userEvent.setup();
		const { router } = renderApp("/review?tab=timeline", { db });

		await user.click(await screen.findByRole("button", { name: "Later →" }));
		const moved = await bandRange();
		const chronology = screen.getByRole("list", { name: "Stamps by date" });
		await user.click(
			within(chronology).getByRole("button", {
				name: "Open stamp: 2017-06-15 entry Georgia",
			}),
		);
		await screen.findByRole("button", { name: "← Back to timeline" });

		router.history.back();
		expect(await bandRange()).toBe(moved);
	});

	it("falls back to the first stamp for a bad band start", async () => {
		const db = await demoDb();
		const plain = renderApp("/review?tab=timeline", { db });
		const initial = await bandRange();
		plain.unmount();
		renderApp("/review?tab=timeline&from=2016-02-31", { db });
		expect(await bandRange()).toBe(initial);
	});
});
