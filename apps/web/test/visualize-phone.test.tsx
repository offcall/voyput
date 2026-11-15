import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { buildVizData, type LocationRow } from "@voyput/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoyputDb } from "../src/db/db";
import { MapChart } from "../src/features/visualize/charts/MapChart";
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

/** The map's drawn box as numbers. */
const viewBox = (svg: Element) =>
	(svg.getAttribute("viewBox") ?? "").split(" ").map(Number) as [
		number,
		number,
		number,
		number,
	];

/** Every map is laid out as `box` CSS pixels at the page's top left. */
let box = { width: 400, height: 200 };
const observed: { el: Element; cb: ResizeObserverCallback }[] = [];
class FakeResizeObserver {
	constructor(private cb: ResizeObserverCallback) {}
	observe(el: Element) {
		observed.push({ el, cb: this.cb });
	}
	disconnect() {
		for (let i = observed.length - 1; i >= 0; i--)
			if (observed[i]?.cb === this.cb) observed.splice(i, 1);
	}
	unobserve() {}
}
/** Lays the observed maps out again at `box`. */
const resize = () =>
	act(() => {
		for (const { cb } of [...observed])
			cb([], new FakeResizeObserver(cb) as unknown as ResizeObserver);
	});

function layout() {
	box = { width: 400, height: 200 };
	observed.length = 0;
	vi.stubGlobal("ResizeObserver", FakeResizeObserver);
	vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockImplementation(
		() =>
			({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				width: box.width,
				height: box.height,
				right: box.width,
				bottom: box.height,
				toJSON: () => ({}),
			}) as DOMRect,
	);
}

/** One pointer event on `target`, as a finger (or mouse) at client `(x, y)`. */
function touch(
	target: Element,
	type: string,
	id: number,
	x: number,
	y: number,
	pointerType = "touch",
) {
	const event = new PointerEvent(type, {
		pointerId: id,
		pointerType,
		clientX: x,
		clientY: y,
		bubbles: true,
		cancelable: true,
	});
	act(() => {
		target.dispatchEvent(event);
	});
	return event;
}

/** The viewBox is printed to one decimal; values read back from it match to 0.2. */
const near = (actual: number, expected: number) =>
	expect(Math.abs(actual - expected)).toBeLessThan(0.2);

/**
 * The gestures both maps share (`usePanZoom`): pan, pinch, a lifted pinch
 * finger, a cancelled touch, a new gesture after them, and touches elsewhere.
 */
function checkGestures(svg: Element) {
	svg.setPointerCapture = vi.fn();
	const start = viewBox(svg);
	const scale = start[2] / box.width;

	// One finger: the map follows it.
	touch(svg, "pointerdown", 1, 100, 100);
	touch(svg, "pointermove", 1, 140, 120);
	const panned = viewBox(svg);
	near(panned[0], start[0] - 40 * scale);
	near(panned[1], start[1] - 20 * scale);
	near(panned[2], start[2]);

	// A second finger spreading from 200 px to 300 px apart zooms in by 1.5.
	touch(svg, "pointerdown", 2, 340, 120);
	touch(svg, "pointermove", 2, 440, 120);
	const pinched = viewBox(svg);
	near(pinched[2], (panned[2] * 2) / 3);
	near(pinched[3], (panned[3] * 2) / 3);

	// Lift one finger: the other keeps panning from where it is, no jump.
	touch(svg, "pointerup", 2, 440, 120);
	touch(svg, "pointermove", 1, 150, 120);
	const after = viewBox(svg);
	near(after[0], pinched[0] - 10 * (pinched[2] / box.width));
	near(after[2], pinched[2]);
	touch(svg, "pointerup", 1, 150, 120);

	// A cancelled touch (the browser took it) moves nothing afterwards.
	touch(svg, "pointerdown", 3, 100, 100);
	touch(svg, "pointercancel", 3, 100, 100);
	touch(svg, "pointermove", 3, 300, 300);
	expect(viewBox(svg)).toEqual(after);

	// A new gesture after all that starts clean.
	touch(svg, "pointerdown", 4, 200, 100);
	touch(svg, "pointermove", 4, 180, 100);
	const fresh = viewBox(svg);
	near(fresh[0], after[0] + 20 * (after[2] / box.width));
	touch(svg, "pointerup", 4, 180, 100);

	// A touch on the page outside the map is not captured or cancelled.
	(svg.setPointerCapture as ReturnType<typeof vi.fn>).mockClear();
	const down = touch(document.body, "pointerdown", 5, 20, 600);
	const move = touch(document.body, "pointermove", 5, 20, 400);
	expect(down.defaultPrevented).toBe(false);
	expect(move.defaultPrevented).toBe(false);
	expect(svg.setPointerCapture).not.toHaveBeenCalled();
	expect(viewBox(svg)).toEqual(fresh);
}

const flatData = buildVizData([
	[
		photo("2024-01-05", 47.0, 28.8),
		{
			...photo("2024-03-02", 44.4, 26.1),
			countryCode: "MD",
			country: "Moldova",
		},
	],
]);

describe("map gestures", () => {
	beforeEach(layout);
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("pans and pinches the flat map by touch", () => {
		render(<MapChart data={flatData} world={null} />);
		const svg = screen.getByRole("group", { name: "Route map" });
		resize();
		checkGestures(svg);
		// The mouse leaves the flat map alone.
		const before = viewBox(svg);
		touch(svg, "pointerdown", 9, 100, 100, "mouse");
		touch(svg, "pointermove", 9, 200, 100, "mouse");
		expect(viewBox(svg)).toEqual(before);
	});

	it("pans and pinches the journey map", async () => {
		renderApp("/insights/journey", { db: await seed("phone-gestures") });
		const svg = await screen.findByRole("img", { name: "Route player map" });
		resize();
		checkGestures(svg);
	});

	it("measures and moves a map drawn again after an empty filter", () => {
		const { rerender } = render(<MapChart data={flatData} world={null} />);
		const first = screen.getByRole("group", { name: "Route map" });
		expect(observed.map((o) => o.el)).toContain(first);

		rerender(<MapChart data={buildVizData([[]])} world={null} />);
		expect(screen.queryByRole("group", { name: "Route map" })).toBeNull();
		rerender(<MapChart data={flatData} world={null} />);
		const second = screen.getByRole("group", { name: "Route map" });
		expect(second).not.toBe(first);
		// Identity, not `toEqual`: the old and new <svg> look alike.
		expect(observed).toHaveLength(1);
		expect(observed[0]?.el).toBe(second);

		// A square box: the new map is measured and fitted to it.
		box = { width: 300, height: 300 };
		resize();
		const [, , w, h] = viewBox(second);
		expect(w / h).toBeCloseTo(1, 2);
		checkGestures(second);
	});
});
