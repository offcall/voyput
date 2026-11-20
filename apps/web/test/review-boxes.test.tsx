import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { CheckedStamp, Stamp } from "@voyput/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { AiClient } from "../src/ai/openrouter";
import { VoyputDb } from "../src/db/db";
import { extractPhoto } from "../src/features/extract/extractPhoto";
import { boxTone, photoBoxes } from "../src/features/review/boxes";
import { stubObjectUrls } from "./fixtures/demo";
import { offlineAi, renderApp } from "./renderApp";

const stamp = (id: string, overrides: Partial<Stamp> = {}): Stamp => ({
	id,
	passportId: "p1",
	photoId: "page-1.png",
	direction: "entry",
	borderCrossing: "plane",
	dateText: "2024-07-03",
	date: "2024-07-03",
	country: "Turkey",
	countryCode: "TR",
	location: null,
	confidence: 90,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: false,
	...overrides,
});

const NO_CHECK = { icloudCheck: "", suggestion: "" };
const checked = (s: Stamp, icloudCheck = ""): CheckedStamp => ({
	stamp: s,
	check: { ...NO_CHECK, icloudCheck },
});
const BOX = { x: 0.1, y: 0.1, width: 0.3, height: 0.2 };

describe("stamp boxes", () => {
	it("colour each box by its stamp's status", () => {
		expect(boxTone(checked(stamp("a", { reviewed: true })))).toBe("reviewed");
		expect(boxTone(checked(stamp("a")))).toBe("open");
		expect(boxTone(checked(stamp("a"), "no photos in Turkey"))).toBe(
			"attention",
		);
		expect(
			boxTone(checked(stamp("a", { reviewed: true, problem: "misread" }))),
		).toBe("problem");
	});

	it("number boxes as their cards and leave out stamps without one", () => {
		const boxes = photoBoxes([
			checked(stamp("a")),
			checked(stamp("b", { box: BOX })),
		]);
		expect(boxes).toEqual([
			{ stampId: "b", number: 2, box: BOX, tone: "open" },
		]);
	});
});

let dbCount = 0;

const PASSPORT = {
	id: "p1",
	name: "Blue",
	validFrom: null,
	validTo: null,
	createdAt: "2024-01-01T00:00:00Z",
};

describe("extraction stores stamp boxes", () => {
	it("stores the box in the unturned photo's frame", async () => {
		const db = new VoyputDb(`review-boxes-${++dbCount}`);
		const photo = {
			id: "page-1.png",
			passportId: "p1",
			name: "page-1.png",
			mimeType: "image/png" as const,
			rotation: 90 as const,
			addedAt: "2024-01-01T00:00:00Z",
			blob: new Blob(["x"], { type: "image/png" }),
		};
		await db.photos.put(photo);
		const ai: AiClient = {
			...offlineAi,
			askAboutImage: async () => ({
				cost: null,
				text: JSON.stringify({
					notes: "",
					stamps: [
						{ direction: "entry", date: null, box: [0.1, 0.2, 0.3, 0.1] },
						{ direction: "exit", date: null, box: [5, 5, 1, 1] },
					],
				}),
			}),
		};
		const settings = {
			openRouterKey: "k",
			model: "test/model",
			reasoningEffort: "low" as const,
		};
		await extractPhoto(db, ai, settings, PASSPORT, photo);
		const stored = await db.stamps.toArray();
		const entry = stored.find((s) => s.direction === "entry");
		expect(entry?.box?.x).toBeCloseTo(0.2);
		expect(entry?.box?.y).toBeCloseTo(0.6);
		expect(entry?.box?.width).toBeCloseTo(0.1);
		expect(entry?.box?.height).toBeCloseTo(0.3);
		// A box outside the photo is dropped; the stamp stays.
		expect(stored.find((s) => s.direction === "exit")?.box).toBeUndefined();
	});
});

describe("stamp boxes on Review", () => {
	beforeEach(() => stubObjectUrls());

	it("opens a stamp's card from its box and marks the box of the card under the pointer", async () => {
		const db = new VoyputDb(`review-boxes-${++dbCount}`);
		await db.passports.put(PASSPORT);
		await db.photos.put({
			id: "page-1.png",
			passportId: "p1",
			name: "page-1.png",
			mimeType: "image/png",
			rotation: 0,
			addedAt: "2024-01-01T00:00:00Z",
			blob: new Blob(["x"], { type: "image/png" }),
		});
		await db.stamps.bulkPut([
			stamp("a", { reviewed: true, box: BOX }),
			stamp("b", {
				direction: "exit",
				date: "2024-07-08",
				dateText: "2024-07-08",
				box: { ...BOX, x: 0.5 },
			}),
			// An older stamp without a box still gets its card.
			stamp("c", { date: "2024-07-20", dateText: "2024-07-20" }),
		]);
		renderApp("/collect/review?photo=page-1.png", { db });

		const second = await screen.findByRole("button", {
			name: "Show stamp 2",
		});
		const first = screen.getByRole("button", { name: "Show stamp 1" });
		expect(first.dataset.tone).toBe("reviewed");
		expect(second.dataset.tone).toBe("open");
		expect(screen.queryByRole("button", { name: "Show stamp 3" })).toBeNull();
		expect(screen.getByRole("article", { name: "Stamp 3" })).toBeTruthy();

		// Stamp 1 is reviewed, so its card starts folded; its box opens it.
		const card1 = screen.getByRole("article", { name: "Stamp 1" });
		const toggle1 = card1.querySelector("[aria-expanded]");
		expect(toggle1?.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(first);
		await waitFor(() => {
			expect(toggle1?.getAttribute("aria-expanded")).toBe("true");
			expect(card1.dataset.focused).toBe("true");
			expect(first.dataset.active).toBe("true");
		});

		// The card under the pointer marks its box instead.
		fireEvent.pointerEnter(screen.getByRole("article", { name: "Stamp 2" }));
		expect(second.dataset.active).toBe("true");
		expect(first.dataset.active).toBeUndefined();
		fireEvent.pointerLeave(screen.getByRole("article", { name: "Stamp 2" }));
		expect(first.dataset.active).toBe("true");
	});
});
