import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	buildVizData,
	type LocationRow,
	projectEquirect,
	WORLD_HEIGHT,
	WORLD_WIDTH,
} from "@voyput/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeatmapChart } from "../src/features/visualize/charts/HeatmapChart";
import {
	binView,
	breakLabels,
	CELL_PX,
	clampView,
	classOf,
	niceBreaks,
	panBy,
	rampSlot,
	toWorldXY,
	viewForBox,
	zoomAt,
} from "../src/features/visualize/charts/heatmapView";

let n = 0;
const photo = (
	countryCode: string,
	country: string,
	lat: number,
	lon: number,
): LocationRow => ({
	date: "2024-03-02T12:00:00+02:00",
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

const data = buildVizData([
	[
		photo("RO", "Romania", 44.4, 26.1),
		photo("RO", "Romania", 45.6, 25.6),
		photo("MD", "Moldova", 47.0, 28.8),
	],
]);

describe("heatmap view", () => {
	const W = 800;
	const H = 400;

	it("breaks counts into readable log classes", () => {
		expect(niceBreaks(1)).toEqual([1]);
		expect(niceBreaks(1000)).toEqual([1, 3, 10, 30, 100, 300]);
		expect(breakLabels([1, 3, 10])).toEqual(["1", "3", "10+"]);
		expect(classOf(0, [1, 3, 10])).toBe(-1);
		expect(classOf(2, [1, 3, 10])).toBe(0);
		expect(classOf(10, [1, 3, 10])).toBe(2);
		// Few classes still run from the first to the last colour.
		expect([0, 1, 2].map((i) => rampSlot(i, 3, 6))).toEqual([0, 3, 5]);
		expect(rampSlot(0, 1, 6)).toBe(5);
	});

	it("zooms around the pointer and stays inside the world", () => {
		const whole = viewForBox([0, 0, WORLD_WIDTH, WORLD_HEIGHT], W, H);
		expect(whole).toEqual({ cx: 500, cy: 250, k: 1.25 });
		// Cannot zoom out past the whole world or pan off it.
		expect(zoomAt(whole, 0.5, 0, 0, W, H)).toEqual(whole);
		expect(panBy(whole, 300, 0, W, H)).toEqual(whole);

		const zoomed = zoomAt(whole, 4, 200, 100, W, H);
		const under = (v: typeof whole, px: number, py: number) => [
			v.cx + (px - W / 2) * v.k,
			v.cy + (py - H / 2) * v.k,
		];
		expect(zoomed.k).toBeCloseTo(1.25 / 4);
		expect(under(zoomed, 200, 100)[0]).toBeCloseTo(
			under(whole, 200, 100)[0] ?? 0,
		);
		expect(under(zoomed, 200, 100)[1]).toBeCloseTo(
			under(whole, 200, 100)[1] ?? 0,
		);
		// Deepest zoom is capped.
		expect(clampView({ cx: 500, cy: 250, k: 0.0001 }, W, H).k).toBeCloseTo(
			12 / H,
		);
	});

	it("counts photos per screen square of the view", () => {
		const xy = toWorldXY(Float32Array.from([0, 0, 0, 0.01, 50, 30]));
		const view = viewForBox([0, 0, WORLD_WIDTH, WORLD_HEIGHT], W, H);
		const grid = binView(xy, view, W, H);
		expect(grid.cols).toBe(W / CELL_PX);
		expect(grid.max).toBe(2);
		expect([...grid.counts].reduce((a, b) => a + b, 0)).toBe(3);
		// Zoomed onto (0, 0): the point at 50° N is outside and skipped.
		const [x, y] = projectEquirect(0, 0);
		const close = clampView({ cx: x, cy: y, k: 0.05 }, W, H);
		expect(binView(xy, close, W, H).counts.reduce((a, b) => a + b, 0)).toBe(2);
	});
});

describe("heatmap chart", () => {
	it("zooms with the buttons and fits back to the photos", async () => {
		const user = userEvent.setup();
		render(<HeatmapChart data={data} world={null} />);
		const fit = screen.getByRole<HTMLButtonElement>("button", {
			name: "Fit to photos",
		});
		expect(fit.disabled).toBe(true);
		await user.click(screen.getByRole("button", { name: "Zoom in" }));
		expect(fit.disabled).toBe(false);
		await user.click(fit);
		expect(fit.disabled).toBe(true);
		// Keys do the same on the focused map.
		screen.getByRole("img", { name: "Photo heatmap" }).focus();
		await user.keyboard("+");
		expect(fit.disabled).toBe(false);
		await user.keyboard("0");
		expect(fit.disabled).toBe(true);
	});

	it("shows a legend of photos per square", () => {
		render(<HeatmapChart data={data} world={null} />);
		expect(screen.getByText("Photos per square")).toBeTruthy();
		expect(screen.getByText("1")).toBeTruthy();
	});

	it("binds zoom and resize again when the map comes back after an empty filter", () => {
		const observed: Element[] = [];
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe(target: Element) {
					observed.push(target);
				}
				disconnect() {}
			},
		);
		const { rerender } = render(<HeatmapChart data={data} world={null} />);
		rerender(<HeatmapChart data={buildVizData([[]])} world={null} />);
		expect(screen.getByText("No data.")).toBeTruthy();
		rerender(<HeatmapChart data={data} world={null} />);

		const map = document.querySelector(".vp-heat-map");
		expect(observed.at(-1)).toBe(map);
		const fit = screen.getByRole<HTMLButtonElement>("button", {
			name: "Fit to photos",
		});
		expect(fit.disabled).toBe(true);
		fireEvent.wheel(screen.getByRole("img", { name: "Photo heatmap" }), {
			deltaY: -200,
		});
		expect(fit.disabled).toBe(false);
	});

	it("reads the busiest square out when the map gets focus", () => {
		render(<HeatmapChart data={data} world={null} />);
		const live = document.querySelector("[aria-live=polite]");
		expect(live?.textContent).toBe("");
		fireEvent.focus(screen.getByRole("img", { name: "Photo heatmap" }));
		expect(live?.textContent).toMatch(/^Busiest square: Moldova, 1 photo$/);
		fireEvent.blur(screen.getByRole("img", { name: "Photo heatmap" }));
		expect(live?.textContent).toBe("");
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});
