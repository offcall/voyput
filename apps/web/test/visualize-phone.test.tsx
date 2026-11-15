import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { LocationRow } from "@voyput/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoyputDb } from "../src/db/db";
import { PHONE_QUERY } from "../src/features/visualize/usePhone";
import { seedTrips, type TestTrip } from "./fixtures/stays";
import { renderApp } from "./renderApp";

// jsdom has no layout: the phone layout is chosen through `matchMedia`.
function phoneScreen() {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: query === PHONE_QUERY,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	}));
}

let n = 0;
const photo = (day: string, lat: number, lon: number): LocationRow => ({
	date: `${day}T12:00:00+02:00`,
	lat,
	lon,
	countryCode: "RO",
	country: "Romania",
	city: "",
	source: "apple",
	isVideo: false,
	filename: `IMG_${++n}.jpg`,
	uuid: `photo-${n}`,
});

const romania: TestTrip = {
	id: "romania",
	title: "romania",
	start: "2024-03-01",
	end: "2024-03-05",
	confirmed: true,
	arrival: { date: "2024-03-01", source: "manual", method: "plane" },
	departure: { date: "2024-03-05", source: "manual", method: "plane" },
	stops: [
		{
			id: "s1",
			day: "2024-03-02",
			countryCode: "RO",
			country: "Romania",
			cities: [],
			kind: "stay",
		},
	],
	stampIds: [],
};

async function seed(name: string): Promise<VoyputDb> {
	const db = new VoyputDb(name);
	await db.locations.bulkPut([
		photo("2024-01-05", 47.0, 28.8),
		photo("2024-03-02", 44.4, 26.1),
		photo("2024-03-03", 45.6, 25.6),
	]);
	await seedTrips(db, [romania], "MD");
	return db;
}

beforeEach(() => {
	phoneScreen();
	// The route player animates; frames only run when a test asks.
	vi.stubGlobal("requestAnimationFrame", () => 0);
	vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Insights on a phone", () => {
	it("opens the filter as a bottom sheet and closes it with Done or Escape", async () => {
		renderApp("/insights/stats", { db: await seed("phone-filter") });
		const button = await screen.findByRole("button", { name: /^Filter/ });
		fireEvent.click(button);
		const sheet = screen.getByRole("dialog", { name: "Filter" });
		expect(sheet.getAttribute("aria-modal")).toBe("true");
		expect(document.activeElement).toBe(sheet);
		expect(document.body.style.overflow).toBe("hidden");
		expect(screen.getByRole("region", { name: "Filters" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Done" }));
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(document.body.style.overflow).toBe("");
		expect(document.activeElement).toBe(button);

		fireEvent.click(button);
		expect(screen.getByRole("dialog", { name: "Filter" })).toBeTruthy();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("puts the journey controls under the map, the speed as one button", async () => {
		renderApp("/insights/journey", { db: await seed("phone-journey") });
		const map = await screen.findByRole("img", { name: "Route player map" });
		// The stop label is below the map, not drawn over it.
		const label = document.querySelector(".vp-route-stop");
		expect(label).toBeTruthy();
		expect(map.parentElement?.contains(label)).toBe(false);

		expect(screen.getByRole("button", { name: "Restart" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Next stay" })).toBeTruthy();
		expect(screen.queryByRole("group", { name: "Speed" })).toBeNull();
		const speed = screen.getByRole("button", { name: /^Speed 1×/ });
		await act(async () => fireEvent.click(speed));
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /^Speed 4×/ })).toBeTruthy(),
		);
	});
});
