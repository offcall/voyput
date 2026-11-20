import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Stamp } from "@voyput/core";
import { beforeEach, describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { STRIP_HINT_KEY } from "../src/features/review/stripHint";
import { stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

const stamp = (id: string, date: string): Stamp => ({
	id,
	passportId: "p1",
	photoId: "page-1.png",
	direction: "entry",
	borderCrossing: "plane",
	dateText: date,
	date,
	country: "Turkey",
	countryCode: "TR",
	location: null,
	confidence: 90,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: false,
});

let dbCount = 0;

async function seed() {
	const db = new VoyputDb(`review-strip-hint-${++dbCount}`);
	await db.passports.put({
		id: "p1",
		name: "Blue",
		validFrom: null,
		validTo: null,
		createdAt: "2024-01-01T00:00:00Z",
	});
	await db.photos.put({
		id: "page-1.png",
		passportId: "p1",
		name: "page-1.png",
		mimeType: "image/png",
		rotation: 0,
		addedAt: "2024-01-01T00:00:00Z",
		blob: new Blob(["x"], { type: "image/png" }),
	});
	await db.stamps.bulkPut([stamp("a", "2024-07-03"), stamp("b", "2024-07-08")]);
	return db;
}

const HINT = /Drag to see more days/;

describe("day strip drag hint", () => {
	beforeEach(() => stubObjectUrls());

	it("shows once, on the first strip, until closed with ×", async () => {
		const db = await seed();
		const user = userEvent.setup();
		renderApp("/collect/review?photo=page-1.png", { db });
		expect(await screen.findAllByText(HINT)).toHaveLength(1);
		expect(
			screen.getAllByRole("slider", {
				name: "Stamp date on the photo location history",
			}),
		).toHaveLength(2);

		await user.click(
			screen.getByRole("button", { name: "Hide the drag hint" }),
		);
		await waitFor(() => expect(screen.queryByText(HINT)).toBeNull());
		expect((await db.kv.get(STRIP_HINT_KEY))?.value).toBe(true);

		cleanup();
		renderApp("/collect/review?photo=page-1.png", { db });
		await screen.findAllByRole("slider", {
			name: "Stamp date on the photo location history",
		});
		expect(screen.queryByText(HINT)).toBeNull();
	});

	it("goes away on the first drag", async () => {
		const db = await seed();
		renderApp("/collect/review?photo=page-1.png", { db });
		await screen.findByText(HINT);
		const [track] = screen.getAllByRole("slider", {
			name: "Stamp date on the photo location history",
		});
		if (!track) throw new Error("no strip");
		fireEvent.pointerDown(track, { pointerId: 1, clientX: 100, button: 0 });
		fireEvent.pointerUp(track, { pointerId: 1, clientX: 100 });
		await waitFor(() => expect(screen.queryByText(HINT)).toBeNull());
		expect((await db.kv.get(STRIP_HINT_KEY))?.value).toBe(true);
	});
});
