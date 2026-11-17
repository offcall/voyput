import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	buildVizData,
	buildWorldShapes,
	COUNTRY_CENTROIDS,
	countryPalette,
	type LocationRow,
	projectEquirect,
} from "@voyput/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import worldText from "../src/features/visualize/assets/world-countries.geojson?raw";
import { GlobeChart } from "../src/features/visualize/charts/GlobeChart";
import {
	clampTilt,
	greatCircle,
	inRing,
	invert,
	project,
	ringsFromPath,
} from "../src/features/visualize/charts/globeProjection";
import { fade, makePainter } from "../src/features/visualize/themeColours";

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

describe("globe projection", () => {
	const view = { lat: 0, lon: 0 };

	it("shows the near side the right way round", () => {
		expect(project(0, 0, view, 100)).toEqual([0, -0, 1]);
		const [east] = project(0, 30, view, 100);
		const [, north] = project(30, 0, view, 100);
		expect(east).toBeGreaterThan(0);
		expect(north).toBeLessThan(0); // up on screen
		expect(project(0, 180, view, 100)[2]).toBeLessThan(0);
	});

	it("inverts screen points back to the globe", () => {
		const tilted = { lat: 35, lon: 20 };
		const [x, y] = project(48.8, 2.3, tilted, 250);
		const back = invert(x, y, tilted, 250);
		expect(back?.[0]).toBeCloseTo(48.8);
		expect(back?.[1]).toBeCloseTo(2.3);
		expect(invert(260, 0, tilted, 250)).toBeNull();
	});

	it("reads world-box paths back as rings and hit-tests them", () => {
		const corner = (lat: number, lon: number) =>
			projectEquirect(lat, lon).join(" ");
		const d = `M${corner(50, 10)}L${corner(50, 20)}L${corner(40, 20)}L${corner(40, 10)}Z`;
		const [ring] = ringsFromPath(d);
		expect(ring?.[0]?.[0]).toBeCloseTo(50);
		expect(ring?.[0]?.[1]).toBeCloseTo(10);
		expect(inRing(45, 15, ring ?? [])).toBe(true);
		expect(inRing(45, 25, ring ?? [])).toBe(false);
	});

	it("draws moves along great circles", () => {
		const [lat, lon] = greatCircle([0, 0], [0, 90], 0.5);
		expect(lat).toBeCloseTo(0);
		expect(lon).toBeCloseTo(45);
		// Between two points at 60° N the arc bends towards the pole.
		expect(greatCircle([60, -60], [60, 60], 0.5)[0]).toBeGreaterThan(60);
	});
});

describe("globe chart", () => {
	it("steps through the visited countries with the arrow keys", async () => {
		const user = userEvent.setup();
		render(<GlobeChart data={data} world={null} />);
		screen.getByRole("img", { name: "Globe" }).focus();
		await user.keyboard("{ArrowRight}");
		const tip = () => document.querySelector(".vp-chart-tip")?.textContent;
		expect(tip()).toBe("Romania2 photos");
		await user.keyboard("{ArrowRight}");
		expect(tip()).toBe("Moldova1 photo");
		await user.keyboard("{ArrowLeft}");
		expect(tip()).toBe("Romania2 photos");
		await user.keyboard("{Escape}");
		expect(tip()).toBeUndefined();
	});
});

/** Square outlines of Romania and Moldova, enough to fill and hit-test. */
const world = buildWorldShapes({
	features: [
		["Romania", 20, 43, 26.5, 47],
		["Moldova", 27, 46, 30, 48.5],
	].map(([name, w, s, e, n]) => ({
		properties: { name },
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					[w, s],
					[e, s],
					[e, n],
					[w, n],
					[w, s],
				],
			],
		},
	})),
});

interface Call {
	name: string;
	args: unknown[];
	fillStyle: unknown;
}

/** A 2D context that records every call with the fill style it was made under. */
function recordingContext() {
	const calls: Call[] = [];
	const state: Record<string | symbol, unknown> = {};
	const ctx = new Proxy(
		{},
		{
			get: (_target, key) => {
				if (key in state) return state[key];
				if (key === "createRadialGradient")
					return () => ({ addColorStop() {} });
				return (...args: unknown[]) => {
					calls.push({ name: String(key), args, fillStyle: state.fillStyle });
				};
			},
			set: (_target, key, value) => {
				state[key] = value;
				return true;
			},
		},
	);
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
		(() => ctx) as never,
	);
	const frames = new Map<number, FrameRequestCallback>();
	let id = 0;
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
		frames.set(++id, cb);
		return id;
	});
	vi.stubGlobal("cancelAnimationFrame", (handle: number) =>
		frames.delete(handle),
	);
	const frame = (count = 1) => {
		for (let i = 0; i < count; i++) {
			const pending = [...frames.values()];
			frames.clear();
			for (const cb of pending) cb(0);
		}
	};
	/** Centre x of the last photo spot drawn (spots are the small arcs). */
	const lastSpotX = () =>
		calls
			.filter((c) => c.name === "arc" && Number(c.args[2]) < 10)
			.map((c) => Number(c.args[0]))
			.at(-1);
	return { calls, frame, lastSpotX };
}

const pointer = (
	target: Element,
	type: string,
	x: number,
	y: number,
	pointerType = "mouse",
) => {
	const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
	Object.defineProperty(event, "pointerType", { value: pointerType });
	Object.defineProperty(event, "pointerId", { value: 1 });
	act(() => {
		target.dispatchEvent(event);
	});
};

/** Canvas pixel of a place for a globe centred on `centre` (640 px canvas, radius 250). */
const at = (lat: number, lon: number, centre: readonly [number, number]) => {
	const [x, y] = project(
		lat,
		lon,
		{ lat: clampTilt(centre[0]), lon: centre[1] },
		250,
	);
	return [320 + x, 320 + y] as const;
};

describe("globe with outlines", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("fills visited countries in their colours and names what is hovered", async () => {
		const { calls, frame } = recordingContext();
		const user = userEvent.setup();
		render(<GlobeChart data={data} world={world} />);
		frame();
		const palette = countryPalette([]);
		const paint = makePainter(document.body);
		const fills = new Set(
			calls.filter((c) => c.name === "fill").map((c) => c.fillStyle),
		);
		expect(fills).toContain(fade(paint(palette("RO")), 0.85));
		expect(fills).toContain(fade(paint(palette("MD")), 0.85));

		// Turn to Romania by keyboard, then let go and hover with the mouse.
		await user.click(screen.getByRole("button", { name: "Pause" }));
		const canvas = screen.getByRole("img", { name: "Globe" });
		canvas.focus();
		await user.keyboard("{ArrowRight}");
		frame(150);
		await user.keyboard("{Escape}");
		const ro = COUNTRY_CENTROIDS.RO;
		expect(ro).toBeDefined();
		if (!ro) return;
		const tip = () => document.querySelector(".vp-chart-tip")?.textContent;
		pointer(canvas, "pointerenter", 0, 0);
		pointer(canvas, "pointermove", ...at(44, 21, ro));
		expect(tip()).toBe("Romania2 photos");
		pointer(canvas, "pointermove", ...at(47.0, 28.8, ro));
		expect(tip()).toMatch(/^Moldova1 photo$/);
		pointer(canvas, "pointermove", ...at(10, -40, ro));
		expect(tip()).toBeUndefined();
	});

	it("names a tapped country until the next tap", async () => {
		const { frame } = recordingContext();
		const user = userEvent.setup();
		render(<GlobeChart data={data} world={world} />);
		await user.click(screen.getByRole("button", { name: "Pause" }));
		const canvas = screen.getByRole("img", { name: "Globe" });
		canvas.setPointerCapture = () => {};
		canvas.focus();
		await user.keyboard("{ArrowRight}");
		frame(150);
		await user.keyboard("{Escape}");
		const ro = COUNTRY_CENTROIDS.RO;
		if (!ro) throw new Error("no centroid for RO");
		const tip = () => document.querySelector(".vp-chart-tip")?.textContent;
		const tap = (x: number, y: number) => {
			pointer(canvas, "pointerdown", x, y, "touch");
			pointer(canvas, "pointerup", x, y, "touch");
			pointer(canvas, "pointerleave", x, y, "touch");
		};
		tap(...at(44, 21, ro));
		expect(tip()).toBe("Romania2 photos");
		tap(...at(10, -40, ro));
		expect(tip()).toBeUndefined();
	});

	it("holds a rotating globe still under a tapped tip until a tap elsewhere", async () => {
		const { frame, lastSpotX } = recordingContext();
		const user = userEvent.setup();
		render(<GlobeChart data={data} world={world} />);
		// Rotation is on (no Pause click).
		expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
		const canvas = screen.getByRole("img", { name: "Globe" });
		canvas.setPointerCapture = () => {};
		canvas.focus();
		await user.keyboard("{ArrowRight}");
		frame(150);
		await user.keyboard("{Escape}");
		const ro = COUNTRY_CENTROIDS.RO;
		if (!ro) throw new Error("no centroid for RO");
		const tip = () => document.querySelector(".vp-chart-tip")?.textContent;

		const [x, y] = at(44, 21, ro);
		pointer(canvas, "pointerenter", x, y, "touch");
		pointer(canvas, "pointerdown", x, y, "touch");
		pointer(canvas, "pointerup", x, y, "touch");
		pointer(canvas, "pointerleave", x, y, "touch");
		expect(tip()).toBe("Romania2 photos");
		frame();
		const held = lastSpotX();
		frame(20);
		expect(lastSpotX()).toBe(held);
		expect(tip()).toBe("Romania2 photos");

		// A tap off the globe closes the tip and the globe turns again.
		pointer(document.body, "pointerdown", 5, 5, "touch");
		expect(tip()).toBeUndefined();
		frame(20);
		expect(lastSpotX()).not.toBe(held);
	});

	it("turns with a drag and keeps turning a little after letting go", async () => {
		const { frame, lastSpotX } = recordingContext();
		const user = userEvent.setup();
		render(<GlobeChart data={data} world={world} />);
		await user.click(screen.getByRole("button", { name: "Pause" }));
		frame();
		const canvas = screen.getByRole("img", { name: "Globe" });
		canvas.setPointerCapture = () => {};
		const before = lastSpotX();
		expect(before).toBeTypeOf("number");
		if (before === undefined) return;

		pointer(canvas, "pointerdown", 320, 320);
		pointer(canvas, "pointermove", 340, 320);
		pointer(canvas, "pointerup", 340, 320);
		frame();
		const dragged = lastSpotX() ?? 0;
		// Dragging right brings the spots along to the right.
		expect(dragged).toBeGreaterThan(before);
		frame(5);
		const coasting = lastSpotX() ?? 0;
		expect(coasting).toBeGreaterThan(dragged);
		// Friction stops it, and the paused globe then stays put.
		frame(300);
		const stopped = lastSpotX();
		frame(10);
		expect(lastSpotX()).toBe(stopped);
	});

	it("reads the country picked by keyboard out loud", async () => {
		recordingContext();
		const user = userEvent.setup();
		render(<GlobeChart data={data} world={world} />);
		screen.getByRole("img", { name: "Globe" }).focus();
		await user.keyboard("{ArrowRight}");
		const live = document.querySelector("[aria-live=polite]");
		expect(live?.textContent).toBe("Romania: 2 photos");
		await user.keyboard("{Escape}");
		expect(live?.textContent).toBe("");
	});

	it("outlines, fills and steps to countries far from the old exports", async () => {
		const { calls, frame } = recordingContext();
		const user = userEvent.setup();
		const sample = [
			["PE", "Peru"],
			["KE", "Kenya"],
			["NZ", "New Zealand"],
			["IS", "Iceland"],
			["MN", "Mongolia"],
			["FJ", "Fiji"],
			["XK", "Kosovo"],
			["MV", "Maldives"],
		] as const;
		// Spots 5° south of each centroid, so hovering the centroid hits the outline.
		const farData = buildVizData([
			sample.map(([code, name]) => {
				const [lat, lon] = COUNTRY_CENTROIDS[code] ?? [0, 0];
				return photo(code, name, lat - 5, lon);
			}),
		]);
		const realWorld = buildWorldShapes(JSON.parse(worldText));
		render(<GlobeChart data={farData} world={realWorld} />);
		await user.click(screen.getByRole("button", { name: "Pause" }));
		const canvas = screen.getByRole("img", { name: "Globe" });
		canvas.focus();
		const tip = () => document.querySelector(".vp-chart-tip")?.textContent;
		const palette = countryPalette([]);
		const paint = makePainter(document.body);
		const seen: string[] = [];
		for (let i = 0; i < sample.length; i++) {
			// Escape lets go, so the next → starts again from the first country.
			await user.keyboard("{Escape}");
			for (let k = 0; k <= i; k++) await user.keyboard("{ArrowRight}");
			const name = tip()?.replace(/1 photo$/, "") ?? "";
			const [code] = sample.find(([, n]) => n === name) ?? [];
			if (!code) throw new Error(`unexpected tip ${tip()}`);
			seen.push(code);
			calls.length = 0;
			frame(150);
			await user.keyboard("{Escape}");
			if (code === "MV") continue; // no outline at 110m: spot and arcs only
			expect(
				calls
					.filter((call) => call.name === "fill")
					.map((call) => call.fillStyle),
				code,
			).toContain(fade(paint(palette(code)), 0.85));
			const c = COUNTRY_CENTROIDS[code];
			if (!c) throw new Error(`no centroid for ${code}`);
			pointer(canvas, "pointermove", ...at(c[0], c[1], c));
			expect(tip(), code).toBe(`${name}1 photo`);
			pointer(canvas, "pointerleave", 0, 0);
			canvas.focus();
		}
		expect(seen.sort()).toEqual(sample.map(([code]) => code).sort());
		// Real world geometry: ~4 s alone, slower under a full parallel run.
	}, 30_000);
});
