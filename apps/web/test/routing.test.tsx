import { createBrowserHistory } from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trip } from "@voyput/core";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/app/App";
import { createAppRouter, redirectLegacyHash } from "../src/app/router";
import { VoyputDb } from "../src/db/db";
import { seedDemo, stubObjectUrls } from "./fixtures/demo";
import { offlineAi, renderApp } from "./renderApp";

let dbCount = 0;

const trip = (id: string, title: string, start: string, end: string): Trip => ({
	id,
	title,
	start,
	end,
	confirmed: true,
	arrival: { date: start, source: "manual", method: "unknown" },
	departure: { date: end, source: "manual", method: "unknown" },
	stops: [],
	stampIds: [],
});

async function tripsDb() {
	const db = new VoyputDb(`routing-${++dbCount}`);
	await db.trips.bulkPut([
		trip("t1", "Lisbon", "2024-03-01", "2024-03-05"),
		trip("t2", "Osaka", "2024-05-10", "2024-05-20"),
	]);
	return db;
}

const detailHeading = (title: string) =>
	screen.queryByRole("heading", { name: `Trip: ${title}` });

describe("routing", () => {
	beforeEach(() => stubObjectUrls());

	it("opens the trip named in the path", async () => {
		renderApp("/collect/trips/t2", { db: await tripsDb() });
		expect(
			await screen.findByRole("heading", { name: "Trip: Osaka" }),
		).toBeTruthy();
		expect(detailHeading("Lisbon")).toBeNull();
	});

	it("shows the list for an unknown trip id", async () => {
		renderApp("/collect/trips/nope", { db: await tripsDb() });
		expect(await screen.findByRole("button", { name: "Lisbon" })).toBeTruthy();
		expect(
			screen.getByText("Pick a trip to see its days, stops and stamps."),
		).toBeTruthy();
	});

	it("puts the selected trip in the path and follows back and forward", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/collect/trips", { db: await tripsDb() });

		await user.click(await screen.findByRole("button", { name: "Lisbon" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/trips/t1"),
		);
		await user.click(screen.getByRole("button", { name: "Osaka" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/trips/t2"),
		);
		expect(detailHeading("Osaka")).toBeTruthy();

		act(() => router.history.back());
		await waitFor(() => expect(detailHeading("Lisbon")).toBeTruthy());
		act(() => router.history.back());
		await waitFor(() => expect(detailHeading("Lisbon")).toBeNull());
		expect(router.state.location.pathname).toBe("/collect/trips");
		act(() => router.history.forward());
		await waitFor(() => expect(detailHeading("Lisbon")).toBeTruthy());
	});

	it("changes the path when moving between steps and sections", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/");
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/passports"),
		);
		await user.click(screen.getByRole("link", { name: /^Step 5: Trips/ }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/trips"),
		);
		await user.click(screen.getByRole("link", { name: /Settings/ }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/settings"),
		);
	});

	it("keeps the Review tab and photo in the search params", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb(`routing-${++dbCount}`);
		await seedDemo(db);
		const photos = await db.photos.toArray();
		const second = photos.find((p) => p.name === "page-2.png");
		if (!second) throw new Error("demo page-2.png missing");

		const { router } = renderApp(`/collect/review?photo=${second.id}`, { db });
		const current = await screen.findByRole("button", { current: true });
		expect(current.textContent).toContain("page-2.png");

		await user.click(screen.getByRole("tab", { name: "Timeline" }));
		await waitFor(() =>
			expect(router.state.location.search).toMatchObject({
				tab: "timeline",
				photo: second.id,
			}),
		);
		act(() => router.history.back());
		await waitFor(() =>
			expect(
				screen
					.getByRole("tab", { name: "Photos" })
					.getAttribute("aria-selected"),
			).toBe("true"),
		);
	});

	it("rewrites an old hash URL to a path once", async () => {
		window.history.replaceState(null, "", "/#/trips/t1");
		redirectLegacyHash(window);
		expect(window.location.pathname).toBe("/trips/t1");
		expect(window.location.hash).toBe("");

		const router = createAppRouter(createBrowserHistory());
		render(
			<App
				router={router}
				db={await tripsDb()}
				storage={localStorage}
				ai={offlineAi}
			/>,
		);
		expect(
			await screen.findByRole("heading", { name: "Trip: Lisbon" }),
		).toBeTruthy();
		window.history.replaceState(null, "", "/");
	});
});
