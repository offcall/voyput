import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Stamp } from "@voyput/core";
import { beforeEach, describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

const stamp = (
	id: string,
	passportId: string,
	photoId: string,
	date: string,
): Stamp => ({
	id,
	passportId,
	photoId,
	direction: "entry",
	borderCrossing: "plane",
	dateText: date,
	date,
	country: "Romania",
	countryCode: "RO",
	location: null,
	confidence: 90,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: false,
});

let dbCount = 0;

/** Pages a-1, a-2 in passport "Old", b-1 in passport "New" (only with `two`); one unreviewed stamp each. */
async function seed(two: boolean): Promise<VoyputDb> {
	const db = new VoyputDb(`review-passport-${++dbCount}`);
	const passports = two ? ["old", "new"] : ["old"];
	for (const [i, id] of passports.entries())
		await db.passports.put({
			id,
			name: id === "old" ? "Old" : "New",
			validFrom: null,
			validTo: null,
			createdAt: `2024-01-0${i + 1}T00:00:00Z`,
		});
	const pages: [string, string][] = [
		["a-1.png", "old"],
		["a-2.png", "old"],
		...(two ? ([["b-1.png", "new"]] as [string, string][]) : []),
	];
	for (const [name, passportId] of pages) {
		await db.photos.put({
			id: name,
			passportId,
			name,
			mimeType: "image/png",
			rotation: 0,
			addedAt: "2024-01-01T00:00:00Z",
			blob: new Blob(["x"], { type: "image/png" }),
		});
		const date = passportId === "new" ? "2021-05-05" : "2020-01-01";
		await db.stamps.put(stamp(`s-${name}`, passportId, name, date));
	}
	return db;
}

describe("review passport filter", () => {
	beforeEach(() => stubObjectUrls());

	it("is hidden with one passport", async () => {
		renderApp("/collect/review", { db: await seed(false) });
		await screen.findByRole("combobox", { name: "Pages" });
		expect(screen.queryByRole("combobox", { name: "Passport" })).toBeNull();
	});

	it("narrows the strip, the counts and Next to one passport", async () => {
		const user = userEvent.setup();
		renderApp("/collect/review", { db: await seed(true) });
		const queue = within(
			await screen.findByRole("region", { name: "Review queue" }),
		);
		const passport = await queue.findByRole("combobox", { name: "Passport" });
		const pages = queue.getByRole("combobox", { name: "Pages" });
		const strip = () =>
			within(screen.getByRole("navigation", { name: "Review photos" }));
		await queue.findByText("3 to check");
		expect(
			within(pages).getByRole("option", { name: "All pages (3)" }),
		).toBeTruthy();

		await user.selectOptions(passport, "Passport: Old");
		await queue.findByText("2 to check");
		expect(
			within(pages).getByRole("option", { name: "All pages (2)" }),
		).toBeTruthy();
		await waitFor(() => expect(strip().getAllByRole("button")).toHaveLength(2));
		expect(strip().queryByText("b-1.png")).toBeNull();

		// Next walks the old passport's pages only, round and round.
		for (const name of ["a-1.png", "a-2.png", "a-1.png", "a-2.png"]) {
			await user.click(queue.getByRole("button", { name: "Next →" }));
			expect(
				await screen.findByRole("heading", { name: new RegExp(name) }),
			).toBeTruthy();
		}

		await user.selectOptions(passport, "Passport: New");
		await queue.findByText("1 to check");
		await waitFor(() => expect(strip().getAllByRole("button")).toHaveLength(1));
		await user.click(queue.getByRole("button", { name: "Next →" }));
		expect(
			await screen.findByRole("heading", { name: /b-1\.png/ }),
		).toBeTruthy();
	});

	it("shows a stamp of another passport opened from the timeline", async () => {
		const user = userEvent.setup();
		renderApp("/collect/review", { db: await seed(true) });
		const queue = within(
			await screen.findByRole("region", { name: "Review queue" }),
		);
		const passport = await queue.findByRole("combobox", { name: "Passport" });
		await user.selectOptions(passport, "Passport: Old");
		await queue.findByText("2 to check");

		await user.click(screen.getByRole("tab", { name: "Timeline" }));
		const chronology = await screen.findByRole("list", {
			name: "Stamps by date",
		});
		await user.click(
			within(chronology).getByRole("button", {
				name: "Open stamp: 2021-05-05 entry Romania",
			}),
		);
		expect(
			await screen.findByRole("heading", { name: /b-1\.png/ }),
		).toBeTruthy();
		expect((passport as HTMLSelectElement).value).toBe("");
		const pages = queue.getByRole("combobox", { name: "Pages" });
		expect(
			within(pages).getByRole("option", { name: "Needs attention (3)" }),
		).toBeTruthy();
	});
});
