import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildVizData, type LocationRow, projectEquirect } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { GlobeChart } from "../src/features/visualize/charts/GlobeChart";
import {
	greatCircle,
	inRing,
	invert,
	project,
	ringsFromPath,
} from "../src/features/visualize/charts/globeProjection";

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
