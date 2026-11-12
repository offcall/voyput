import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LocationRow, Trip } from "@voyput/core";
import { describe, expect, it } from "vitest";
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

describe("visualize", () => {
	it("points to Import when there are no locations", async () => {
		renderApp("/visualize");
		expect(await screen.findByText("No locations yet")).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "Import the location CSV" }),
		).toBeTruthy();
	});

	it("shows the chart tabs and narrows them to the selected trips", async () => {
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
		]);
		renderApp("/visualize", { db });

		expect(await screen.findByText(/^4 countries/)).toBeTruthy();
		for (const tab of [
			"Route map",
			"Heatmap",
			"Globe",
			"Year × country",
			"Calendar",
			"Moves",
			"Years",
			"Distance",
		]) {
			expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
		}
		expect(screen.getByRole("img", { name: "Route map" })).toBeTruthy();

		// Canvas charts draw nothing in jsdom but must not crash.
		await user.click(screen.getByRole("tab", { name: "Globe" }));
		expect(await screen.findByRole("img", { name: "Globe" })).toBeTruthy();
		await user.click(screen.getByRole("tab", { name: "Heatmap" }));
		expect(
			await screen.findByRole("img", { name: "Photo heatmap" }),
		).toBeTruthy();

		await user.click(screen.getByRole("checkbox", { name: /East Asia/ }));
		expect(await screen.findByText(/^2 countries/)).toBeTruthy();

		await user.click(screen.getByRole("checkbox", { name: /Romania/ }));
		expect(await screen.findByText(/^3 countries/)).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Show all data" }));
		expect(await screen.findByText(/^4 countries/)).toBeTruthy();
	});
});
