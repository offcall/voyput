import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CheckedStamp, Stamp } from "@voyput/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AiClient } from "../src/ai/openrouter";
import { VoyputDb } from "../src/db/db";
import {
	buildQueue,
	nextInQueue,
	viewFromStored,
} from "../src/features/review/queue";
import { stubObjectUrls } from "./fixtures/demo";
import { offlineAi, renderApp } from "./renderApp";

const stamp = (
	id: string,
	photoId: string,
	date: string,
	{ reviewed = true, problem = null as string | null } = {},
): Stamp => ({
	id,
	passportId: "p1",
	photoId,
	direction: "entry",
	borderCrossing: "plane",
	dateText: date,
	date,
	country: "Romania",
	countryCode: "RO",
	location: null,
	confidence: 90,
	notes: "",
	problem,
	source: "ai",
	reviewed,
});

const checked = (s: Stamp): CheckedStamp => ({
	stamp: s,
	check: { icloudCheck: "", suggestion: "" },
});

describe("review queue order", () => {
	const pages: Record<string, CheckedStamp[]> = {
		a: [
			stamp("a1", "a", "2020-01-01"),
			stamp("a2", "a", "2020-01-02", { reviewed: false }),
		].map(checked),
		b: [],
		c: [
			stamp("c1", "c", "2020-02-01", { problem: "date check" }),
			stamp("c2", "c", "2020-02-02"),
		].map(checked),
	};
	const ids = ["a", "b", "c"];
	const stampsOf = (id: string) => pages[id] ?? [];
	const next = (photoId: string, stampId: string | null) =>
		nextInQueue(ids, stampsOf, { photoId, stampId })?.stamp.id;

	it("holds unreviewed stamps and open warnings, in page order", () => {
		expect(buildQueue(ids, stampsOf).map((i) => i.stamp.id)).toEqual([
			"a2",
			"c1",
		]);
	});

	it("walks from a stamp or a page to the next stamp needing attention and starts over", () => {
		expect(next("a", null)).toBe("a2");
		expect(next("a", "a2")).toBe("c1");
		expect(next("b", null)).toBe("c1");
		expect(next("c", "c1")).toBe("a2");
		// A stamp just marked fine still marks the place.
		expect(next("c", "c2")).toBe("a2");
		expect(nextInQueue(ids, () => [], null)).toBeNull();
	});

	it("keeps the stored filters, the problem ones included", () => {
		expect(viewFromStored("problem")).toBe("problem");
		expect(viewFromStored("icloud")).toBe("icloud");
		expect(viewFromStored("attention")).toBe("attention");
		expect(viewFromStored("reviewed")).toBe("reviewed");
		expect(viewFromStored("nope")).toBeNull();
	});
});

let dbCount = 0;

/** Two pages: page-1 with one stamp to review, page-2 with one flagged stamp. */
async function seed(): Promise<VoyputDb> {
	const db = new VoyputDb(`review-queue-${++dbCount}`);
	await db.passports.put({
		id: "p1",
		name: "Blue",
		validFrom: null,
		validTo: null,
		createdAt: "2024-01-01T00:00:00Z",
	});
	for (const name of ["page-1.png", "page-2.png"])
		await db.photos.put({
			id: name,
			passportId: "p1",
			name,
			mimeType: "image/png",
			rotation: 0,
			addedAt: "2024-01-01T00:00:00Z",
			blob: new Blob(["x"], { type: "image/png" }),
		});
	await db.stamps.bulkPut([
		stamp("s1", "page-1.png", "2020-01-01"),
		stamp("s2", "page-1.png", "2020-01-05", { reviewed: false }),
		stamp("s3", "page-2.png", "2020-02-01", {
			problem: "date check: printed year differs",
		}),
	]);
	return db;
}

describe("review queue", () => {
	beforeEach(() => stubObjectUrls());

	it("walks the stamps needing attention across pages with Next, then leads to Stays", async () => {
		const db = await seed();
		const user = userEvent.setup();
		renderApp("/collect/review", { db });
		const queue = within(
			await screen.findByRole("region", { name: "Review queue" }),
		);
		await queue.findByText("2 to check");

		await user.click(queue.getByRole("button", { name: "Next →" }));
		await queue.findByText("To check 1 / 2");
		expect(
			await screen.findByRole("heading", { name: /page-1\.png/ }),
		).toBeTruthy();

		await user.click(queue.getByRole("button", { name: "Next →" }));
		await queue.findByText("To check 2 / 2");
		expect(
			await screen.findByRole("heading", { name: /page-2\.png/ }),
		).toBeTruthy();
		// The warning shows under the stamp row with its one-click answer.
		await user.click(screen.getByRole("button", { name: "Check looks right" }));
		await queue.findByText("1 to check");

		await user.click(queue.getByRole("button", { name: "Next →" }));
		expect(
			await screen.findByRole("heading", { name: /page-1\.png/ }),
		).toBeTruthy();
		await queue.findByText("To check 1 / 1");
		await db.stamps.update("s2", { reviewed: true });
		await queue.findByText("All checked ✓");
		expect(
			queue.getByRole("link", { name: "Go to Stays →" }).getAttribute("href"),
		).toBe("/collect/trips");
	});

	it("moves on from an opened stamp with its own Next, beside Mark reviewed", async () => {
		const db = await seed();
		const user = userEvent.setup();
		renderApp("/collect/review", { db });
		const queue = within(
			await screen.findByRole("region", { name: "Review queue" }),
		);
		// s2 is unreviewed, so its card is open with the main action and Next.
		const open = within(
			await screen.findByRole("article", { name: "Stamp 2" }),
		);
		expect(open.getByRole("button", { name: "Mark reviewed" })).toBeTruthy();
		await user.click(open.getByRole("button", { name: "Next →" }));
		expect(
			await screen.findByRole("heading", { name: /page-2\.png/ }),
		).toBeTruthy();
		await queue.findByText("To check 2 / 2");
	});

	it("shows pages through one select that remembers its choice", async () => {
		const db = await seed();
		const user = userEvent.setup();
		const first = renderApp("/collect/review", { db });
		const select = await screen.findByRole("combobox", { name: "Pages" });
		expect((select as HTMLSelectElement).value).toBe("attention");
		const strip = () =>
			within(screen.getByRole("navigation", { name: "Review photos" }));
		await waitFor(() => expect(strip().getAllByRole("button")).toHaveLength(2));
		// Only page-2 has every stamp reviewed (its warning stays open).
		// The problem filters stay apart from "needs attention".
		await user.selectOptions(select, "problem");
		await waitFor(() => expect(strip().getAllByRole("button")).toHaveLength(1));
		await user.selectOptions(select, "icloud");
		await waitFor(() =>
			expect(strip().queryAllByRole("button")).toHaveLength(0),
		);
		await user.selectOptions(select, "reviewed");
		await waitFor(() => expect(strip().getAllByRole("button")).toHaveLength(1));
		expect(
			within(select).getByRole("option", { name: "All pages (2)" }),
		).toBeTruthy();
		first.unmount();

		renderApp("/collect/review", { db });
		await waitFor(async () =>
			expect(
				(
					(await screen.findByRole("combobox", {
						name: "Pages",
					})) as HTMLSelectElement
				).value,
			).toBe("reviewed"),
		);
	});

	it("keeps a page's rescan finds while Next walks on", async () => {
		localStorage.setItem(
			"voyput:settings",
			JSON.stringify({ openRouterKey: "sk-or-test" }),
		);
		const db = await seed();
		const found = (date: string, countryCode: string, country: string) => ({
			direction: "entry",
			borderCrossing: "car",
			dateText: date,
			date,
			country,
			countryCode,
			location: null,
			confidence: 70,
		});
		const ai: AiClient = {
			...offlineAi,
			askAboutImage: async () => ({
				cost: null,
				text: JSON.stringify({
					notes: "",
					stamps: [
						found("2020-03-01", "PL", "Poland"),
						found("2020-04-01", "HU", "Hungary"),
					],
				}),
			}),
		};
		const user = userEvent.setup();
		renderApp("/collect/review", { db, ai });
		const queue = within(
			await screen.findByRole("region", { name: "Review queue" }),
		);
		await queue.findByText("2 to check");
		await user.click(screen.getByRole("button", { name: "Rescan with AI" }));
		const finds = () => screen.findByRole("list", { name: "Missed stamps" });
		expect(within(await finds()).getAllByRole("listitem")).toHaveLength(2);
		await user.click(
			within(await finds()).getAllByRole("button", {
				name: "Add",
			})[0] as HTMLElement,
		);
		await waitFor(async () =>
			expect(
				await db.stamps.where("photoId").equals("page-1.png").count(),
			).toBe(3),
		);

		// Next on the same page keeps the remaining find.
		await user.click(queue.getByRole("button", { name: "Next →" }));
		await screen.findByRole("heading", { name: /page-1\.png/ });
		expect(within(await finds()).getAllByRole("listitem")).toHaveLength(1);
		// So does walking to another page and back.
		while (!screen.queryByRole("heading", { name: /page-2\.png/ }))
			await user.click(queue.getByRole("button", { name: "Next →" }));
		await user.click(
			within(
				screen.getByRole("navigation", { name: "Review photos" }),
			).getByRole("button", { name: /page-1\.png/ }),
		);
		await user.click(
			within(await finds()).getByRole("button", { name: "Add" }),
		);
		await waitFor(async () =>
			expect(
				await db.stamps.where("photoId").equals("page-1.png").count(),
			).toBe(4),
		);
	});
});

afterEach(() => localStorage.removeItem("voyput:settings"));
