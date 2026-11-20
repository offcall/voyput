import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TravelStay } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { renderApp } from "./renderApp";

/** A synthetic stored stay with exact edges; `departure` null: still there. */
const stay = (
	id: string,
	countryCode: string,
	arrival: string,
	departure: string | null,
): TravelStay => ({
	id,
	countryCode,
	place: "",
	kind: "stay",
	arrival: { date: arrival, source: "manual", method: "plane" },
	departure: { date: departure, source: "manual", method: "plane" },
	stampIds: [],
	photoIds: [],
	approved: false,
});

async function seed(name: string) {
	const db = new VoyputDb(name);
	await db.stays.bulkPut([
		stay("a", "ES", "2016-08-10", "2016-08-24"),
		stay("b", "FR", "2016-10-01", null),
	]);
	return db;
}

const profileCard = async () =>
	within(
		(await screen.findByRole("heading", { name: "Profile" })).closest(
			".vp-card",
		) as HTMLElement,
	);

describe("assumed home", () => {
	it("is off by default and saves the country and the count toggle with undo", async () => {
		const user = userEvent.setup();
		const db = await seed("assumed-settings");
		renderApp("/settings", { db });
		const card = await profileCard();

		const picker = await card.findByRole<HTMLSelectElement>("combobox", {
			name: "Fill unknown days with",
		});
		expect(picker.value).toBe("");
		const count = card.getByRole<HTMLInputElement>("checkbox", {
			name: "Count assumed days",
		});
		expect(count.checked).toBe(true);
		expect(count.disabled).toBe(true);

		await user.selectOptions(picker, "PT");
		await waitFor(async () =>
			expect((await db.kv.get("trips:assumedHome"))?.value).toBe("PT"),
		);
		await user.click(count);
		await waitFor(async () =>
			expect((await db.kv.get("trips:countAssumed"))?.value).toBe(false),
		);
		await user.click(
			within(screen.getByRole("status")).getByRole("button", { name: "Undo" }),
		);
		await waitFor(async () =>
			expect(await db.kv.get("trips:countAssumed")).toBeUndefined(),
		);
		expect(count.checked).toBe(true);
		expect((await db.kv.get("trips:assumedHome"))?.value).toBe("PT");
		// The setting never writes stays.
		expect(await db.stays.count()).toBe(2);
	});

	it("shows a gap as assumed home in the Stays list, never as a stay", async () => {
		const db = await seed("assumed-list");
		await db.kv.put({ key: "trips:assumedHome", value: "PT" });
		renderApp("/collect/trips", { db });

		const label = await screen.findByText("assumed home");
		const block = label.closest(".vp-stay-block");
		if (!(block instanceof HTMLElement)) throw new Error("no assumed row");
		expect(block.textContent).toContain("Portugal · 37 days");
		expect(block.textContent).toContain("25 Aug → 30 Sep 2016");
		expect(screen.queryByText(/^gap ·/)).toBeNull();
		expect(
			within(block).getByRole("button", { name: /Add a stay in the gap/ }),
		).toBeTruthy();
		expect(await db.stays.count()).toBe(2);
	});

	it("shows the plain gap while no home country is set", async () => {
		const db = await seed("assumed-off");
		renderApp("/collect/trips", { db });
		expect(await screen.findByText("gap · 37 days")).toBeTruthy();
		expect(screen.queryByText("assumed home")).toBeNull();
	});

	it("follows a home country set while the Stays page is open", async () => {
		const db = await seed("assumed-live");
		renderApp("/collect/trips", { db });
		expect(await screen.findByText("gap · 37 days")).toBeTruthy();

		await db.kv.put({ key: "trips:assumedHome", value: "PT" });
		expect(await screen.findByText("assumed home")).toBeTruthy();
		expect(screen.queryByText("gap · 37 days")).toBeNull();
	});
});
