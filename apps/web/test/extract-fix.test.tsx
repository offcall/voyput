import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import {
	problemAfterEdit,
	updateStamp,
} from "../src/features/review/reviewStore";
import { stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

let dbCount = 0;

const PROBLEM =
	'date 2019-07-10 does not match printed "10.07.18"; unreadable country code "Unknown"';

/** page-1 failed to extract; page-2 was read, and its one stamp carries two warnings. */
async function seed(): Promise<VoyputDb> {
	const db = new VoyputDb(`extract-fix-${++dbCount}`);
	await db.passports.add({
		id: "pp1",
		name: "Moldova 1",
		validFrom: "2016-01-01",
		validTo: "2026-01-01",
		createdAt: "2026-01-01T00:00:00Z",
	});
	await db.photos.bulkAdd(
		["page-1", "page-2"].map((name) => ({
			id: name,
			passportId: "pp1",
			name,
			mimeType: "image/jpeg" as const,
			rotation: 0 as const,
			addedAt: "2026-01-01T00:00:00Z",
			blob: new Blob(["x"], { type: "image/jpeg" }),
		})),
	);
	const extraction = {
		model: "test/model",
		seconds: 1,
		finishedAt: "2026-01-01T00:00:00Z",
	};
	await db.extractions.bulkAdd([
		{
			...extraction,
			photoId: "page-1",
			status: "failed",
			notes: "invalid model output (expected { notes, stamps[] })\nraw",
		},
		{ ...extraction, photoId: "page-2", status: "ok", notes: "" },
	]);
	await db.stamps.add({
		id: "flagged",
		passportId: "pp1",
		photoId: "page-2",
		direction: "entry",
		borderCrossing: "unknown",
		dateText: "10.07.18",
		date: "2019-07-10",
		country: "Moldova",
		countryCode: null,
		location: null,
		confidence: 70,
		notes: "",
		problem: PROBLEM,
		source: "ai",
		reviewed: false,
	});
	return db;
}

describe("fixing extraction problems", () => {
	beforeEach(() => {
		stubObjectUrls();
		localStorage.setItem(
			"voyput:settings",
			JSON.stringify({ openRouterKey: "sk-or-test" }),
		);
	});

	it("opens a failed photo in Review, where a stamp can be added by hand", async () => {
		const db = await seed();
		const user = userEvent.setup();
		renderApp("/extract", { db });

		const row = await screen.findByRole("listitem", { name: "page-1" });
		expect(within(row).getByText(/could not be read/)).toBeTruthy();
		await user.click(within(row).getByRole("link", { name: "Open in Review" }));

		expect(await screen.findByRole("heading", { name: /page-1/ })).toBeTruthy();
		expect(screen.getByText(/AI extraction failed on this photo/)).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "+ Add stamp" }));
		expect(
			await screen.findByRole("article", { name: "Stamp 1" }),
		).toBeTruthy();
		const added = await db.stamps.where("photoId").equals("page-1").toArray();
		expect(added).toHaveLength(1);
		expect(added[0]?.source).toBe("manual");
	});

	it("links a check to its stamp, and a warning marked as fine stays gone after a reload", async () => {
		const db = await seed();
		const user = userEvent.setup();
		const first = renderApp("/extract", { db });

		const row = await screen.findByRole("listitem", { name: "page-2" });
		await user.click(
			within(row).getByRole("link", { name: "Check in Review" }),
		);

		const card = within(
			await screen.findByRole("article", { name: "Stamp 1" }),
		);
		expect(card.getByText(/does not match printed/)).toBeTruthy();
		expect(card.getByText(/unreadable country code/)).toBeTruthy();
		expect(first.router.state.location.search).toEqual({
			tab: "photos",
			photo: "page-2",
		});
		await user.click(card.getByRole("button", { name: "Check looks right" }));
		await waitFor(async () =>
			expect((await db.stamps.get("flagged"))?.dismissed?.problem).toBe(true),
		);
		first.unmount();

		renderApp("/extract", { db });
		const again = await screen.findByRole("listitem", { name: "page-2" });
		expect(within(again).queryByText("check")).toBeNull();
		expect(
			within(again).queryByRole("link", { name: "Check in Review" }),
		).toBeNull();
	});

	it("keeps a warning when the edit clears its field instead of fixing it", () => {
		expect(problemAfterEdit(PROBLEM, { date: null })).toBe(PROBLEM);
		expect(
			problemAfterEdit(PROBLEM, { country: "Moldavia", countryCode: null }),
		).toBe(PROBLEM);
		expect(
			problemAfterEdit('unreadable direction "in"', { direction: "unknown" }),
		).toBe('unreadable direction "in"');
	});

	it("clears only the warning about the field the user fixed", async () => {
		expect(problemAfterEdit(PROBLEM, { countryCode: "MD" })).toBe(
			'date 2019-07-10 does not match printed "10.07.18"',
		);
		expect(problemAfterEdit(PROBLEM, { date: "2018-07-10" })).toBe(
			'unreadable country code "Unknown"',
		);
		expect(problemAfterEdit(PROBLEM, { location: "Chisinau" })).toBe(PROBLEM);
		expect(
			problemAfterEdit('unreadable direction "in"', { direction: "entry" }),
		).toBeNull();

		const db = await seed();
		await updateStamp(db, "flagged", { countryCode: "MD", country: "Moldova" });
		expect((await db.stamps.get("flagged"))?.problem).toBe(
			'date 2019-07-10 does not match printed "10.07.18"',
		);
		await updateStamp(db, "flagged", { date: "2018-07-10" });
		expect((await db.stamps.get("flagged"))?.problem).toBeNull();
	});
});
