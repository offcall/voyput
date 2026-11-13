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
		const empty = renderApp("/");
		await waitFor(() =>
			expect(empty.router.state.location.pathname).toBe("/collect/passports"),
		);
		empty.unmount();

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
		expect(stepLink(5).getAttribute("aria-label")).toBe("Step 5: Trips, to do");
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

	it("moves between steps with the stepper and Back / Next", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/collect/passports");
		await screen.findByRole("navigation", { name: "Step" });
		const stepNav = () =>
			within(screen.getByRole("navigation", { name: "Step" }));
		await user.click(
			stepNav().getByRole("link", { name: "Next: Photo locations →" }),
		);
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/locations"),
		);
		await user.click(stepNav().getByRole("link", { name: "← Passports" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/passports"),
		);
		await user.click(stepLink(5));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/trips"),
		);
		expect(
			stepNav().getByRole("link", { name: "Open Visualize →" }),
		).toBeTruthy();
	});

	it("shows the totals and one next action in the success header", async () => {
		const db = freshDb();
		await seed(db, { photos: 1, ok: 1 });
		await db.stamps.bulkPut([stamp("s1", false), stamp("s2", false)]);
		renderApp("/collect/passports", { db });

		const header = (
			await screen.findByRole("heading", { level: 1, name: "Collect" })
		).closest("header");
		if (!header) throw new Error("success header missing");
		const hero = within(header);
		await waitFor(() =>
			expect(
				hero
					.getByRole("progressbar", { name: "Collect progress" })
					.getAttribute("aria-valuenow"),
			).toBe("3"),
		);
		const go = hero.getByRole("link", { name: "Review 2 stamps" });
		expect(go.getAttribute("href")).toBe("/collect/review");
		const stat = (label: string) =>
			[...header.querySelectorAll("dt")].find((dt) => dt.textContent === label)
				?.nextElementSibling?.textContent;
		// No saved trip yet: countries come from the locations, days wait for trips.
		expect(stat("Countries")).toBe("1");
		expect(stat("Days abroad")).toBe("–");
		expect(stat("To do")).toBe("3");
	});

	it("celebrates when every step is done and leads to Visualize", async () => {
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
		const { router } = renderApp("/", { db });
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/trips"),
		);
		const done = (await screen.findByText(/All five steps done/)).closest(
			"[role=status]",
		);
		if (!(done instanceof HTMLElement)) throw new Error("no done status");
		expect(done.textContent).toContain("All five steps done");
		expect(
			within(done)
				.getByRole("link", { name: "Open Visualize" })
				.getAttribute("href"),
		).toBe("/visualize");
	});
});
