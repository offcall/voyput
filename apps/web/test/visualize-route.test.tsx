import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { LocationRow } from "@voyput/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoyputDb } from "../src/db/db";
import { seedTrips, type TestStop, type TestTrip } from "./fixtures/stays";
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

const stop = (day: string, countryCode: string, country: string): TestStop => ({
	id: `${day}-${countryCode}`,
	day,
	countryCode,
	country,
	cities: [],
	kind: "stay",
});

const trip = (
	id: string,
	start: string,
	end: string,
	stops: TestStop[],
): TestTrip => ({
	id,
	title: id,
	start,
	end,
	confirmed: true,
	arrival: { date: start, source: "manual", method: "plane" },
	departure: { date: end, source: "manual", method: "plane" },
	stops,
	stampIds: [],
});

/** Home in Moldova, a trip to Romania, then one to Japan and South Korea. */
async function seed(name: string): Promise<VoyputDb> {
	const db = new VoyputDb(name);
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
			trip("romania", "2024-03-01", "2024-03-05", [
				stop("2024-03-02", "RO", "Romania"),
				stop("2024-03-03", "RO", "Romania"),
			]),
			trip("east-asia", "2024-06-09", "2024-06-13", [
				stop("2024-06-10", "JP", "Japan"),
				stop("2024-06-11", "JP", "Japan"),
				stop("2024-06-12", "KR", "South Korea"),
			]),
		],
		"MD",
	);
	return db;
}

// Animation frames run only when the test calls `frame`.
let queue: FrameRequestCallback[] = [];
let now = 0;
const frame = (ms: number) =>
	act(() => {
		now += ms;
		const due = queue;
		queue = [];
		for (const callback of due) callback(now);
	});

beforeEach(() => {
	queue = [];
	now = 1000;
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
		queue.push(cb);
		return queue.length;
	});
	vi.stubGlobal("cancelAnimationFrame", () => {
		queue = [];
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const bubbles = () =>
	[...document.querySelectorAll("[data-country]")].map((g) =>
		g.getAttribute("data-country"),
	);
const slider = () =>
	screen.getByRole<HTMLInputElement>("slider", {
		name: "Position on the route",
	});
const position = () => Number(slider().value);
const dotX = () =>
	Number(screen.getByTestId("route-dot").getAttribute("data-x"));
const stat = (label: string) =>
	screen.queryByText(label, { selector: ".vp-stat-label" })?.nextElementSibling
		?.textContent;

async function openRoute(name: string) {
	renderApp("/visualize/route", { db: await seed(name) });
	await screen.findByRole("img", { name: "Route player map" });
}

/** Waits until the playback loop has asked for its first frame. */
const loopStarted = () =>
	waitFor(() => expect(queue.length).toBeGreaterThan(0));

describe("route player", () => {
	it("plays the dot along the route and reveals bubbles in visit order", async () => {
		await openRoute("route-play");
		expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
		expect(bubbles()).toEqual(["RO"]);
		fireEvent.click(screen.getByRole("button", { name: "8×" }));

		const x0 = dotX();
		await loopStarted();
		await frame(0);
		await frame(100);
		expect(dotX()).not.toBe(x0);

		const seen: string[] = [];
		for (let i = 0; i < 400 && queue.length > 0; i++) {
			await frame(100);
			const last = bubbles().at(-1);
			if (last && seen.at(-1) !== last) seen.push(last);
		}
		expect(seen).toEqual(["RO", "MD", "JP", "KR"]);
		expect(bubbles()).toEqual(["RO", "MD", "JP", "KR"]);
		// Trips & photos: RO ×2 photo stops, home, JP ×2, KR.
		expect(stat("Legs")).toBe("5 / 5");
		expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
	});

	it("stops advancing on pause", async () => {
		await openRoute("route-pause");
		await loopStarted();
		await frame(0);
		await frame(100);
		fireEvent.click(screen.getByRole("button", { name: "Pause" }));
		const paused = position();
		await frame(100);
		await frame(100);
		expect(position()).toBe(paused);
		expect(queue).toHaveLength(0);
	});

	it("shows every bubble after scrubbing to the end", async () => {
		await openRoute("route-scrub");
		fireEvent.change(slider(), { target: { value: slider().max } });
		expect(bubbles()).toEqual(["RO", "MD", "JP", "KR"]);
		expect(stat("Countries")).toBe("4 / 4");
		expect(screen.getByText("South Korea")).toBeTruthy();
	});

	it("moves further per frame at a higher speed", async () => {
		await openRoute("route-speed");
		await loopStarted();
		await frame(0);
		let before = position();
		await frame(50);
		const slow = position() - before;
		expect(slow).toBeGreaterThan(0);

		fireEvent.click(screen.getByRole("button", { name: "4×" }));
		await loopStarted();
		await frame(0);
		before = position();
		await frame(50);
		expect(position() - before).toBeCloseTo(slow * 4, 6);
	});

	it("routes through photo clusters in the exact mode", async () => {
		await openRoute("route-photos");
		fireEvent.click(screen.getByRole("button", { name: "By countries" }));
		expect(stat("Legs")).toBe("0 / 3");
		fireEvent.click(screen.getByRole("button", { name: "Exact by photos" }));
		expect(await screen.findByText(/6 stops from 6 photos/)).toBeTruthy();
		expect(stat("Legs")).toBe("0 / 5");
		fireEvent.change(slider(), { target: { value: "5" } });
		expect(bubbles()).toEqual(["MD", "RO", "JP", "KR"]);
	});

	it("does not autoplay under reduced motion", async () => {
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: query.includes("reduced-motion"),
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
		await openRoute("route-reduced");
		expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
		expect(queue).toHaveLength(0);
	});

	it("jumps between trips and captions trip, country and date", async () => {
		await openRoute("route-trips");
		const caption = () =>
			document.querySelector(".vp-route-stop")?.textContent ?? "";
		const date = () => document.querySelector(".vp-route-date")?.textContent;
		fireEvent.click(screen.getByRole("button", { name: "Pause" }));
		expect(caption()).toContain("Trip 1/2 · Romania");
		expect(caption()).toContain("Romania");
		expect(date()).toBe("2 Mar 2024");
		expect(
			screen.getByRole<HTMLButtonElement>("button", { name: "Previous trip" })
				.disabled,
		).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: "Next trip" }));
		expect(position()).toBe(3);
		expect(caption()).toContain("Trip 2/2 · Japan → South Korea");
		expect(caption()).toContain("Japan");
		expect(date()).toBe("10 Jun 2024");
		// Jumping keeps the player paused.
		expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();

		fireEvent.change(slider(), { target: { value: "2" } });
		expect(caption()).toContain("At home");
		fireEvent.click(screen.getByRole("button", { name: "Previous trip" }));
		expect(position()).toBe(0);
	});

	it("keeps playing after a trip jump and pauses when the page is hidden", async () => {
		await openRoute("route-hidden");
		fireEvent.click(screen.getByRole("button", { name: "Next trip" }));
		expect(position()).toBe(3);
		expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

		const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		hidden.mockRestore();
		expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
	});

	it("points to Trips when there are locations but no stays", async () => {
		const db = new VoyputDb("route-empty");
		await db.locations.bulkPut([
			photo("2024-01-05", "MD", "Moldova", 47.0, 28.8),
		]);
		renderApp("/visualize/route", { db });
		expect(await screen.findByText("No trips yet")).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "Build trips" }).getAttribute("href"),
		).toBe("/collect/trips");
	});
});
