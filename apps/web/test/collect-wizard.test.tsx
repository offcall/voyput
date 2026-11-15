import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Stamp } from "@voyput/core";
import { beforeEach, describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { COLLECT_STEPS } from "../src/features/collect/steps";
import { STEP_IDS } from "../src/features/import/plan/planProgress";
import { stubObjectUrls } from "./fixtures/demo";
import { seedTrips, type TestTrip } from "./fixtures/stays";
import { renderApp } from "./renderApp";

let dbCount = 0;
const freshDb = () => new VoyputDb(`collect-${++dbCount}`);

const stamp = (id: string, reviewed: boolean, problem = false): Stamp => ({
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
	problem: problem ? "date check: printed year differs" : null,
	source: "ai",
	reviewed,
});

const trip = (
	id: string,
	start: string,
	end: string,
	cc: string,
): TestTrip => ({
	id,
	title: id,
	start,
	end,
	confirmed: true,
	arrival: { date: start, method: "plane", source: "stamp" },
	departure: { date: end, method: "plane", source: "stamp" },
	stops: [
		{
			id: `${id}-0`,
			day: start,
			countryCode: cc,
			country: cc,
			cities: [],
			kind: "stay",
		},
	],
	stampIds: [],
});

/** One passport with `photos` photos, `ok` of them extracted and `failed` failed, and a few locations. */
async function seed(
	db: VoyputDb,
	{ photos = 2, ok = 0, failed = 0, locations = 3 } = {},
) {
	await db.passports.put({
		id: "p1",
		name: "Blue",
		validFrom: null,
		validTo: null,
		createdAt: "2024-01-01T00:00:00Z",
	});
	for (let i = 0; i < photos; i++) {
		await db.photos.put({
			id: `ph${i}`,
			passportId: "p1",
			name: `page-${i}.png`,
			mimeType: "image/png",
			rotation: 0,
			addedAt: "2024-01-01T00:00:00Z",
			blob: new Blob(["x"], { type: "image/png" }),
		});
		const status = i < ok ? "ok" : i < ok + failed ? "failed" : null;
		if (status)
			await db.extractions.put({
				photoId: `ph${i}`,
				status,
				notes: "",
				model: "test",
				seconds: 1,
				finishedAt: "2024-01-01T00:00:00Z",
			});
	}
	await db.locations.bulkAdd(
		Array.from({ length: locations }, (_, i) => ({
			date: "2024-03-02T00:00:00",
			lat: 0,
			lon: 0,
			countryCode: "RO",
			country: "Romania",
			city: "",
			source: "",
			isVideo: false,
			filename: `${i}.jpg`,
			uuid: `u${i}`,
		})),
	);
}

const stepper = () =>
	within(screen.getByRole("navigation", { name: "Collect steps" }));
const stepLink = (index: number) =>
	stepper().getByRole("link", { name: new RegExp(`^Step ${index}: `) });

describe("collect wizard", () => {
	beforeEach(() => stubObjectUrls());

	it("has one step per registry entry, in plan order", () => {
		expect(COLLECT_STEPS.map((step) => step.id)).toEqual([...STEP_IDS]);
		expect(STEP_IDS).toEqual([
			"passports",
			"locations",
			"extract",
			"review",
			"trips",
		]);
	});

	it("opens the first step that is not done", async () => {
		const db = freshDb();
		await seed(db, { photos: 2, ok: 1 });
		const { router } = renderApp("/collect", { db });
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/extract"),
		);
		expect(
			await screen.findByRole("heading", { level: 2, name: "Read the stamps" }),
		).toBeTruthy();
	});

	it("sends an unknown step to the first step that is not done", async () => {
		const db = freshDb();
		await seed(db, { photos: 1, ok: 1 });
		await db.stamps.put(stamp("s1", false));
		const { router } = renderApp("/collect/nope", { db });
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/review"),
		);
	});

	it("redirects the old URLs to their steps and keeps the params", async () => {
		const db = freshDb();
		await seedTrips(db, [trip("t1", "2024-03-01", "2024-03-05", "RO")], "MD");
		const cases: [string, string, Record<string, string>?][] = [
			["/import", "/collect/passports"],
			["/extract", "/collect/extract"],
			[
				"/review?tab=timeline&photo=ph9",
				"/collect/review",
				{ tab: "timeline", photo: "ph9" },
			],
			["/trips", "/collect/trips"],
			["/trips/t1", "/collect/trips/t1"],
		];
		for (const [from, to, search] of cases) {
			const view = renderApp(from, { db });
			await waitFor(() => expect(view.router.state.location.pathname).toBe(to));
			if (search)
				expect(view.router.state.location.search).toMatchObject(search);
			view.unmount();
		}
	});

	it("marks each step done, needing attention or to do, with its count", async () => {
		const db = freshDb();
		await seed(db, { photos: 3, ok: 1, failed: 1, locations: 2500 });
		await db.stamps.bulkPut([stamp("s1", false, true), stamp("s2", true)]);
		renderApp("/collect/review", { db });

		await waitFor(() =>
			expect(stepLink(1).getAttribute("aria-label")).toBe(
				"Step 1: Passports, done, 3 photos",
			),
		);
		expect(stepLink(2).getAttribute("aria-label")).toBe(
			"Step 2: Photo locations, done, 2.5k locations",
		);
		expect(stepLink(3).getAttribute("aria-label")).toBe(
			"Step 3: Extract, needs attention, 1 failed",
		);
		expect(stepLink(4).getAttribute("aria-label")).toBe(
			"Step 4: Review, needs attention, 1 to check",
		);
		expect(stepLink(5).getAttribute("aria-label")).toBe("Step 5: Stays, to do");
		expect(stepLink(4).getAttribute("aria-current")).toBe("page");
		expect(stepLink(3).getAttribute("aria-current")).toBeNull();
	});

	it("counts a failed photo as handled once its stamps were added and reviewed by hand", async () => {
		const db = freshDb();
		await seed(db, { photos: 1, failed: 1 });
		renderApp("/collect/extract", { db });
		await waitFor(() =>
			expect(stepLink(3).getAttribute("aria-label")).toBe(
				"Step 3: Extract, needs attention, 1 failed",
			),
		);
		const manual = (reviewed: boolean): Stamp => ({
			...stamp("m1", reviewed),
			photoId: "ph0",
			source: "manual",
			confidence: null,
		});
		// Added by hand but not reviewed yet: still needs attention.
		await db.stamps.put(manual(false));
		await waitFor(() =>
			expect(stepLink(4).getAttribute("aria-label")).toContain("1 to check"),
		);
		expect(stepLink(3).getAttribute("aria-label")).toContain("1 failed");
		await db.stamps.put(manual(true));
		await waitFor(() =>
			expect(stepLink(3).getAttribute("aria-label")).toMatch(
				/^Step 3: Extract, done/,
			),
		);
	});

	it("moves between steps with the stepper and the next action", async () => {
		const db = freshDb();
		await seed(db, { photos: 1, ok: 1 });
		await db.stamps.bulkPut([stamp("s1", false), stamp("s2", false)]);
		const user = userEvent.setup();
		const { router } = renderApp("/collect/passports", { db });

		// Elsewhere the one primary button leads to the first step not done.
		const go = await screen.findByRole("link", { name: "Review 2 stamps →" });
		expect(go.getAttribute("href")).toBe("/collect/review");
		await user.click(go);
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/review"),
		);
		// On that step the page holds the action; the bar leads on to the next step.
		await user.click(
			await screen.findByRole("link", { name: "Next: Stays →" }),
		);
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/trips"),
		);
		// Stays is its own section: no Collect bar there.
		expect(
			screen.queryByRole("navigation", { name: "Collect steps" }),
		).toBeNull();
		expect(
			screen.queryByRole("heading", { level: 1, name: "Collect" }),
		).toBeNull();
	});

	it("shows progress once, in one compact bar", async () => {
		const db = freshDb();
		await seed(db, { photos: 1, ok: 1 });
		renderApp("/collect/locations", { db });
		const bar = (
			await screen.findByRole("heading", { level: 1, name: "Collect" })
		).closest("header");
		if (!bar) throw new Error("Collect bar missing");
		// Five steps and one next action.
		await waitFor(() =>
			expect(within(bar).getAllByRole("link")).toHaveLength(6),
		);
		expect(document.querySelectorAll("dt")).toHaveLength(0);
		expect(screen.queryByRole("progressbar")).toBeNull();
	});

	it("leads to Insights when every step is done", async () => {
		const db = freshDb();
		await seed(db, { photos: 1, ok: 1 });
		await db.stamps.put(stamp("s1", true));
		await seedTrips(
			db,
			[
				trip("t1", "2024-03-01", "2024-03-05", "RO"),
				trip("t2", "2024-06-01", "2024-06-02", "BG"),
			],
			"MD",
		);
		// All done: `/collect` opens the last source step, which keeps the Collect bar; Stays has none.
		const { router } = renderApp("/collect", { db });
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/review"),
		);
		expect(
			(
				await screen.findByRole("link", { name: "See your insights →" })
			).getAttribute("href"),
		).toBe("/visualize");
	});
});

describe("collect sources", () => {
	beforeEach(() => stubObjectUrls());

	const stepNames = () =>
		stepper()
			.getAllByRole("link")
			.map(
				(link) =>
					/^Step \d+: ([^,]+)/.exec(link.getAttribute("aria-label") ?? "")?.[1],
			);

	it("asks what the user has on the first visit, hides the steps it does not need and keeps the choice", async () => {
		const db = freshDb();
		const user = userEvent.setup();
		const first = renderApp("/collect", { db });
		await screen.findByRole("heading", { level: 1, name: "What do you have?" });
		expect(first.router.state.location.pathname).toBe("/collect");

		await user.click(screen.getByRole("button", { name: /^Photos only/ }));
		await waitFor(() =>
			expect(first.router.state.location.pathname).toBe("/collect/locations"),
		);
		await waitFor(() =>
			expect(stepNames()).toEqual(["Photo locations", "Stays"]),
		);
		expect((await db.kv.get("collect:sources"))?.value).toBe("photos");
		first.unmount();

		// Back again: no question, straight to the first step the choice needs.
		const again = renderApp("/collect", { db });
		await waitFor(() =>
			expect(again.router.state.location.pathname).toBe("/collect/locations"),
		);
		await waitFor(() =>
			expect(stepNames()).toEqual(["Photo locations", "Stays"]),
		);

		// Data wins over the choice: a stamp brings the passport steps back.
		await seed(db, { photos: 1, locations: 0 });
		await db.stamps.put(stamp("s1", false));
		await waitFor(() =>
			expect(stepNames()).toEqual([
				"Passports",
				"Photo locations",
				"Extract",
				"Review",
				"Stays",
			]),
		);
	});

	it("changes the sources from the Collect bar", async () => {
		const db = freshDb();
		await db.kv.put({ key: "collect:sources", value: "passport" });
		const user = userEvent.setup();
		renderApp("/collect/passports", { db });
		await waitFor(() =>
			expect(stepNames()).toEqual(["Passports", "Extract", "Review", "Stays"]),
		);
		await user.click(
			screen.getByRole("button", { name: "Sources: Passport only · change" }),
		);
		const dialog = await screen.findByRole("dialog");
		await user.click(within(dialog).getByRole("button", { name: /^Both/ }));
		await waitFor(() => expect(stepNames()).toHaveLength(5));
		expect((await db.kv.get("collect:sources"))?.value).toBe("both");
	});
});
