import { describe, expect, it } from "vitest";
import type { Move, Movement } from "../src";
import { moveRoutes, moveYears } from "../src";

const stay = (code: string, start: string): Movement => ({
	code,
	country: code,
	start,
	end: start,
	photos: 1,
	range: 0,
});
const move = (from: string, to: string, day: string): Move => ({
	from: stay(from, day),
	to: stay(to, day),
});

describe("move routes", () => {
	const moves = [
		move("MD", "RO", "2023-12-31"),
		move("RO", "MD", "2024-01-02"),
		move("MD", "RO", "2024-01-03"),
	];

	it("lists the years with moves", () => {
		expect(moveYears(moves)).toEqual(["2023", "2024"]);
		expect(moveYears([])).toEqual([]);
	});

	it("counts routes, most first, keeping the latest move", () => {
		expect(moveRoutes(moves, null)).toMatchObject([
			{ from: "MD", to: "RO", count: 2, last: "2024-01-03" },
			{ from: "RO", to: "MD", count: 1, last: "2024-01-02" },
		]);
	});

	it("keeps only the moves of one year", () => {
		expect(moveRoutes(moves, "2023")).toMatchObject([
			{ from: "MD", to: "RO", count: 1, last: "2023-12-31" },
		]);
		expect(moveRoutes(moves, "2022")).toEqual([]);
	});
});
