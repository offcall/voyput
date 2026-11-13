import type { TripStop } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { stripBlocks } from "../src/features/trips/strip";

const stop = (day: string, countryCode: string): TripStop => ({
	id: `${day}|${countryCode}`,
	day,
	countryCode,
	country: countryCode,
	cities: [],
	kind: "stay",
});

describe("stripBlocks", () => {
	it("keeps one block per day for a short trip", () => {
		const blocks = stripBlocks("2024-03-01", "2024-03-03", [
			stop("2024-03-01", "RO"),
			stop("2024-03-03", "RO"),
			stop("2024-03-03", "BG"),
		]);
		expect(blocks.map((b) => b.from)).toEqual([
			"2024-03-01",
			"2024-03-02",
			"2024-03-03",
		]);
		expect(blocks[1]?.countries).toEqual([]);
		expect(blocks[2]?.countries.map((c) => c.countryCode)).toEqual([
			"RO",
			"BG",
		]);
	});

	it("groups a long trip into at most 60 blocks that cover every day", () => {
		// 181 days, as in a half-year trip: 4 days per block, 46 blocks.
		const stops = [stop("2026-03-20", "IN"), stop("2026-03-21", "IN")];
		stops.push(stop("2026-03-22", "MU"));
		const blocks = stripBlocks("2026-03-20", "2026-09-16", stops);
		expect(blocks.length).toBeLessThanOrEqual(60);
		expect(blocks[0]).toEqual({
			from: "2026-03-20",
			to: "2026-03-23",
			countries: [
				{ countryCode: "IN", days: 2 },
				{ countryCode: "MU", days: 1 },
			],
		});
		expect(blocks.at(-1)?.to).toBe("2026-09-16");
	});
});
