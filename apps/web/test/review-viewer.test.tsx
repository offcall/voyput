import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { seedDemo, stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

let dbCount = 0;

const zoomLabel = () =>
	screen.getByRole("button", { name: /^\d+%$/ }).textContent;

/** A finger on the photo frame. */
const touch = (
	type: "pointerDown" | "pointerMove" | "pointerUp",
	frame: Element,
	pointerId: number,
	clientX: number,
) =>
	fireEvent[type](frame, {
		pointerId,
		pointerType: "touch",
		clientX,
		clientY: 100,
	});

describe("review photo on a touch screen", () => {
	beforeEach(() => stubObjectUrls());

	it("zooms with a pinch and toggles with a double tap", async () => {
		const db = new VoyputDb(`review-viewer-${++dbCount}`);
		await seedDemo(db);
		renderApp("/review", { db });
		await screen.findByRole("img", { name: "page-1.png" });
		const frame = document.querySelector(".review-viewer-frame");
		if (!frame) throw new Error("no photo frame");
		expect(zoomLabel()).toBe("100%");

		// Two fingers 100 px apart spread to 200 px: twice the size.
		touch("pointerDown", frame, 1, 100);
		touch("pointerDown", frame, 2, 200);
		touch("pointerMove", frame, 2, 300);
		expect(zoomLabel()).toBe("200%");
		touch("pointerUp", frame, 2, 300);
		touch("pointerUp", frame, 1, 100);
		expect(zoomLabel()).toBe("200%");

		// A double tap goes back to the fitted photo, another zooms in again.
		for (const _ of [1, 2]) {
			touch("pointerDown", frame, 3, 150);
			touch("pointerUp", frame, 3, 150);
		}
		expect(zoomLabel()).toBe("100%");
		for (const _ of [1, 2]) {
			touch("pointerDown", frame, 4, 150);
			touch("pointerUp", frame, 4, 150);
		}
		expect(zoomLabel()).toBe("250%");

		// One tap alone does nothing.
		touch("pointerDown", frame, 5, 150);
		touch("pointerUp", frame, 5, 150);
		expect(zoomLabel()).toBe("250%");
	});
});
