import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PannableDayStrip } from "../src/features/review/PannableDayStrip";
import { dragShift, snapShift } from "../src/features/review/stripPan";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings/settings";

describe("strip pan helpers", () => {
	it("follows the pointer: dragging right brings earlier days", () => {
		expect(dragShift(0, 30, 10)).toBe(-3);
		expect(dragShift(2, -15, 10)).toBe(3.5);
		expect(dragShift(4, 50, 0)).toBe(4);
	});

	it("snaps to a whole day", () => {
		expect(snapShift(-2.4)).toBe(-2);
		expect(snapShift(3.6)).toBe(4);
		expect(Object.is(snapShift(-0.2), 0)).toBe(true);
	});
});

/** The strip with the date kept in state, as the stamp card keeps it in the db. */
function Harness({ dates }: { dates: string[] }) {
	const [date, setDate] = useState("2024-03-10");
	return (
		<PannableDayStrip
			dayRuns={[
				{ start: "2024-03-01", end: "2024-03-08", countryCode: "MD" },
				{ start: "2024-03-09", end: "2024-03-20", countryCode: "RO" },
			]}
			date={date}
			readDate="2024-03-10"
			stampCode="RO"
			radius={5}
			onDate={(next) => {
				dates.push(next);
				setDate(next);
			}}
		/>
	);
}

const slider = () =>
	screen.getByRole("slider", {
		name: "Stamp date on the photo location history",
	});

describe("photo location strip sets the stamp date", () => {
	it("lands on a whole day after a drag", () => {
		const dates: string[] = [];
		render(<Harness dates={dates} />);
		const track = slider();
		// 11 days over 220 px: 20 px per day.
		track.getBoundingClientRect = () => ({ width: 220 }) as DOMRect;
		fireEvent.pointerDown(track, { pointerId: 1, clientX: 100, button: 0 });
		fireEvent.pointerMove(track, { pointerId: 1, clientX: 164 });
		// Mid-drag the line shows the nearest whole day; nothing is saved yet.
		expect(slider().getAttribute("aria-valuetext")).toBe("2024-03-07");
		expect(dates).toEqual([]);
		fireEvent.pointerUp(track, { pointerId: 1, clientX: 164 });
		// 64 px right is 3.2 days earlier: the date lands on the 7th.
		expect(dates).toEqual(["2024-03-07"]);
		expect(slider().getAttribute("aria-valuetext")).toBe("2024-03-07");
		expect(slider().getAttribute("aria-valuenow")).toBe("-3");
	});

	it("steps a day with the keys and buttons, a week with Shift, and resets", async () => {
		const user = userEvent.setup();
		const dates: string[] = [];
		render(<Harness dates={dates} />);
		expect(
			screen.queryByRole("button", { name: "Reset to read date" }),
		).toBeNull();
		slider().focus();
		await user.keyboard("{ArrowRight}{ArrowRight}{Shift>}{ArrowLeft}{/Shift}");
		await user.click(screen.getByRole("button", { name: "One day later" }));
		expect(dates).toEqual([
			"2024-03-11",
			"2024-03-12",
			"2024-03-05",
			"2024-03-06",
		]);
		expect(screen.getByText("Read as 2024-03-10")).toBeTruthy();
		await user.click(
			screen.getByRole("button", { name: "Reset to read date" }),
		);
		expect(dates.at(-1)).toBe("2024-03-10");
		expect(
			screen.queryByRole("button", { name: "Reset to read date" }),
		).toBeNull();
	});
});

describe("photo location window setting", () => {
	const stored = (value: unknown) => {
		localStorage.setItem(
			"voyput:settings",
			JSON.stringify({ locationWindowDays: value }),
		);
		return loadSettings(localStorage).locationWindowDays;
	};

	it("keeps a whole number in range and falls back otherwise", () => {
		expect(DEFAULT_SETTINGS.locationWindowDays).toBe(10);
		expect(stored(21)).toBe(21);
		expect(stored(2)).toBe(10);
		expect(stored(61)).toBe(10);
		expect(stored(4.5)).toBe(10);
		expect(stored("7")).toBe(10);
	});
});
