import { describe, expect, it } from "vitest";
import { flagOf as reviewFlag } from "../src/features/review/format";
import { flagOf as tripsFlag } from "../src/features/trips/format";

describe("flag helpers", () => {
	it("turns a two-letter code into its flag, in any case", () => {
		expect(tripsFlag("fr")).toBe("🇫🇷");
		expect(reviewFlag("FR")).toBe("🇫🇷");
	});

	it("gives Stays an empty string and Review a white flag otherwise", () => {
		expect(tripsFlag("")).toBe("");
		expect(tripsFlag("FRA")).toBe("");
		expect(reviewFlag(null)).toBe("🏳️");
		expect(reviewFlag("F1")).toBe("🏳️");
	});
});
