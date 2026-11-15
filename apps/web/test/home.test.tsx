import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

let dbCount = 0;
const freshDb = () => new VoyputDb(`home-${++dbCount}`);

/** One passport page read by the AI with one unreviewed stamp, and one photo location. */
async function seedReturning(db: VoyputDb) {
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
	await db.stamps.put({
		id: "s1",
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
		reviewed: false,
	});
	await db.locations.put({
		date: "2024-03-02T00:00:00",
		lat: 0,
		lon: 0,
		countryCode: "RO",
		country: "Romania",
		city: "",
		source: "",
		isVideo: false,
		filename: "0.jpg",
		uuid: "u0",
	});
	await db.kv.put({ key: "collect:sources", value: "both" });
}

describe("home page", () => {
	beforeEach(() => stubObjectUrls());

	it("shows the home page on / for a new user, with the sources choice and no Continue", async () => {
		const { router } = renderApp("/", { db: freshDb() });
		await screen.findByRole("heading", {
			level: 1,
			name: "Your travel history from passport stamps and iPhone photo locations",
		});
		expect(
			screen.getByText(
				"Nothing is uploaded. Everything runs and stays in your browser.",
			),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: /^Photos only/ })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Try with demo data" }),
		).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: "read the code on GitHub" })
				.getAttribute("href"),
		).toBe("https://github.com/offcall/voyput");
		expect(screen.queryByText("Welcome back")).toBeNull();
		expect(router.state.location.pathname).toBe("/");
	});

	it("starts Collect from the sources choice", async () => {
		const user = userEvent.setup();
		const db = freshDb();
		const { router } = renderApp("/", { db });
		await user.click(
			await screen.findByRole("button", { name: /^Photos only/ }),
		);
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/locations"),
		);
		expect((await db.kv.get("collect:sources"))?.value).toBe("photos");
	});

	it("gives a returning user Continue to the next Collect step, a summary and links", async () => {
		const db = freshDb();
		await seedReturning(db);
		const user = userEvent.setup();
		const { router } = renderApp("/", { db });
		const cont = await screen.findByRole("link", {
			name: "Continue → Review 1 stamp",
		});
		expect(cont.getAttribute("href")).toBe("/collect/review");
		expect(screen.getByText("1 country · 0 stays")).toBeTruthy();
		const card = within(
			screen.getByText("Welcome back").closest("section") as HTMLElement,
		);
		expect(card.getByRole("link", { name: "Stays" }).getAttribute("href")).toBe(
			"/collect/trips",
		);
		expect(
			card.getByRole("link", { name: "Insights" }).getAttribute("href"),
		).toBe("/insights");
		// The rest of the page stays below.
		expect(screen.getByRole("heading", { name: "How it works" })).toBeTruthy();
		expect(router.state.location.pathname).toBe("/");

		await user.click(cont);
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/review"),
		);
	});

	it("deletes everything in this browser after a confirm", async () => {
		const db = freshDb();
		await seedReturning(db);
		const user = userEvent.setup();
		renderApp("/", { db });
		await screen.findByText("Welcome back");

		await user.click(screen.getByRole("button", { name: "Delete everything" }));
		const dialog = await screen.findByRole("dialog", {
			name: "Delete everything?",
		});
		await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
		expect(await db.stamps.count()).toBe(1);

		await user.click(screen.getByRole("button", { name: "Delete everything" }));
		await user.click(
			within(
				await screen.findByRole("dialog", { name: "Delete everything?" }),
			).getByRole("button", { name: "Delete everything" }),
		);
		await screen.findByText("Everything stored in this browser was deleted.");
		const counts = await Promise.all(db.tables.map((table) => table.count()));
		expect(counts.every((count) => count === 0)).toBe(true);
		await waitFor(() => expect(screen.queryByText("Welcome back")).toBeNull());
	});

	it("leads home from the logo", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/settings", { db: freshDb() });
		await screen.findByRole("heading", { level: 1, name: "Settings" });
		await user.click(screen.getByRole("link", { name: "voyput home" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/"));
	});
});
