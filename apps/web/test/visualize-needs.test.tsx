import { screen, within } from "@testing-library/react";
import type { LocationRow, Stamp } from "@voyput/core";
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

/** A reviewed entry stamp into Romania. */
const stamp: Stamp = {
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
	reviewed: true,
};

async function seed(
	name: string,
	{
		locations,
		trips,
		stamps = false,
	}: { locations: boolean; trips: boolean; stamps?: boolean },
): Promise<VoyputDb> {
	const db = new VoyputDb(name);
	if (locations)
		await db.locations.bulkPut([
			photo("2024-01-05", "MD", "Moldova"),
			photo("2024-01-06", "MD", "Moldova"),
		]);
	if (trips) await seedTrips(db, [romania], "MD");
	if (stamps) await db.stamps.put(stamp);
	return db;
}

const main = () => within(screen.getByRole("main"));
const hrefOf = (name: string) =>
	main().getByRole("link", { name }).getAttribute("href");
const hints = () => document.querySelectorAll(".vp-insights-hint");

const STAMPS_HINT = "Add passport photos for exact border dates.";
const LOCATIONS_HINT = "Add photo locations to see cities and routes.";
const SUGGESTED_HINT =
	"These stays are suggestions from your stamps and photos.";

describe("insights placeholders and hints", () => {
	it("asks for locations first when a stay view has no data at all", async () => {
		renderApp("/insights/journey", {
			db: await seed("needs-empty", { locations: false, trips: false }),
		});
		expect(await screen.findByText("No stays yet")).toBeTruthy();
		expect(hrefOf("Import photo locations")).toBe("/collect/locations");
		expect(screen.queryByText(/Step \d of \d/)).toBeNull();
	});

	it("shows the Stats placeholder instead of the numbers", async () => {
		renderApp("/insights/stats", {
			db: await seed("needs-stats", { locations: false, trips: false }),
		});
		expect(await screen.findByText("No stays yet")).toBeTruthy();
		expect(screen.queryByText("Days abroad")).toBeNull();
	});

	it("draws Stats from photos alone and asks for stamps in one line", async () => {
		renderApp("/insights/stats", {
			db: await seed("needs-photos", { locations: true, trips: false }),
		});
		expect(await screen.findByText(STAMPS_HINT, { exact: false })).toBeTruthy();
		expect(hrefOf("Add passport photos →")).toBe("/collect/passports");
		expect(hints()).toHaveLength(1);
		expect(screen.queryByText("No stays yet")).toBeNull();
	});

	it("says the stays are suggestions once stamps and photos are there", async () => {
		renderApp("/insights/calendar", {
			db: await seed("needs-suggested", {
				locations: true,
				trips: false,
				stamps: true,
			}),
		});
		expect(
			await screen.findByText(SUGGESTED_HINT, { exact: false }),
		).toBeTruthy();
		expect(hrefOf("Check stays →")).toBe("/collect/trips");
		expect(hints()).toHaveLength(1);
	});

	it("tells a Map user their stays are kept but locations are missing", async () => {
		renderApp("/insights/map", {
			db: await seed("needs-chart", { locations: false, trips: true }),
		});
		expect(
			await screen.findByText("No photo location history yet"),
		).toBeTruthy();
		expect(main().getByText(/You have 1 stay, but this view/)).toBeTruthy();
		expect(hrefOf("Import photo locations")).toBe("/collect/locations");
		expect(screen.queryByRole("group", { name: "Route map" })).toBeNull();
	});

	it("plays saved stays without locations and hints at them, not at stamps", async () => {
		renderApp("/insights/journey", {
			db: await seed("needs-route", { locations: false, trips: true }),
		});
		expect(
			await screen.findByRole("img", { name: "Route player map" }),
		).toBeTruthy();
		expect(screen.getByText(LOCATIONS_HINT, { exact: false })).toBeTruthy();
		expect(hrefOf("Add photo locations →")).toBe("/collect/locations");
		expect(hints()).toHaveLength(1);
		expect(screen.queryByText("No stays yet")).toBeNull();
	});

	it("draws the map from locations alone, with the filter and no hint", async () => {
		renderApp("/insights/map", {
			db: await seed("needs-filter", { locations: true, trips: false }),
		});
		expect(
			await screen.findByRole("group", { name: "Route map" }),
		).toBeTruthy();
		expect(await screen.findByRole("button", { name: /^Filter/ })).toBeTruthy();
		expect(hints()).toHaveLength(0);
	});

	it("shows no hint when stamps, photos and saved stays are all there", async () => {
		renderApp("/insights/stats", {
			db: await seed("needs-full", {
				locations: true,
				trips: true,
				stamps: true,
			}),
		});
		expect(await screen.findByText("Days abroad")).toBeTruthy();
		expect(hints()).toHaveLength(0);
	});
});
