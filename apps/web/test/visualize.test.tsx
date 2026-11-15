import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LocationRow } from "@voyput/core";
import { describe, expect, it, vi } from "vitest";
import { VoyputDb } from "../src/db/db";
import { MAP_MODE_KEY } from "../src/features/visualize/views/MapView";
import { seedTrips, type TestTrip } from "./fixtures/stays";
import { renderApp } from "./renderApp";

let n = 0;
const photo = (
	day: string,
	countryCode: string,
	country: string,
	lat: number,
	lon: number,
): LocationRow => ({
	date: `${day}T12:00:00+02:00`,
	lat,
	lon,
	countryCode,
	country,
	city: "",
	source: "apple",
	isVideo: false,
	filename: `IMG_${++n}.jpg`,
	uuid: `photo-${n}`,
});

/** A trip whose stops are on its first day; its derived title names the countries. */
const trip = (
	id: string,
	countries: string[],
	start: string,
	end: string,
): TestTrip => ({
	id,
	title: id,
	start,
	end,
	confirmed: true,
	arrival: { date: start, source: "manual", method: "plane" },
	departure: { date: end, source: "manual", method: "plane" },
	stops: countries.map((countryCode) => ({
		id: `${id}-${countryCode}`,
		day: start,
		countryCode,
		country: countryCode,
		cities: [],
		kind: "stay",
	})),
	stampIds: [],
});

const nav = () => within(screen.getByRole("navigation", { name: "Sections" }));

describe("insights", () => {
	it("points to Import when there are no locations", async () => {
		renderApp("/insights/map");
		expect(
			await screen.findByText("No photo location history yet"),
		).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: "Import photo locations" })
				.getAttribute("href"),
		).toBe("/collect/locations");
	});

	it("reports a failed database read instead of the empty state", async () => {
		const db = new VoyputDb("visualize-error");
		vi.spyOn(db.locations, "toArray").mockRejectedValue(
			new Error("disk is gone"),
		);
		renderApp("/insights", { db });
		expect((await screen.findByRole("alert")).textContent).toContain(
			"disk is gone",
		);
		expect(screen.queryByText("No photo location history yet")).toBeNull();
	});

	it("fails only the stay views when the stays cannot be read", async () => {
		const db = new VoyputDb("visualize-stays-error");
		await db.locations.bulkPut([
			photo("2024-03-02", "RO", "Romania", 44.4, 26.1),
		]);
		vi.spyOn(db.stamps, "toArray").mockRejectedValue(
			new Error("stamps are gone"),
		);
		const map = renderApp("/insights/map", { db });
		expect(
			await screen.findByRole("group", { name: "Route map" }),
		).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
		map.unmount();

		renderApp("/insights/stats", { db });
		expect((await screen.findByRole("alert")).textContent).toContain(
			"stamps are gone",
		);
	});

	it("renders every view and narrows them all with one filter", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("visualize-filter");
		await db.locations.bulkPut([
			photo("2024-01-05", "MD", "Moldova", 47.0, 28.8),
			photo("2024-03-02", "RO", "Romania", 44.4, 26.1),
			photo("2024-03-03", "RO", "Romania", 45.6, 25.6),
			photo("2024-06-10", "JP", "Japan", 35.7, 139.7),
			photo("2024-06-11", "JP", "Japan", 34.7, 135.5),
			photo("2024-06-12", "KR", "South Korea", 37.6, 127.0),
		]);
		await seedTrips(
			db,
			[
				trip("t1", ["RO"], "2024-03-01", "2024-03-05"),
				trip("t2", ["JP", "KR"], "2024-06-09", "2024-06-13"),
				trip("t3", ["BG"], "2024-09-01", "2024-09-02"),
			],
			"MD",
		);
		renderApp("/insights/map", { db });
		const panel = () => within(screen.getByRole("main"));
		expect(
			await screen.findByText(
				"4 countries · 6 photos · 6 days with photos · 4 periods",
			),
		).toBeTruthy();
		expect(panel().getByRole("group", { name: "Route map" })).toBeTruthy();

		const views: [string, () => unknown][] = [
			[
				"Calendar",
				() =>
					panel().getByRole("group", { name: "Photos per day in 2024" }) &&
					panel().getByRole("img", { name: "Photos per month" }),
			],
			[
				"Stats",
				() =>
					panel().getByRole("list", { name: "Sequence of countries" }) &&
					panel().getByRole("row", { name: /Romania 2 33.3%/ }) &&
					panel().getByRole("rowheader", { name: "All countries" }) &&
					panel().getByRole("group", { name: "Moves between countries" }) &&
					panel().getByRole("group", { name: "Countries in 2024" }) &&
					panel().getByText("Total distance") &&
					panel().getByRole("img", { name: "Kilometres per year" }),
			],
		];
		for (const [name, content] of views) {
			await user.click(nav().getByRole("link", { name }));
			await waitFor(() => expect(content()).toBeTruthy());
		}

		// One filter for every view: a country, shown as a removable chip.
		await user.click(screen.getByRole("button", { name: /^Filter/ }));
		await user.click(screen.getByText("More filters"));
		const countries = () =>
			within(screen.getByRole("group", { name: "Countries" }));
		await user.click(countries().getByRole("button", { name: /Romania/ }));
		expect(
			screen.getByRole("button", { name: "Remove filter: Romania" }),
		).toBeTruthy();
		await user.click(nav().getByRole("link", { name: "Map" }));
		expect(
			await screen.findByText(
				"1 country · 2 photos · 2 days with photos · 1 period",
			),
		).toBeTruthy();

		await user.click(
			screen.getByRole("button", { name: "Remove filter: Romania" }),
		);
		expect(
			await screen.findByText(
				"4 countries · 6 photos · 6 days with photos · 4 periods",
			),
		).toBeTruthy();
		expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();

		await user.click(countries().getByRole("button", { name: /Bulgaria/ }));
		expect(
			await screen.findByText("No photos fall inside the filter."),
		).toBeTruthy();
		// The view stays where it was.
		expect(
			nav().getByRole("link", { name: "Map" }).getAttribute("aria-current"),
		).toBe("page");
	});

	it("switches the map between flat, heat and globe and remembers the choice", async () => {
		const user = userEvent.setup();
		localStorage.removeItem(MAP_MODE_KEY);
		const db = new VoyputDb("insights-map-switch");
		await db.locations.bulkPut([
			photo("2024-03-02", "RO", "Romania", 44.4, 26.1),
		]);
		const { router, unmount } = renderApp("/insights/map", { db });
		const style = () =>
			within(screen.getByRole("group", { name: "Map style" }));
		expect(
			await screen.findByRole("group", { name: "Route map" }),
		).toBeTruthy();
		expect(
			style()
				.getByRole("button", { name: "Flat" })
				.getAttribute("aria-pressed"),
		).toBe("true");

		await user.click(style().getByRole("button", { name: "Heat" }));
		// Canvas charts draw nothing in jsdom but must not crash.
		expect(screen.getByRole("img", { name: "Photo heatmap" })).toBeTruthy();
		expect(router.state.location.search).toEqual({ mode: "heat" });
		await user.click(style().getByRole("button", { name: "Globe" }));
		expect(screen.getByRole("img", { name: "Globe" })).toBeTruthy();
		expect(localStorage.getItem(MAP_MODE_KEY)).toBe("globe");
		unmount();

		// A later visit without a mode in the URL opens the last choice.
		renderApp("/insights/map", { db });
		expect(await screen.findByRole("img", { name: "Globe" })).toBeTruthy();
		localStorage.removeItem(MAP_MODE_KEY);
	});
});
