import { describe, expect, it } from "vitest";
import {
	addDays,
	dayIso,
	dayNumber,
	dayOf,
	daysBetween,
	overlapDays,
	spanDays,
} from "../src/days";

describe("dayNumber and dayIso", () => {
	it("counts days since 1970-01-01 and back", () => {
		expect(dayNumber("1970-01-01")).toBe(0);
		expect(dayNumber("1970-01-02")).toBe(1);
		expect(dayNumber("1969-12-31")).toBe(-1);
		expect(dayIso(0)).toBe("1970-01-01");
		expect(dayIso(-1)).toBe("1969-12-31");
		expect(dayIso(dayNumber("2024-02-29") ?? 0)).toBe("2024-02-29");
	});

	it("reads the date part of a date-time, whatever its offset", () => {
		expect(dayNumber("2024-03-31T23:30:00+02:00")).toBe(
			dayNumber("2024-03-31"),
		);
	});

	it("is null for an invalid date", () => {
		expect(dayNumber("")).toBeNull();
		expect(dayNumber("not a day")).toBeNull();
		expect(dayNumber("2024-13-01")).toBeNull();
	});
});

describe("addDays", () => {
	it("crosses month and year ends", () => {
		expect(addDays("2023-01-31", 1)).toBe("2023-02-01");
		expect(addDays("2023-12-31", 1)).toBe("2024-01-01");
		expect(addDays("2024-01-01", -1)).toBe("2023-12-31");
		expect(addDays("2024-05-10", 0)).toBe("2024-05-10");
	});

	it("knows leap years", () => {
		expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
		expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
		expect(addDays("2000-02-28", 1)).toBe("2000-02-29");
		expect(addDays("1900-02-28", 1)).toBe("1900-03-01");
		expect(addDays("2024-01-01", 366)).toBe("2025-01-01");
	});

	it("does not shift across daylight saving changes", () => {
		// Europe and the US change clocks on these days; calendar days do not care.
		expect(addDays("2024-03-30", 1)).toBe("2024-03-31");
		expect(addDays("2024-03-31", 1)).toBe("2024-04-01");
		expect(addDays("2024-10-27", 1)).toBe("2024-10-28");
		expect(addDays("2024-11-03", 1)).toBe("2024-11-04");
	});
});

describe("daysBetween and spanDays", () => {
	it("counts whole days, signed", () => {
		expect(daysBetween("2024-03-01", "2024-03-01")).toBe(0);
		expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
		expect(daysBetween("2023-02-28", "2023-03-01")).toBe(1);
		expect(daysBetween("2024-03-01", "2024-02-28")).toBe(-2);
		expect(daysBetween("2023-12-31", "2024-01-01")).toBe(1);
		expect(daysBetween("2024-03-30", "2024-04-01")).toBe(2);
	});

	it("includes both ends in a span", () => {
		expect(spanDays("2024-03-01", "2024-03-01")).toBe(1);
		expect(spanDays("2024-01-01", "2024-12-31")).toBe(366);
		expect(spanDays("2023-01-01", "2023-12-31")).toBe(365);
	});

	it("counts days shared by two ranges", () => {
		expect(
			overlapDays("2024-01-01", "2024-01-10", "2024-01-05", "2024-02-01"),
		).toBe(6);
		expect(
			overlapDays("2024-01-01", "2024-01-10", "2024-01-11", "2024-02-01"),
		).toBe(0);
	});
});

describe("dayOf", () => {
	it("keeps the local day of a photo, not the UTC one", () => {
		expect(dayOf({ date: "2024-03-01T23:30:00+02:00" })).toBe("2024-03-01");
		expect(dayOf({ date: "2024-03-01T00:30:00-05:00" })).toBe("2024-03-01");
		expect(dayOf({ date: "2024-03-01" })).toBe("2024-03-01");
	});
});
