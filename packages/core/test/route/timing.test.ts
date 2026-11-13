import { describe, expect, it } from "vitest";
import {
	ARC_MAX_BULGE,
	arcControlPoint,
	borderLegNominalMs,
	computeLegDurations,
	computePhotoLegDurations,
	DEFAULT_TRIP_MS,
	easeInOutCubic,
	MAX_BORDER_LEG_MS,
	MIN_LEG_MS,
	quadraticBezierPoint,
} from "../../src/route";

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe("easeInOutCubic", () => {
	it("is anchored at 0, 0.5 and 1, clamps outside, and starts slower than linear", () => {
		expect(easeInOutCubic(0)).toBe(0);
		expect(easeInOutCubic(0.5)).toBe(0.5);
		expect(easeInOutCubic(1)).toBe(1);
		expect(easeInOutCubic(-1)).toBe(0);
		expect(easeInOutCubic(2)).toBe(1);
		expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
	});
});

describe("computeLegDurations", () => {
	it("sums to the budget for a few legs and for thousands of short hops", () => {
		expect(sum(computeLegDurations([500, 1000, 8000]))).toBeCloseTo(
			DEFAULT_TRIP_MS,
			6,
		);
		expect(sum(computeLegDurations(new Array(4000).fill(2)))).toBeCloseTo(
			DEFAULT_TRIP_MS,
			6,
		);
		expect(sum(computeLegDurations([1, 2, 3], 5000))).toBeCloseTo(5000, 6);
	});

	it("gives a longer leg more time, but less than linearly more", () => {
		const [short = 0, long = 0] = computeLegDurations([10, 10_000]);
		expect(long).toBeGreaterThan(short);
		expect(long / short).toBeLessThan(10_000 / 10);
	});

	it("pins short legs to the floor and gives the rest to long legs", () => {
		const durations = computeLegDurations([
			20_000,
			20_000,
			...new Array(9000).fill(0),
		]);
		expect(Math.min(...durations)).toBeCloseTo(MIN_LEG_MS, 9);
		expect(durations[0]).toBeCloseTo(
			(DEFAULT_TRIP_MS - 9000 * MIN_LEG_MS) / 2,
			6,
		);
		expect(sum(durations)).toBeCloseTo(DEFAULT_TRIP_MS, 6);
	});

	it("shrinks the floor to an equal share when the floor alone exceeds the budget", () => {
		const durations = computeLegDurations(new Array(50_000).fill(0));
		expect(sum(durations)).toBeCloseTo(DEFAULT_TRIP_MS, 4);
		expect(durations.every((d) => d > 0)).toBe(true);
	});

	it("returns nothing for a route without legs", () => {
		expect(computeLegDurations([])).toEqual([]);
	});
});

describe("border legs", () => {
	it("grow with distance but never exceed one second", () => {
		expect(borderLegNominalMs(0)).toBeLessThan(borderLegNominalMs(500));
		expect(borderLegNominalMs(500)).toBeLessThan(borderLegNominalMs(5000));
		expect(borderLegNominalMs(20_000)).toBe(MAX_BORDER_LEG_MS);
		expect(MAX_BORDER_LEG_MS).toBe(1000);
	});

	it("are capped among local legs, and local legs share what is left of the budget", () => {
		const distances = [5, 12_000, 3, 4, 2, 9000];
		const isBorder = [false, true, false, false, false, true];
		const durations = computePhotoLegDurations(distances, isBorder);
		expect(durations[1]).toBeLessThanOrEqual(MAX_BORDER_LEG_MS);
		expect(durations[5]).toBeLessThanOrEqual(MAX_BORDER_LEG_MS);
		expect(sum(durations)).toBeCloseTo(DEFAULT_TRIP_MS, 6);
	});

	it("fit 20k local hops into the rest without any going to zero", () => {
		const distances = [5000, ...new Array(20_000).fill(0.005)];
		const isBorder = [true, ...new Array(20_000).fill(false)];
		const durations = computePhotoLegDurations(distances, isBorder);
		expect(durations.every((d) => d > 0)).toBe(true);
		expect(sum(durations)).toBeCloseTo(DEFAULT_TRIP_MS, 4);
		expect(durations[0]).toBeGreaterThan(durations[1] ?? 0);
	});
});

describe("arcs", () => {
	it("hits the end points at t = 0 and t = 1 and bulges towards the control point", () => {
		expect(quadraticBezierPoint(0, 0, 5, 8, 10, 0, 0)).toEqual([0, 0]);
		expect(quadraticBezierPoint(0, 0, 5, 8, 10, 0, 1)).toEqual([10, 0]);
		expect(quadraticBezierPoint(0, 0, 10, 20, 20, 0, 0.5)[1]).toBe(10);
	});

	it("bulges north of the midpoint, capped for long legs", () => {
		const [cx, cy] = arcControlPoint(0, 0, 10, 0);
		expect(cx).toBe(5);
		expect(cy).toBeLessThan(0);
		expect(arcControlPoint(0, 0, 1000, 0)[1]).toBe(-ARC_MAX_BULGE);
	});
});
