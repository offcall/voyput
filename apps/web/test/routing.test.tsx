import { createBrowserHistory } from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/app/App";
import { createAppRouter, redirectLegacyHash } from "../src/app/router";
import { VoyputDb } from "../src/db/db";
import { seedDemo, stubObjectUrls } from "./fixtures/demo";
import { seedTrips, type TestTrip } from "./fixtures/stays";
import { offlineAi, renderApp } from "./renderApp";

let dbCount = 0;

/** A trip to one country; its stay's id is `<id>-0`. */
const trip = (
	id: string,
	countryCode: string,
	start: string,
	end: string,
): TestTrip => ({
	id,
	title: id,
	start,
	end,
	confirmed: true,
	arrival: { date: start, source: "manual", method: "unknown" },
	departure: { date: end, source: "manual", method: "unknown" },
	stops: [
		{
			id: `${id}-stop`,
			day: start,
			countryCode,
			country: countryCode,
			cities: [],
			kind: "stay",
		},
	],
	stampIds: [],
});

async function tripsDb() {
	const db = new VoyputDb(`routing-${++dbCount}`);
	await seedTrips(
		db,
		[
			trip("t1", "PT", "2024-03-01", "2024-03-05"),
			trip("t2", "JP", "2024-05-10", "2024-05-20"),
		],
		"UA",
	);
	return db;
}

/** The detail of a selected stay, by its country. */
const detailHeading = (country: string) =>
	screen.queryByRole("heading", { name: country });
const row = (country: string) =>
	screen.findByRole("button", { name: new RegExp(`^\\d+\\. ${country},`) });

describe("routing", () => {
	beforeEach(() => stubObjectUrls());

	it("opens the stay named in the path", async () => {
		renderApp("/collect/trips/t2-0", { db: await tripsDb() });
		expect(await screen.findByRole("heading", { name: "Japan" })).toBeTruthy();
		expect(detailHeading("Portugal")).toBeNull();
	});

	it("shows the list for an unknown stay id", async () => {
		renderApp("/collect/trips/nope", { db: await tripsDb() });
		expect(await row("Portugal")).toBeTruthy();
		expect(
			screen.getByText("Pick a stay to see its days, edges and stamps."),
		).toBeTruthy();
	});

	it("puts the selected stay in the path and follows back and forward", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/collect/trips", { db: await tripsDb() });

		await user.click(await row("Portugal"));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/trips/t1-0"),
		);
		await user.click(await row("Japan"));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/trips/t2-0"),
		);
		expect(detailHeading("Japan")).toBeTruthy();

		act(() => router.history.back());
		await waitFor(() => expect(detailHeading("Portugal")).toBeTruthy());
		act(() => router.history.back());
		await waitFor(() => expect(detailHeading("Portugal")).toBeNull());
		expect(router.state.location.pathname).toBe("/collect/trips");
		act(() => router.history.forward());
		await waitFor(() => expect(detailHeading("Portugal")).toBeTruthy());
	});

	it("changes the path when moving between steps and sections", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/");
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/passports"),
		);
		await user.click(screen.getByRole("link", { name: /^Step 5: Stays/ }));
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
		window.history.replaceState(null, "", "/#/trips/t1-0");
		redirectLegacyHash(window);
		expect(window.location.pathname).toBe("/trips/t1-0");
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
			await screen.findByRole("heading", { name: "Portugal" }),
		).toBeTruthy();
		window.history.replaceState(null, "", "/");
	});
});
