import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LocationRow, Trip } from "@voyput/core";
import { describe, expect, it, vi } from "vitest";
import { VoyputDb } from "../src/db/db";
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

const trip = (id: string, title: string, start: string, end: string): Trip => ({
	id,
	title,
	start,
	end,
	confirmed: true,
	arrival: { date: start, source: "manual", method: "plane" },
	departure: { date: end, source: "manual", method: "plane" },
	stops: [],
	stampIds: [],
});

/** Value of a summary tile, e.g. "4" for "Countries". */
const stat = (label: string) =>
	screen.queryByText(label, { selector: ".vp-stat-label" })?.nextElementSibling
		?.textContent;

const expectCountries = (count: string) =>
	waitFor(() => expect(stat("Countries")).toBe(count));

describe("visualize", () => {
	it("points to Import when there are no locations", async () => {
		renderApp("/visualize/map");
		expect(await screen.findByText("No location history yet")).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: "Import locations" })
				.getAttribute("href"),
		).toBe("/import");
	});

	it("reports a failed database read instead of the empty state", async () => {
		const db = new VoyputDb("visualize-error");
		vi.spyOn(db.locations, "toArray").mockRejectedValue(
			new Error("disk is gone"),
		);
		renderApp("/visualize", { db });
		expect((await screen.findByRole("alert")).textContent).toContain(
			"disk is gone",
		);
		expect(screen.queryByText("No location history yet")).toBeNull();
	});

	it("renders every tab and narrows them to the selected trips", async () => {
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
		await db.trips.bulkPut([
			trip("t1", "Romania", "2024-03-01", "2024-03-05"),
			trip("t2", "East Asia", "2024-06-09", "2024-06-13"),
			trip("t3", "Lost weekend", "2024-09-01", "2024-09-02"),
		]);
		renderApp("/visualize/movements", { db });
		await expectCountries("4");
		expect(stat("Photos")).toBe("6");
		expect(stat("Days with photos")).toBe("6");

		const panel = () => within(screen.getByRole("main"));
		const tabs: [string, () => unknown][] = [
			[
				"Periods",
				() => panel().getByRole("img", { name: "Sequence of countries" }),
			],
			[
				"Countries",
				() => panel().getByRole("row", { name: /Romania 2 33.3%/ }),
			],
			["Route map", () => panel().getByRole("img", { name: "Route map" })],
			// Canvas charts draw nothing in jsdom but must not crash.
			["Heatmap", () => panel().getByRole("img", { name: "Photo heatmap" })],
			["Globe", () => panel().getByRole("img", { name: "Globe" })],
			[
				"Year × country",
				() => panel().getByRole("rowheader", { name: "All countries" }),
			],
			[
				"Calendar",
				() =>
					panel().getByRole("img", { name: "Photos per day in 2024" }) &&
					panel().getByRole("img", { name: "Photos per month" }),
			],
			[
				"Moves",
				() => panel().getByRole("img", { name: "Moves between countries" }),
			],
			["Years", () => panel().getByRole("img", { name: "Countries in 2024" })],
			[
				"Distance",
				() =>
					panel().getByText("Total distance") &&
					panel().getByRole("img", { name: "Kilometres per year" }),
			],
		];
		for (const [name, content] of tabs) {
			await user.click(screen.getByRole("link", { name }));
			expect(content()).toBeTruthy();
		}

		await user.click(screen.getByRole("checkbox", { name: /East Asia/ }));
		await expectCountries("2");
		await user.click(screen.getByRole("link", { name: "Moves" }));
		// A single Japan → Korea move is still a chart.
		expect(
			panel().getByRole("img", { name: "Moves between countries" }),
		).toBeTruthy();

		await user.click(screen.getByRole("checkbox", { name: /Romania/ }));
		await expectCountries("3");

		await user.click(screen.getByRole("button", { name: "Show all data" }));
		await user.click(screen.getByRole("checkbox", { name: /Lost weekend/ }));
		expect(
			await screen.findByText("No photos fall inside the selected trips."),
		).toBeTruthy();
		// The tabs stay and keep the chosen tab.
		expect(
			screen.getByRole("link", { name: "Moves" }).getAttribute("aria-current"),
		).toBe("page");
	});
});
