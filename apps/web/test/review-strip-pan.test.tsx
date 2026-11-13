import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const strip = () =>
	render(
		<PannableDayStrip
			dayRuns={[
				{ start: "2024-03-01", end: "2024-03-08", countryCode: "MD" },
				{ start: "2024-03-09", end: "2024-03-20", countryCode: "RO" },
			]}
			date="2024-03-10"
			stampCode="RO"
			radius={5}
		/>,
	);

const slider = () =>
	screen.getByRole("slider", { name: "Photo location history window" });

describe("pannable photo location strip", () => {
	it("rests on a whole day after a drag", () => {
		strip();
		const track = slider();
		// 11 days over 220 px: 20 px per day.
		track.getBoundingClientRect = () => ({ width: 220 }) as DOMRect;
		fireEvent.pointerDown(track, { pointerId: 1, clientX: 100, button: 0 });
		fireEvent.pointerMove(track, { pointerId: 1, clientX: 164 });
		fireEvent.pointerUp(track, { pointerId: 1, clientX: 164 });
		// 64 px right is 3.2 days earlier; it rests on a whole day.
		expect(slider().getAttribute("aria-valuenow")).toBe("-3");
		expect(slider().getAttribute("aria-valuetext")).toBe(
			"2024-03-02 to 2024-03-12, 3 days before the stamp date",
		);
	});

	it("steps a day with the arrow keys and the buttons, and resets", async () => {
		const user = userEvent.setup();
		strip();
		slider().focus();
		await user.keyboard("{ArrowRight}{ArrowRight}");
		expect(slider().getAttribute("aria-valuenow")).toBe("2");
		await user.click(screen.getByRole("button", { name: "One day earlier" }));
		expect(slider().getAttribute("aria-valuenow")).toBe("1");
		await user.click(screen.getByRole("button", { name: "Stamp date" }));
		expect(slider().getAttribute("aria-valuenow")).toBe("0");
		expect(
			(screen.getByRole("button", { name: "Stamp date" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
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
