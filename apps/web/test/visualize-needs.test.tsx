import { screen, within } from "@testing-library/react";
import type { LocationRow } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { seedTrips, type TestStop, type TestTrip } from "./fixtures/stays";
import { renderApp } from "./renderApp";

let n = 0;
const photo = (
	day: string,
	countryCode: string,
	country: string,
): LocationRow => ({
	date: `${day}T12:00:00+02:00`,
	lat: 44.4,
	lon: 26.1,
	countryCode,
	country,
	city: "",
	source: "apple",
	isVideo: false,
	filename: `IMG_${++n}.jpg`,
	uuid: `photo-${n}`,
});

const stop = (day: string): TestStop => ({
	id: `${day}-RO`,
	day,
	countryCode: "RO",
	country: "Romania",
	cities: [],
	kind: "stay",
});

const romania: TestTrip = {
	id: "romania",
	title: "Romania",
	start: "2024-03-01",
	end: "2024-03-05",
	confirmed: true,
	arrival: { date: "2024-03-01", source: "manual", method: "plane" },
	departure: { date: "2024-03-05", source: "manual", method: "plane" },
	stops: [stop("2024-03-02"), stop("2024-03-03")],
	stampIds: [],
};

async function seed(
	name: string,
	{ locations, trips }: { locations: boolean; trips: boolean },
): Promise<VoyputDb> {
	const db = new VoyputDb(name);
	if (locations)
		await db.locations.bulkPut([
			photo("2024-01-05", "MD", "Moldova"),
			photo("2024-01-06", "MD", "Moldova"),
		]);
	if (trips) await seedTrips(db, [romania], "MD");
	return db;
}

const main = () => within(screen.getByRole("main"));
const hrefOf = (name: string) =>
	main().getByRole("link", { name }).getAttribute("href");

describe("visualize placeholders", () => {
	it("asks for locations first when a stay tab has no data at all", async () => {
		renderApp("/visualize/route", {
			db: await seed("needs-empty", { locations: false, trips: false }),
		});
		expect(await screen.findByText("No stays yet")).toBeTruthy();
		expect(hrefOf("Import photo locations")).toBe("/collect/locations");
		expect(screen.queryByText(/Step \d of \d/)).toBeNull();
	});

	it("shows the Explore placeholder instead of the dashboard", async () => {
		renderApp("/visualize/explore", {
			db: await seed("needs-explore", { locations: false, trips: false }),
		});
		expect(await screen.findByText("No stays yet")).toBeTruthy();
		expect(screen.queryByText("Longest stay")).toBeNull();
	});

	it("draws Explore from photos alone: every photo place is a suggested stay", async () => {
		renderApp("/visualize/explore", {
			db: await seed("needs-photos", { locations: true, trips: false }),
		});
		expect(
			await screen.findByText(
				"These stays are suggestions from your stamps and photos.",
			),
		).toBeTruthy();
		expect(hrefOf("Check stays")).toBe("/collect/trips");
		expect(screen.queryByText("No stays yet")).toBeNull();
	});

	it("tells a chart tab's user their stays are kept but locations are missing", async () => {
		renderApp("/visualize/map", {
			db: await seed("needs-chart", { locations: false, trips: true }),
		});
		expect(
			await screen.findByText("No photo location history yet"),
		).toBeTruthy();
		expect(main().getByText(/You have 1 stay, but this view/)).toBeTruthy();
		expect(hrefOf("Import photo locations")).toBe("/collect/locations");
		expect(screen.queryByRole("group", { name: "Route map" })).toBeNull();
	});

	it("plays saved stays without locations and hints at the import", async () => {
		renderApp("/visualize/route", {
			db: await seed("needs-route", { locations: false, trips: true }),
		});
		expect(
			await screen.findByRole("img", { name: "Route player map" }),
		).toBeTruthy();
		expect(hrefOf("Import photo locations")).toBe("/collect/locations");
		expect(screen.queryByText("No stays yet")).toBeNull();
	});

	it("draws a chart from locations alone and suggests saving stays for the filter", async () => {
		renderApp("/visualize/map", {
			db: await seed("needs-filter", { locations: true, trips: false }),
		});
		expect(
			await screen.findByRole("group", { name: "Route map" }),
		).toBeTruthy();
		expect(
			main().getByText(
				"Save your stays to filter these charts by country or stay.",
			),
		).toBeTruthy();
		expect(hrefOf("Check stays")).toBe("/collect/trips");
	});

	it("draws the chart and the stay filter when both are there", async () => {
		renderApp("/visualize/map", {
			db: await seed("needs-full", { locations: true, trips: true }),
		});
		expect(
			await screen.findByRole("group", { name: "Route map" }),
		).toBeTruthy();
		expect(
			main().getByRole("checkbox", { name: /^Romania 1 stay$/ }),
		).toBeTruthy();
		expect(
			main().getByRole("checkbox", { name: /^2\. Romania 1 → 5 Mar 2024$/ }),
		).toBeTruthy();
		expect(main().queryByRole("link", { name: "Check stays" })).toBeNull();
	});
});
