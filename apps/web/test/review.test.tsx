import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { AiClient, ImageQuestion } from "../src/ai/openrouter";
import { VoyputDb } from "../src/db/db";
import { setDismissed, updateStamp } from "../src/features/review/reviewStore";
import { seedDemo, stubObjectUrls } from "./fixtures/demo";
import { offlineAi, renderApp } from "./renderApp";

let dbCount = 0;

async function demoDb(): Promise<VoyputDb> {
	const db = new VoyputDb(`review-${++dbCount}`);
	await seedDemo(db);
	return db;
}

const card = (number: number) =>
	screen.findByRole("article", { name: `Stamp ${number}` });

describe("review", () => {
	beforeEach(() => stubObjectUrls());

	it("keeps the saved date when the date input is cleared", async () => {
		const db = await demoDb();
		const user = userEvent.setup();
		renderApp("/review", { db });
		const stamp = within(await card(1));
		await user.click(stamp.getByRole("button", { expanded: false }));
		fireEvent.change(stamp.getByLabelText("Date"), { target: { value: "" } });
		// A later write on the same table runs after any save the change started.
		await db.transaction("rw", db.stamps, async () => {});
		expect((await db.stamps.get("demo-stamp-01"))?.date).toBe("2016-08-10");
	});

	it("keeps an edited, reviewed stamp and undoes a delete", async () => {
		const db = await demoDb();
		const user = userEvent.setup();
		const first = renderApp("/review", { db });

		// page-1.png opens first; its earliest stamp is the Ukrainian exit of 10 Aug 2016.
		// Demo stamps come reviewed, so the card is folded: open it and unmark it.
		const stamp = within(await card(1));
		await user.click(stamp.getByRole("button", { expanded: false }));
		await user.click(stamp.getByRole("button", { name: "Undo reviewed" }));
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.reviewed).toBe(false),
		);
		fireEvent.change(stamp.getByLabelText("Date"), {
			target: { value: "2016-08-09" },
		});
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.date).toBe("2016-08-09"),
		);
		await user.click(stamp.getByRole("button", { name: "Mark reviewed" }));
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.reviewed).toBe(true),
		);

		first.unmount();
		renderApp("/review", { db });
		const again = within(await card(1));
		const toggle = again.getByRole("button", { expanded: false });
		expect(toggle.textContent).toContain("9 Aug 2016");
		expect(again.getByRole("img", { name: "Reviewed" })).toBeTruthy();

		// Delete sits inside the opened stamp.
		await user.click(
			within(await card(2)).getByRole("button", { expanded: false }),
		);
		await user.click(screen.getByRole("button", { name: "Delete stamp 2" }));
		const toast = await screen.findByRole("status");
		expect(toast.textContent).toContain("Spain, 10 Aug 2016");
		expect(await db.stamps.get("demo-stamp-02")).toBeUndefined();
		await user.click(within(toast).getByRole("button", { name: "Undo" }));
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-02"))?.country).toBe("Spain"),
		);
		expect(
			await db.stamps.where("passportId").equals("demo-passport").count(),
		).toBe(74);
	});

	it("ends an opened stamp with Mark reviewed, then a quiet undo", async () => {
		const db = await demoDb();
		await updateStamp(db, "demo-stamp-01", { reviewed: false });
		const user = userEvent.setup();
		renderApp("/review", { db });

		// An unreviewed stamp opens by itself.
		const stamp = within(await card(1));
		expect(stamp.getByRole("button", { expanded: true })).toBeTruthy();
		expect(stamp.queryByRole("img", { name: "Reviewed" })).toBeNull();
		expect(stamp.queryByRole("button", { name: "Undo reviewed" })).toBeNull();
		await user.click(stamp.getByRole("button", { name: "Mark reviewed" }));
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.reviewed).toBe(true),
		);

		// Reviewed: the card folds with a check on its row; opened, a quiet way back.
		expect(await stamp.findByRole("img", { name: "Reviewed" })).toBeTruthy();
		await user.click(stamp.getByRole("button", { expanded: false }));
		expect(stamp.queryByRole("button", { name: "Mark reviewed" })).toBeNull();
		await user.click(
			await stamp.findByRole("button", { name: "Undo reviewed" }),
		);
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.reviewed).toBe(false),
		);
		expect(
			await stamp.findByRole("button", { name: "Mark reviewed" }),
		).toBeTruthy();
	});

	it("keeps a pending field edit when Mark reviewed or Undo reviewed is clicked", async () => {
		const db = await demoDb();
		await updateStamp(db, "demo-stamp-01", { reviewed: false });
		const user = userEvent.setup();
		const first = renderApp("/review", { db });

		// Typed but not blurred: the click on Mark reviewed blurs and saves it.
		const stamp = within(await card(1));
		const location = stamp.getByLabelText("Location");
		await user.clear(location);
		await user.type(location, "Kyiv Boryspil");
		await user.click(stamp.getByRole("button", { name: "Mark reviewed" }));
		await waitFor(async () => {
			const saved = await db.stamps.get("demo-stamp-01");
			expect(saved?.location).toBe("Kyiv Boryspil");
			expect(saved?.reviewed).toBe(true);
		});

		// Same for Undo reviewed.
		await user.click(stamp.getByRole("button", { expanded: false }));
		const again = stamp.getByLabelText("Location");
		await user.clear(again);
		await user.type(again, "Lviv");
		await user.click(stamp.getByRole("button", { name: "Undo reviewed" }));
		await waitFor(async () => {
			const saved = await db.stamps.get("demo-stamp-01");
			expect(saved?.location).toBe("Lviv");
			expect(saved?.reviewed).toBe(false);
		});

		first.unmount();
		renderApp("/review", { db });
		const reopened = within(await card(1));
		expect(reopened.getByLabelText("Location")).toHaveProperty("value", "Lviv");
		expect(
			reopened.getByRole("button", { name: "Mark reviewed" }),
		).toBeTruthy();
		const stored = await db.stamps.get("demo-stamp-01");
		expect(stored?.location).toBe("Lviv");
		expect(stored?.reviewed).toBe(false);
	});

	it("uses the photo location window from Settings", async () => {
		const db = await demoDb();
		const user = userEvent.setup();
		const settings = renderApp("/settings", { db });
		fireEvent.change(
			await screen.findByLabelText("Photo location window: ± days"),
			{ target: { value: "4" } },
		);
		settings.unmount();

		renderApp("/review", { db });
		const stamp = within(await card(1));
		await user.click(stamp.getByRole("button", { expanded: false }));
		expect(stamp.getByText("Photo location history ±4 days")).toBeTruthy();
		expect(
			stamp
				.getByRole("slider", {
					name: "Stamp date on the photo location history",
				})
				.getAttribute("aria-valuetext"),
		).toBe("10 Aug 2016");
	});

	it("sets the stamp date from the photo location strip and resets it", async () => {
		const db = await demoDb();
		const user = userEvent.setup();
		const first = renderApp("/review", { db });
		const stamp = within(await card(1));
		await user.click(stamp.getByRole("button", { expanded: false }));
		const strip = () =>
			stamp.getByRole("slider", {
				name: "Stamp date on the photo location history",
			});
		strip().focus();
		await user.keyboard("{ArrowLeft}{ArrowLeft}");
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.date).toBe("2016-08-08"),
		);
		// A drag one day to the left picks the next day.
		const track = strip();
		track.getBoundingClientRect = () => ({ width: 210 }) as DOMRect;
		fireEvent.pointerDown(track, { pointerId: 1, clientX: 100, button: 0 });
		fireEvent.pointerMove(track, { pointerId: 1, clientX: 88 });
		fireEvent.pointerUp(track, { pointerId: 1, clientX: 88 });
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.date).toBe("2016-08-09"),
		);
		expect((await db.stamps.get("demo-stamp-01"))?.readDate).toBe("2016-08-10");

		first.unmount();
		renderApp("/review", { db });
		const again = within(await card(1));
		await user.click(again.getByRole("button", { expanded: false }));
		expect((again.getByLabelText("Date") as HTMLInputElement).value).toBe(
			"2016-08-09",
		);
		expect(again.getByText("Read as 10 Aug 2016")).toBeTruthy();
		await user.click(again.getByRole("button", { name: "Reset to read date" }));
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.date).toBe("2016-08-10"),
		);
	});

	it("adds a stamp found by a rescan", async () => {
		localStorage.setItem(
			"voyput:settings",
			JSON.stringify({ openRouterKey: "sk-or-test" }),
		);
		const db = await demoDb();
		const questions: ImageQuestion[] = [];
		const missed = {
			direction: "entry",
			borderCrossing: "car",
			dateText: "05.09.16 21",
			date: "2016-09-05",
			country: "Poland",
			countryCode: "PL",
			location: "Korczowa",
			confidence: 70,
			notes: "faint",
		};
		const ai: AiClient = {
			...offlineAi,
			askAboutImage: async (_settings, question) => {
				questions.push(question);
				const existing = (
					await db.stamps.where("photoId").equals("demo-photo-1").toArray()
				).map(
					({
						direction,
						borderCrossing,
						dateText,
						date,
						country,
						countryCode,
						location,
					}) => ({
						direction,
						borderCrossing,
						dateText,
						date,
						country,
						countryCode,
						location,
						confidence: 90,
					}),
				);
				return {
					cost: null,
					text: JSON.stringify({ notes: "", stamps: [...existing, missed] }),
				};
			},
		};
		const user = userEvent.setup();
		renderApp("/review", { db, ai });

		await card(1);
		await user.type(
			screen.getByLabelText("Hint for the rescan"),
			"bottom left corner",
		);
		await user.click(screen.getByRole("button", { name: "Rescan with AI" }));
		const found = await screen.findByRole("list", { name: "Missed stamps" });
		expect(within(found).getAllByRole("listitem")).toHaveLength(1);
		// The rescan hears what is already on the page, crossing method included.
		expect(questions[0]?.text).toContain("by plane");
		expect(questions[0]?.text).toContain("bottom left corner");

		await user.click(within(found).getByRole("button", { name: "Add" }));
		await waitFor(async () =>
			expect(
				await db.stamps.where("photoId").equals("demo-photo-1").count(),
			).toBe(8),
		);
		const added = (await db.stamps.toArray()).find(
			(s) => s.countryCode === "PL" && s.date === "2016-09-05",
		);
		expect(added?.borderCrossing).toBe("car");
		expect(await card(8)).toBeTruthy();
	});

	it("opens a stamp from the timeline on its photo", async () => {
		const db = await demoDb();
		const user = userEvent.setup();
		renderApp("/review", { db });

		await card(1);
		await user.click(screen.getByRole("tab", { name: "Timeline" }));
		const chronology = await screen.findByRole("list", {
			name: "Stamps by date",
		});
		await user.click(
			within(chronology).getByRole("button", {
				name: "Open stamp: 2017-06-15 entry Georgia",
			}),
		);

		expect(
			await screen.findByRole("heading", { name: /page-2\.png/ }),
		).toBeTruthy();
		// Page 2 opens on its third stamp, after the Ukrainian exit of the same day.
		const opened = within(await card(3));
		expect(
			opened.getByRole("button", { expanded: true }).textContent,
		).toContain("15 Jun 2017");
	});

	it("keeps both of two overlapping saves", async () => {
		const db = await demoDb();
		await Promise.all([
			updateStamp(db, "demo-stamp-01", { location: "Boryspil" }),
			updateStamp(db, "demo-stamp-01", { reviewed: false }),
			setDismissed(db, "demo-stamp-01", "icloudCheck", true),
		]);
		const stamp = await db.stamps.get("demo-stamp-01");
		expect(stamp?.location).toBe("Boryspil");
		expect(stamp?.reviewed).toBe(false);
		expect(stamp?.dismissed).toEqual({ icloudCheck: true });
	});
});
