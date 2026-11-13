import { fireEvent, render, screen } from "@testing-library/react";
import { dayNumber } from "@voyput/core";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DayStrip } from "../src/features/review/DayStrip";
import {
	formatDatesIn,
	formatDay,
	formatDayRange,
} from "../src/features/review/format";
import { PannableDayStrip } from "../src/features/review/PannableDayStrip";
import {
	NO_TRAVEL_DAYS,
	photoDayRuns,
	segmentBox,
	segmentTip,
	stampLine,
	stripSegments,
	stripView,
	travelDaysOf,
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
	const none = NO_TRAVEL_DAYS;
	const travel = new Map([[100, ["UA", "ES"]]]);

	it("sits on the start of the day for an entry, the end for an exit", () => {
		expect(stampLine(100, "entry", "ES", none)).toBe(100);
		expect(stampLine(100, "unknown", "ES", none)).toBe(100);
		expect(stampLine(100, "exit", "UA", none)).toBe(101);
	});

	it("sits on the change inside a travel day", () => {
		expect(stampLine(100, "entry", "ES", travel)).toBe(100.5);
		expect(stampLine(100, "exit", "UA", travel)).toBe(100.5);
		// No change into or out of the stamp's country inside the day: a day edge.
		expect(stampLine(100, "entry", "UA", travel)).toBe(100);
		expect(stampLine(100, "exit", "ES", travel)).toBe(101);
		expect(stampLine(100, "entry", "FR", travel)).toBe(100);
		expect(
			stampLine(100, "exit", "GE", new Map([[100, ["AM", "GE", "TR"]]])),
		).toBeCloseTo(100 + 2 / 3, 10);
	});

	it("keeps a same-day return, ordered by the photos' instants", () => {
		const d = day("2016-08-10");
		// ES 08:30+02 is 06:30 UTC, after UA 09:00+03 (06:00 UTC).
		const travel = travelDaysOf([
			{ date: "2016-08-10T08:30:00+02:00", countryCode: "ES" },
			{ date: "2016-08-10T22:00:00+03:00", countryCode: "UA" },
			{ date: "2016-08-10T09:00:00+03:00", countryCode: "UA" },
			{ date: "2016-08-10T15:00:00+02:00", countryCode: "ES" },
		]);
		expect(travel).toEqual(new Map([[d, ["UA", "ES", "UA"]]]));
		// Entry back into UA: on the return, not at the day start.
		expect(stampLine(d, "entry", "UA", travel)).toBeCloseTo(d + 2 / 3, 10);
		expect(stampLine(d, "exit", "UA", travel)).toBeCloseTo(d + 1 / 3, 10);
		expect(stampLine(d, "entry", "ES", travel)).toBeCloseTo(d + 1 / 3, 10);
		expect(stampLine(d, "exit", "ES", travel)).toBeCloseTo(d + 2 / 3, 10);
		// Two trips out and back: the last crossing, the side the day ends on.
		const twice = new Map([[d, ["UA", "ES", "UA", "ES"]]]);
		expect(stampLine(d, "entry", "ES", twice)).toBe(d + 3 / 4);
		expect(stampLine(d, "exit", "UA", twice)).toBe(d + 3 / 4);
	});

	it("lists a travel day's countries in photo order, case-insensitive", () => {
		expect(
			travelDaysOf([
				{ date: "2016-08-10T18:00:00+02:00", countryCode: "ES" },
				{ date: "2016-08-10T09:00:00+03:00", countryCode: "ua" },
				{ date: "2016-08-10T20:00:00+02:00", countryCode: "UA" },
				{ date: "2016-08-11T09:00:00+02:00", countryCode: "ES" },
			]),
		).toEqual(new Map([[day("2016-08-10"), ["UA", "ES", "UA"]]]));
	});

	it("has as many days on each side, so it is in the exact middle", () => {
		for (const direction of ["entry", "exit", "unknown"] as const) {
			const stamp = {
				day: 100,
				direction,
				stampCode: "ES",
				travelDays: travel,
			};
			const { line, from, days } = stripView(stamp, 10);
			expect(days).toBe(20);
			expect((line - from) / days).toBe(0.5);
		}
		// Mid-drag: the line of the day under it, plus the part of a day not yet snapped.
		const stamp = {
			day: 99,
			direction: "entry" as const,
			stampCode: "ES",
			travelDays: travel,
		};
		expect(stripView(stamp, 7, 1.3)).toEqual({
			day: 100,
			line: expect.closeTo(100.8, 10),
			from: expect.closeTo(93.8, 10),
			days: 14,
		});
		expect(stripView(stamp, 7, 0.4).line).toBeCloseTo(99.4, 10);
	});
});

describe("strip segments", () => {
	const runs = [
		{ start: "2023-04-20", end: "2023-04-25", countryCode: "ID" },
		{ start: "2023-04-26", end: "2023-04-26", countryCode: "SG" },
		{ start: "2023-04-29", end: "2023-05-10", countryCode: "GE" },
	];

	it("covers every day once, days without photos included", () => {
		const segments = stripSegments(
			runs,
			NO_TRAVEL_DAYS,
			day("2023-04-22"),
			day("2023-05-01"),
		);
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
		const segments = stripSegments(runs, NO_TRAVEL_DAYS, from, from + 19);
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
				travelDays={NO_TRAVEL_DAYS}
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
				travelDays={NO_TRAVEL_DAYS}
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
				travelDays={NO_TRAVEL_DAYS}
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

	describe("on a travel day", () => {
		const trip = [
			{ start: "2016-08-01", end: "2016-08-10", countryCode: "UA" },
			{ start: "2016-08-11", end: "2016-08-20", countryCode: "ES" },
		];
		const travel = new Map([[day("2016-08-10"), ["UA", "ES"]]]);
		const strip = (direction: "entry" | "exit", stampCode: string) =>
			render(
				<DayStrip
					dayRuns={trip}
					travelDays={travel}
					date="2016-08-10"
					direction={direction}
					stampCode={stampCode}
					radius={2}
				/>,
			).container;

		for (const [direction, code] of [
			["entry", "ES"],
			["exit", "UA"],
		] as const)
			it(`puts an ${direction} line on the change inside the day, in the middle`, () => {
				const container = strip(direction, code);
				expect(
					(container.querySelector(".review-strip-marker") as HTMLElement).style
						.left,
				).toBe("50%");
				const day = container.querySelector(
					".review-strip-run[data-travel]",
				) as HTMLElement;
				expect(day.getAttribute("title")).toBe("UA → ES · 10 Aug 2016");
				// Half a day each side of the change: 37.5 % + one day of 25 %.
				expect([day.style.left, day.style.right]).toEqual(["37.5%", "37.5%"]);
				expect(
					[...day.querySelectorAll(".review-strip-part")].map((part) =>
						part.hasAttribute("data-match"),
					),
				).toEqual([code === "UA", code === "ES"]);
				expect(titles(container).map((t) => t.title)).toEqual([
					"UA · 8 Aug – 9 Aug 2016",
					"UA → ES · 10 Aug 2016",
					"ES · 11 Aug – 12 Aug 2016",
				]);
			});

		it("names the in-day change under the strip", () => {
			render(
				<PannableDayStrip
					dayRuns={trip}
					travelDays={travel}
					date="2016-08-10"
					readDate="2016-08-10"
					direction="exit"
					stampCode="UA"
					radius={10}
					onDate={() => {}}
				/>,
			);
			expect(
				screen.getByText("· border change in the day", { exact: false }),
			).toBeTruthy();
			expect(screen.getByText("1 Aug 2016")).toBeTruthy();
			expect(screen.getByText("19 Aug 2016")).toBeTruthy();
		});
	});

	it("drags onto a travel day and back with the line on the change, no jump on release", () => {
		const travel = new Map([[day("2016-08-10"), ["UA", "ES"]]]);
		const trip = [
			{ start: "2016-08-01", end: "2016-08-10", countryCode: "UA" },
			{ start: "2016-08-11", end: "2016-08-20", countryCode: "ES" },
		];
		function Harness() {
			const [date, setDate] = useState("2016-08-09");
			return (
				<PannableDayStrip
					dayRuns={trip}
					travelDays={travel}
					date={date}
					readDate="2016-08-09"
					direction="entry"
					stampCode="ES"
					radius={5}
					onDate={setDate}
				/>
			);
		}
		const { container } = render(<Harness />);
		const track = screen.getByRole("slider");
		// 10 days over 220 px: 22 px per day.
		track.getBoundingClientRect = () => ({ width: 220 }) as DOMRect;
		const travelBox = () => {
			const el = container.querySelector(
				".review-strip-run[data-travel]",
			) as HTMLElement;
			return [parseFloat(el.style.left), parseFloat(el.style.right)];
		};
		const caption = () =>
			container.querySelector(".review-pan-date")?.textContent;
		// At rest on 9 Aug the entry line is on the day start: 10 Aug is 60–70 %.
		expect(travelBox()[0]).toBeCloseTo(60, 10);
		const drag = (dx: number, check: () => void) => {
			fireEvent.pointerDown(track, { pointerId: 1, clientX: 100, button: 0 });
			fireEvent.pointerMove(track, { pointerId: 1, clientX: 100 + dx });
			check();
			fireEvent.pointerUp(track, { pointerId: 1, clientX: 100 + dx });
			check();
		};
		// One day left: 10 Aug under the line, the line on the UA → ES change.
		drag(-22, () => {
			expect(caption()).toBe("10 Aug 2016 · border change in the day");
			const [left, right] = travelBox();
			expect(left).toBeCloseTo(45, 10);
			expect(right).toBeCloseTo(45, 10);
		});
		// And back to the ordinary day: the line on its start again.
		drag(22, () => {
			expect(caption()).toBe("9 Aug 2016 · start of day");
			const [left, right] = travelBox();
			expect(left).toBeCloseTo(60, 10);
			expect(right).toBeCloseTo(30, 10);
		});
	});
});
