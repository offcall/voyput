import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildVizData, type LocationRow } from "@voyput/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DonutChart } from "../src/features/visualize/charts/DonutChart";
import { GlobeChart } from "../src/features/visualize/charts/GlobeChart";
import { MapChart } from "../src/features/visualize/charts/MapChart";
import { MovementsTable } from "../src/features/visualize/charts/MovementsTable";

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

const data = buildVizData([
	[
		photo("2024-01-05", "MD", "Moldova", 47.0, 28.8),
		photo("2024-03-02", "RO", "Romania", 44.4, 26.1),
		photo("2024-03-03", "RO", "Romania", 45.6, 25.6),
		photo("2024-06-10", "JP", "Japan", 35.7, 139.7),
	],
]);

/** Text of the one pixel tip on screen, or `null` when none is shown. */
const tipText = () => {
	const tips = document.querySelectorAll(".vp-chart-tip");
	expect(tips.length).toBeLessThanOrEqual(1);
	return tips[0]?.textContent ?? null;
};

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.documentElement.removeAttribute("data-theme");
});

describe("visualize chart tips", () => {
	it("shows the map tip on hover and walks the marks by keyboard", async () => {
		const user = userEvent.setup();
		render(<MapChart data={data} world={null} />);
		expect(tipText()).toBeNull();

		// Without world shapes the spots carry the country tips.
		const romania = screen.getByRole("img", { name: "Romania: 2 photos" });
		await user.hover(romania);
		expect(tipText()).toBe("Romania2 photos");
		await user.unhover(romania);
		expect(tipText()).toBeNull();

		// The chart is one tab stop; arrows move between its marks.
		await user.tab();
		const first = screen.getByRole("img", {
			name: "Moldova → Romania: MD → RO",
		});
		expect(document.activeElement).toBe(first);
		expect(tipText()).toBe("Moldova → RomaniaMD → RO");
		await user.keyboard("{ArrowRight}");
		expect(tipText()).toBe("Romania → JapanRO → JP");
		await user.keyboard("{End}");
		expect(tipText()).toBe("Japan1 photos");
		await user.tab();
		expect(tipText()).toBeNull();
	});

	it("shows the donut tip on focus and on hover", async () => {
		const user = userEvent.setup();
		render(<DonutChart data={data} />);
		const ring = screen.getByRole("group", { name: "Countries in 2024" });
		expect(ring).toBeTruthy();

		await user.tab();
		expect(tipText()).toBe("Romania · 20242 · 50%");
		await user.keyboard("{ArrowDown}");
		expect(tipText()).toBe("Moldova · 20241 · 25%");

		await user.hover(
			screen.getByRole("img", { name: "Japan · 2024: 1 · 25%" }),
		);
		expect(tipText()).toBe("Japan · 20241 · 25%");
	});

	it("shows the periods as country chips, not emoji flags", async () => {
		const user = userEvent.setup();
		render(<MovementsTable data={data} />);
		const strip = screen.getByRole("list", { name: "Sequence of countries" });
		expect(strip.textContent).toBe("MDROJP");
		expect(document.body.textContent).not.toMatch(/\p{Regional_Indicator}/u);

		await user.hover(
			screen.getByRole("img", {
				name: "Romania · 2024-03-02 – 2024-03-03: 2 photos",
			}),
		);
		expect(tipText()).toBe("Romania · 2024-03-02 – 2024-03-032 photos");
	});
});

describe("globe", () => {
	it("keeps its angle across a theme change", async () => {
		// A fake canvas that records the arcs drawn; the last is the photo spot.
		const arcs: number[][] = [];
		const fake: object = new Proxy(
			{},
			{
				get: (_target, key) =>
					key === "arc" ? (...args: number[]) => arcs.push(args) : () => fake,
				set: () => true,
			},
		);
		const getContext = vi
			.spyOn(HTMLCanvasElement.prototype, "getContext")
			.mockImplementation((() => fake) as never);
		const frames = new Map<number, FrameRequestCallback>();
		let id = 0;
		vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
			frames.set(++id, cb);
			return id;
		});
		vi.stubGlobal("cancelAnimationFrame", (handle: number) =>
			frames.delete(handle),
		);
		const frame = () => {
			const pending = [...frames.values()];
			frames.clear();
			for (const cb of pending) cb(0);
			return arcs[arcs.length - 1]?.[0];
		};

		const user = userEvent.setup();
		const one = buildVizData([
			// Near longitude 0: on the front of the globe at its first angle.
			[photo("2024-06-10", "FR", "France", 46.2, 2.2)],
		]);
		render(<GlobeChart data={one} world={null} />);
		const start = frame();
		for (let i = 0; i < 50; i++) frame();
		await user.click(screen.getByRole("button", { name: "Pause" }));
		const turned = frame();
		expect(turned).not.toBe(start);

		const draws = getContext.mock.calls.length;
		act(() => document.documentElement.setAttribute("data-theme", "light"));
		// The draw effect restarts with the new colours …
		await waitFor(() => expect(getContext.mock.calls.length).toBe(draws + 1));
		// … and the paused globe stays where it was.
		expect(frame()).toBe(turned);
	});
});
