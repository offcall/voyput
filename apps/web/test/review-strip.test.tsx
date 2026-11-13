import { render, screen } from "@testing-library/react";
import { dayNumber } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { DayStrip } from "../src/features/review/DayStrip";
import {
	formatDatesIn,
	formatDay,
	formatDayRange,
} from "../src/features/review/format";
import { PannableDayStrip } from "../src/features/review/PannableDayStrip";
import {
	lineEdge,
	photoDayRuns,
	segmentBox,
	segmentTip,
	stripSegments,
	stripWindow,
} from "../src/features/review/strip";

const day = (iso: string) => dayNumber(iso) ?? Number.NaN;

describe("Review date format", () => {
	it("writes a day as '1 May 2023'", () => {
		expect(formatDay("2023-05-01")).toBe("1 May 2023");
		expect(formatDay("2016-12-31")).toBe("31 Dec 2016");
		expect(formatDay("not a date")).toBe("not a date");
		expect(formatDay("2023-13-01")).toBe("2023-13-01");
	});

	it("writes a range with the year once, or twice when it changes", () => {
		expect(formatDayRange("2023-04-26", "2023-04-26")).toBe(
			"26 Apr – 26 Apr 2023",
		);
		expect(formatDayRange("2023-04-26", "2023-05-03")).toBe(
			"26 Apr – 3 May 2023",
		);
		expect(formatDayRange("2022-12-28", "2023-01-03")).toBe(
			"28 Dec 2022 – 3 Jan 2023",
		);
	});

	it("rewrites dates inside free text", () => {
		expect(formatDatesIn("Photos on 2023-04-26 show SG (not 2023-4-26)")).toBe(
			"Photos on 26 Apr 2023 show SG (not 2023-4-26)",
		);
	});
});

describe("stamp line on the strip", () => {
	it("sits on the start of the day for an entry, the end for an exit", () => {
		expect(lineEdge(100, "entry")).toBe(100);
		expect(lineEdge(100, "unknown")).toBe(100);
		expect(lineEdge(100, "exit")).toBe(101);
	});

	it("has as many days on each side, so it is in the exact middle", () => {
		for (const direction of ["entry", "exit", "unknown"] as const) {
			const edge = lineEdge(100, direction);
			const { from, days } = stripWindow(edge, 10);
			expect(days).toBe(20);
			expect((edge - from) / days).toBe(0.5);
		}
		// Mid-drag too.
		const { from, days } = stripWindow(100, 7, 1.3);
		expect((101.3 - from) / days).toBe(0.5);
	});
});

describe("strip segments", () => {
	const runs = [
		{ start: "2023-04-20", end: "2023-04-25", countryCode: "ID" },
		{ start: "2023-04-26", end: "2023-04-26", countryCode: "SG" },
		{ start: "2023-04-29", end: "2023-05-10", countryCode: "GE" },
	];

	it("covers every day once, days without photos included", () => {
		const segments = stripSegments(runs, day("2023-04-22"), day("2023-05-01"));
		expect(segments.map(segmentTip)).toEqual([
			"ID · 22 Apr – 25 Apr 2023",
			"SG · 26 Apr – 26 Apr 2023",
			"No photos · 27 Apr – 28 Apr 2023",
			"GE · 29 Apr – 1 May 2023",
		]);
		for (const [i, segment] of segments.entries()) {
			const next = segments[i + 1];
			if (next) expect(next.start).toBe(segment.end + 1);
		}
	});

	it("draws each segment exactly on its days of the grid", () => {
		const from = day("2023-04-16");
		const segments = stripSegments(runs, from, from + 19);
		const boxes = segments.map((s) => segmentBox(s, from, 20));
		// 16–19 Apr have no photos: 4 of 20 days, 20 %.
		expect(
			segmentTip(segments[0] ?? { start: 0, end: 0, countryCode: null }),
		).toBe("No photos · 16 Apr – 19 Apr 2023");
		expect(boxes[0]).toEqual({ left: 0, right: 80 });
		// SG on 26 Apr is day 10 of 20: from 50 % to 55 %.
		expect(boxes[2]).toEqual({ left: 50, right: 45 });
		for (const [i, box] of boxes.entries()) {
			const next = boxes[i + 1];
			if (next) expect(next.left).toBeCloseTo(100 - box.right, 10);
		}
		expect(boxes.at(-1)?.right).toBe(0);
	});

	it("cuts core runs at days without photos", () => {
		const photoDays = Int32Array.from(
			["2023-04-01", "2023-04-01", "2023-04-02", "2023-04-05", "2023-04-06"],
			day,
		);
		expect(
			photoDayRuns(
				[{ start: "2023-04-01", end: "2023-04-06", countryCode: "TW" }],
				photoDays,
			),
		).toEqual([
			{ start: "2023-04-01", end: "2023-04-02", countryCode: "TW" },
			{ start: "2023-04-05", end: "2023-04-06", countryCode: "TW" },
		]);
	});
});

describe("DayStrip", () => {
	const runs = [
		{ start: "2023-04-01", end: "2023-04-25", countryCode: "ID" },
		{ start: "2023-04-26", end: "2023-04-26", countryCode: "SG" },
		{ start: "2023-04-28", end: "2023-05-30", countryCode: "GE" },
	];
	const titles = (container: HTMLElement) =>
		[...container.querySelectorAll(".review-strip-run")].map((el) => ({
			title: el.getAttribute("title"),
			left: (el as HTMLElement).style.left,
			right: (el as HTMLElement).style.right,
			empty: el.hasAttribute("data-empty"),
		}));

	it("puts an entry line on the change into the stamp's country", () => {
		const { container } = render(
			<DayStrip
				dayRuns={runs}
				date="2023-04-26"
				direction="entry"
				stampCode="SG"
				radius={2}
			/>,
		);
		expect(
			(container.querySelector(".review-strip-marker") as HTMLElement).style
				.left,
		).toBe("50%");
		expect(titles(container)).toEqual([
			{
				title: "ID · 24 Apr – 25 Apr 2023",
				left: "0%",
				right: "50%",
				empty: false,
			},
			{
				title: "SG · 26 Apr – 26 Apr 2023",
				left: "50%",
				right: "25%",
				empty: false,
			},
			{
				title: "No photos · 27 Apr – 27 Apr 2023",
				left: "75%",
				right: "0%",
				empty: true,
			},
		]);
	});

	it("puts an exit line on the change out of the stamp's country", () => {
		const { container } = render(
			<DayStrip
				dayRuns={runs}
				date="2023-04-26"
				direction="exit"
				stampCode="SG"
				radius={2}
			/>,
		);
		expect(titles(container).map((t) => [t.title, t.left])).toEqual([
			["ID · 25 Apr – 25 Apr 2023", "0%"],
			["SG · 26 Apr – 26 Apr 2023", "25%"],
			["No photos · 27 Apr – 27 Apr 2023", "50%"],
			["GE · 28 Apr – 28 Apr 2023", "75%"],
		]);
		expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
			"No photos · 27 Apr – 27 Apr 2023",
		);
	});

	it("shows the dates on the edges and the stamp day in the middle", () => {
		render(
			<PannableDayStrip
				dayRuns={runs}
				date="2023-04-26"
				readDate="2023-04-26"
				direction="exit"
				stampCode="SG"
				radius={10}
				onDate={() => {}}
			/>,
		);
		expect(screen.getByText("17 Apr 2023")).toBeTruthy();
		expect(screen.getByText("6 May 2023")).toBeTruthy();
		expect(screen.getByText("· end of day", { exact: false })).toBeTruthy();
	});
});
