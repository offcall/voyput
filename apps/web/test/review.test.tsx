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

	it("keeps an edited, reviewed stamp and undoes a delete", async () => {
		const db = await demoDb();
		const user = userEvent.setup();
		const first = renderApp("/review", { db });

		// page-1.png opens first; its earliest stamp is the Ukrainian exit of 10 Aug 2016.
		// Demo stamps come reviewed, so the card is folded: open it and unmark it.
		const stamp = within(await card(1));
		await user.click(stamp.getByRole("button", { expanded: false }));
		await user.click(stamp.getByRole("checkbox", { name: "Reviewed" }));
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.reviewed).toBe(false),
		);
		fireEvent.change(stamp.getByLabelText("Date"), {
			target: { value: "2016-08-09" },
		});
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.date).toBe("2016-08-09"),
		);
		await user.click(stamp.getByRole("checkbox", { name: "Reviewed" }));
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-01"))?.reviewed).toBe(true),
		);

		first.unmount();
		renderApp("/review", { db });
		const again = within(await card(1));
		const toggle = again.getByRole("button", { expanded: false });
		expect(toggle.textContent).toContain("2016-08-09");
		expect(again.getByText("reviewed")).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Delete stamp 2" }));
		const toast = await screen.findByRole("status");
		expect(toast.textContent).toContain("Spain, 2016-08-10");
		expect(await db.stamps.get("demo-stamp-02")).toBeUndefined();
		await user.click(within(toast).getByRole("button", { name: "Undo" }));
		await waitFor(async () =>
			expect((await db.stamps.get("demo-stamp-02"))?.country).toBe("Spain"),
		);
		expect(await db.stamps.count()).toBe(16);
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
			).toBe(5),
		);
		const added = (await db.stamps.toArray()).find(
			(s) => s.countryCode === "PL" && s.date === "2016-09-05",
		);
		expect(added?.borderCrossing).toBe("car");
		expect(await card(5)).toBeTruthy();
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
				name: "Open stamp: 2017-05-03 entry Poland",
			}),
		);

		expect(
			await screen.findByRole("heading", { name: /page-2\.png/ }),
		).toBeTruthy();
		const opened = within(await card(2));
		expect(
			opened.getByRole("button", { expanded: true }).textContent,
		).toContain("2017-05-03");
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
