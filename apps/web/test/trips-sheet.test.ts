import { describe, expect, it } from "vitest";
import { sheetSwipe } from "../src/features/trips/sheetSwipe";

describe("sheetSwipe", () => {
	it("closes on a drag down far enough", () => {
		expect(sheetSwipe(0, 120)).toBe("close");
		expect(sheetSwipe(10, 40)).toBeNull();
		expect(sheetSwipe(0, -150)).toBeNull();
	});

	it("turns to the next stay on a drag left and the previous on a drag right", () => {
		expect(sheetSwipe(-90, 10)).toBe("next");
		expect(sheetSwipe(90, -10)).toBe("previous");
		expect(sheetSwipe(-30, 5)).toBeNull();
	});

	it("follows whichever way the drag went further", () => {
		expect(sheetSwipe(-70, 100)).toBe("close");
		expect(sheetSwipe(-100, 90)).toBe("next");
	});
});
