import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LocationRow, Stamp } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { renderApp } from "./renderApp";

const photo = (
	day: string,
	countryCode: string,
	country: string,
	city = "",
): LocationRow => ({
	date: `${day}T12:00:00+02:00`,
	lat: 0,
	lon: 0,
	countryCode,
	country,
	city,
	source: "apple",
	isVideo: false,
	filename: `IMG_${day}_${countryCode}.jpg`,
	uuid: `${day}-${countryCode}`,
});

const stamp = (
	id: string,
	date: string,
	countryCode: string,
	country: string,
	direction: Stamp["direction"],
	location: string,
): Stamp => ({
	id,
	passportId: "p1",
	photoId: "ph1",
	direction,
	borderCrossing: "plane",
	dateText: date,
	date,
	country,
	countryCode,
	location,
	confidence: 95,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: true,
});

/** Photos in Moldova, a stamped stay in Romania, one in Japan with photos only. */
async function seed(db: VoyputDb) {
	const home = ["01", "02", "03", "04", "05", "06", "07", "08"].map((d) =>
		photo(`2024-01-${d}`, "MD", "Moldova", "Chișinău"),
	);
	await db.locations.bulkPut([
		...home,
		photo("2024-02-29", "MD", "Moldova", "Chișinău"),
		photo("2024-03-02", "RO", "Romania", "Bucharest"),
		photo("2024-03-03", "RO", "Romania", "Brașov"),
		photo("2024-03-10", "MD", "Moldova", "Chișinău"),
		photo("2024-05-10", "JP", "Japan", "Tokyo"),
		photo("2024-05-11", "JP", "Japan", "Kyoto"),
		photo("2024-05-20", "MD", "Moldova", "Chișinău"),
	]);
	await db.stamps.bulkPut([
		stamp("s1", "2024-03-01", "MD", "Moldova", "exit", "Chișinău Airport"),
		stamp("s2", "2024-03-01", "RO", "Romania", "entry", "Otopeni"),
		stamp("s3", "2024-03-05", "RO", "Romania", "exit", "Otopeni"),
		stamp("s4", "2024-03-05", "MD", "Moldova", "entry", "Chișinău Airport"),
	]);
}

type User = ReturnType<typeof userEvent.setup>;

/** The action bar: "1 ready · 4 to check · 0 errors". */
const summary = () =>
	document.querySelector(".vp-stays-summary")?.textContent ?? "";

/** The panel beside the list while no stay is selected: "5 stays · 3 countries · 0 approved". */
const totals = () =>
	document.querySelector(".vp-trips-empty p")?.textContent ?? "";

/** A stay's row button, by its number and country. */
const row = (n: number, country: string) =>
	screen.findByRole("button", { name: new RegExp(`^${n}\\. ${country},`) });

/** Opens a stay in the panel. */
async function open(user: User, n: number, country: string) {
	await user.click(await row(n, country));
	return within(
		await screen.findByRole("region", { name: `Stay: ${country}` }),
	);
}

/** Picks an item of the "⋯" menu. */
async function more(user: User, item: string | RegExp) {
	await user.click(screen.getByRole("button", { name: "More stay actions" }));
	const menu = within(screen.getByRole("menu"));
	await user.click(
		menu.queryByRole("menuitemradio", { name: item }) ??
			menu.getByRole("menuitem", { name: item }),
	);
}

/** The toast's button after a change ("Undo") or an undo ("Redo"). */
const toastButton = (name: "Undo" | "Redo") =>
	within(screen.getByRole("status")).getByRole("button", { name });

/** A touch pointer at a point. */
const touch = (clientX: number, clientY: number) => ({
	clientX,
	clientY,
	pointerId: 7,
	pointerType: "touch",
	button: 0,
});

/** The open sheet's head, where swipes start. */
const sheetHead = (country: string) => {
	const head = screen
		.getByRole("region", { name: `Stay: ${country}` })
		.querySelector<HTMLElement>(".vp-trips-detail-head");
	if (!head) throw new Error("no sheet head");
	return head;
};

/** A touch drag on an element, from (100, 20) by (dx, dy). */
function swipe(el: HTMLElement, dx: number, dy: number) {
	fireEvent.pointerDown(el, touch(100, 20));
	fireEvent.pointerMove(el, touch(100 + dx / 2, 20 + dy / 2));
	fireEvent.pointerUp(el, touch(100 + dx, 20 + dy));
}

/** Touch pointer events and a narrow screen (the panel is a sheet); returns the undo. */
function touchSheet() {
	const had = { pointer: window.PointerEvent, media: window.matchMedia };
	class TouchPointer extends MouseEvent {
		pointerId: number;
		pointerType: string;
		constructor(type: string, init: PointerEventInit = {}) {
			super(type, init);
			this.pointerId = init.pointerId ?? 0;
			this.pointerType = init.pointerType ?? "";
		}
	}
	window.PointerEvent = TouchPointer as unknown as typeof PointerEvent;
	window.matchMedia = (query: string) =>
		({
			matches: query === "(max-width: 1179px)",
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}) as MediaQueryList;
	return () => {
		window.PointerEvent = had.pointer;
		window.matchMedia = had.media;
	};
}

/** Stay numbers in the order the list shows them. */
const shownNumbers = () =>
	[...document.querySelectorAll(".vp-stays .vp-stay")].map((n) =>
		Number.parseInt(n.getAttribute("aria-label") ?? "", 10),
	);

async function storedStays(db: VoyputDb) {
	const stays = await db.stays.toArray();
	return stays.sort((a, b) =>
		(a.arrival.date ?? "").localeCompare(b.arrival.date ?? ""),
	);
}

/** Sets the birth country and date on the Settings page. */
async function setBirth(
	user: User,
	db: VoyputDb,
	country: string,
	date: string,
) {
	const view = renderApp("/settings", { db });
	const card = within(
		(await screen.findByRole("heading", { name: "Profile" })).closest(
			".vp-card",
		) as HTMLElement,
	);
	await user.selectOptions(
		await card.findByRole("combobox", { name: "Birth country" }),
		country,
	);
	fireEvent.change(card.getByLabelText("Birth date"), {
		target: { value: date },
	});
	await waitFor(async () =>
		expect((await db.kv.get("trips:birth"))?.value).toBe(date || undefined),
	);
	view.unmount();
}

describe("trips", () => {
	it("lists calm rows with a status, approves the ready ones, and undoes from the toast", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-list");
		await seed(db);
		const first = renderApp("/collect/trips", { db });

		// The first stay begins with the first photo, not "since birth".
		const moldova = await row(1, "Moldova");
		expect(moldova.textContent).toContain("1 Jan → 1 Mar 2024");
		expect(moldova.textContent).toContain("Chișinău");
		expect(moldova.getAttribute("aria-label")).toMatch(/needs a look$/);
		// A row only selects: every edit control is in the panel.
		expect(within(moldova).queryAllByRole("combobox")).toHaveLength(0);
		expect(within(moldova).queryAllByRole("button")).toHaveLength(0);
		expect(screen.queryByRole("button", { name: /^Delete stay/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /^Split stay/ })).toBeNull();
		expect(screen.queryByRole("combobox", { name: /method/ })).toBeNull();

		expect(screen.getByText(/Your first change saves it/)).toBeTruthy();
		const romania = await row(2, "Romania");
		expect(romania.textContent).toContain("1 → 5 Mar 2024");
		expect(romania.textContent).toContain("5 days");
		expect(romania.getAttribute("aria-label")).toMatch(/ready$/);
		expect((await row(4, "Japan")).textContent).toContain("10 → 20 May 2024");
		expect((await row(5, "Moldova")).textContent).toContain("now");
		expect(screen.queryByText(/Home/)).toBeNull();
		expect(summary()).toBe("1 ready · 4 to check · 0 errors");
		expect(totals()).toBe("5 stays · 3 countries · 0 approved");
		expect(await db.stays.count()).toBe(0);

		// Only Romania has stamps on both edges.
		await user.click(screen.getByRole("button", { name: "✓ Approve 1" }));
		expect(screen.getByRole("status").textContent).toContain("Approved 1 stay");
		expect(summary()).toBe("0 ready · 4 to check · 0 errors · 1 approved");
		await waitFor(async () =>
			expect((await storedStays(db)).map((s) => s.approved)).toEqual([
				false,
				true,
				false,
				false,
				false,
			]),
		);
		await user.click(toastButton("Undo"));
		expect(summary()).toBe("1 ready · 4 to check · 0 errors");
		await waitFor(async () =>
			expect((await storedStays(db)).some((s) => s.approved)).toBe(false),
		);
		await user.click(toastButton("Redo"));
		expect(totals()).toBe("5 stays · 3 countries · 1 approved");
		await waitFor(async () =>
			expect((await storedStays(db))[1]?.approved).toBe(true),
		);
		first.unmount();

		renderApp("/collect/trips", { db });
		expect((await row(2, "Romania")).getAttribute("aria-label")).toMatch(
			/approved$/,
		);
		expect(totals()).toBe("5 stays · 3 countries · 1 approved");
		expect(screen.queryByText(/Your first change saves it/)).toBeNull();
	});

	it("counts photos that meet across a border as ready and walks the rest one by one", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-queue");
		const days = (from: number, to: number, cc: string, name: string) =>
			Array.from({ length: to - from + 1 }, (_, k) =>
				photo(`2024-01-${String(from + k).padStart(2, "0")}`, cc, name),
			);
		await db.locations.bulkPut([
			...days(1, 5, "TH", "Thailand"),
			...days(6, 9, "LA", "Laos"),
			...days(10, 12, "KH", "Cambodia"),
			// Seven days without photos before Vietnam.
			...days(20, 22, "VN", "Vietnam"),
		]);
		renderApp("/collect/trips", { db });

		// Laos: the last photo in Thailand and the first in Laos are a day apart,
		// as are the last in Laos and the first in Cambodia.
		expect((await row(2, "Laos")).getAttribute("aria-label")).toMatch(/ready$/);
		expect(summary()).toBe("1 ready · 3 to check · 0 errors");
		expect(screen.getByRole("button", { name: "✓ Approve 1" })).toBeTruthy();
		const travels = screen.getAllByRole("link", { name: /travels →$/ });
		expect(travels[0]?.getAttribute("href")).toBe("/insights/journey");
		expect(travels[0]?.dataset.variant).toBe("ghost");

		// With no stay open, the panel offers the first to check, newest first.
		// (jsdom shows both the panel and the note above the list for narrow screens.)
		const next = screen.getAllByText(/3 stays to check\./);
		expect(next).toHaveLength(2);
		expect(next[0]?.parentElement?.textContent).toContain("Next: 🇻🇳 Vietnam");
		const [checkFirst] = screen.getAllByRole("button", {
			name: "Check the first one →",
		});
		if (!checkFirst) throw new Error("no Check the first one button");
		await user.click(checkFirst);
		let panel = within(
			await screen.findByRole("region", { name: "Stay: Vietnam" }),
		);
		// (jsdom shows the top row and the sheet head alike: two counts, two buttons.)
		expect(panel.getAllByText("1 / 3 to check")).toHaveLength(2);
		expect(panel.queryByRole("button", { name: "✓ Approve" })).toBeNull();

		await user.click(
			panel.getAllByRole("button", { name: "Skip →" })[0] as HTMLElement,
		);
		panel = within(
			await screen.findByRole("region", { name: "Stay: Cambodia" }),
		);
		expect(panel.getAllByText("2 / 3 to check")).toHaveLength(2);
		await user.type(panel.getByRole("textbox", { name: "Place" }), "Siem Reap");
		await user.click(
			panel.getAllByRole("button", {
				name: "✓ Approve & next",
			})[0] as HTMLElement,
		);

		// Cambodia is approved with the place typed, and Thailand opens.
		panel = within(
			await screen.findByRole("region", { name: "Stay: Thailand" }),
		);
		expect(panel.getAllByText("2 / 2 to check")).toHaveLength(2);
		await waitFor(async () => {
			const cambodia = (await storedStays(db)).find(
				(s) => s.countryCode === "KH",
			);
			expect(cambodia).toMatchObject({ approved: true, place: "Siem Reap" });
		});

		// Once nothing is ready, the way to the results is the main button.
		await user.click(screen.getByRole("button", { name: "✓ Approve 1" }));
		expect(screen.queryByRole("button", { name: /^✓ Approve \d/ })).toBeNull();
		expect(
			screen.getAllByRole("link", { name: /travels →$/ })[0]?.dataset.variant,
		).toBe("primary");
	});

	it("marks a transit, edits methods and deletes in the panel; undo and redo by keyboard and menu", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-edit");
		await seed(db);
		renderApp("/collect/trips", { db });

		const japan = await open(user, 4, "Japan");
		await user.click(japan.getByRole("button", { name: "Transit" }));
		await user.selectOptions(
			japan.getByRole("combobox", { name: "Arrival method" }),
			"plane",
		);
		await waitFor(async () =>
			expect((await storedStays(db))[3]).toMatchObject({
				countryCode: "JP",
				kind: "transit",
				arrival: { method: "plane" },
			}),
		);
		// A transit is passed through: Japan no longer counts.
		await user.click(japan.getByRole("button", { name: "Close the stay" }));
		expect(totals()).toBe("5 stays · 2 countries · 0 approved");

		const romania = await open(user, 2, "Romania");
		await user.click(romania.getByRole("button", { name: "Delete stay 2" }));
		expect(
			screen.queryByRole("button", { name: /^\d+\. Romania,/ }),
		).toBeNull();
		expect(screen.getByRole("status").textContent).toContain("Deleted Romania");
		await waitFor(async () => expect(await db.stays.count()).toBe(4));
		await user.keyboard("{Control>}z{/Control}");
		expect(await row(2, "Romania")).toBeTruthy();
		await waitFor(async () => expect(await db.stays.count()).toBe(5));
		await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
		await waitFor(async () => expect(await db.stays.count()).toBe(4));
		await more(user, "Undo");
		await waitFor(async () => expect(await db.stays.count()).toBe(5));
		await more(user, "Redo");
		await waitFor(async () => expect(await db.stays.count()).toBe(4));
	});

	it("keeps the toast's Undo when a field saves on blur as it is clicked", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-toast-blur");
		await seed(db);
		renderApp("/collect/trips", { db });

		const japan = await open(user, 4, "Japan");
		await user.click(japan.getByRole("button", { name: "Transit" }));
		expect(screen.getByRole("status").textContent).toContain("Changed Japan");
		await user.type(japan.getByDisplayValue("Tokyo, Kyoto"), ", Nara");
		// The click blurs Place first, which saves it; Undo then takes that back.
		await user.click(toastButton("Undo"));
		await waitFor(async () =>
			expect((await storedStays(db))[3]).toMatchObject({
				place: "Tokyo, Kyoto",
				kind: "transit",
			}),
		);
		expect(screen.getByRole("status").textContent).toContain("Undone");
	});

	it("edits a stay's dates in the panel and shows its hints there", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-detail");
		await seed(db);
		const { router } = renderApp("/collect/trips", { db });

		const detail = await open(user, 4, "Japan");
		await waitFor(() =>
			expect(router.state.location.pathname).toMatch(
				/^\/collect\/trips\/stay-/,
			),
		);
		expect(detail.getByDisplayValue("Tokyo, Kyoto")).toBeTruthy();

		const arrival = detail.getByLabelText("Arrival date");
		fireEvent.change(arrival, { target: { value: "2024-05-12" } });
		expect(await detail.findByText(/Long travel window/)).toBeTruthy();
		expect(detail.getByText("Set by hand")).toBeTruthy();

		fireEvent.change(arrival, { target: { value: "2024-05-01" } });
		expect(await detail.findByText(/Overlap/)).toBeTruthy();
		expect(summary()).toContain("1 error");
		expect((await row(4, "Japan")).getAttribute("aria-label")).toMatch(
			/has an error$/,
		);
		// In the review queue, Approve & next is the one approve button.
		expect(
			detail
				.getAllByRole<HTMLButtonElement>("button", { name: "✓ Approve & next" })
				.every((b) => b.disabled),
		).toBe(true);

		await user.click(
			detail.getByRole("button", { name: /Use previous departure/ }),
		);
		expect(screen.queryByText(/Overlap/)).toBeNull();
		expect(summary()).toContain("0 errors");
		await waitFor(async () =>
			expect((await storedStays(db))[3]?.arrival).toMatchObject({
				date: "2024-05-10",
				source: "manual",
			}),
		);
		await user.click(
			detail.getAllByRole("button", {
				name: "✓ Approve & next",
			})[0] as HTMLElement,
		);
		await waitFor(async () =>
			expect((await storedStays(db))[3]?.approved).toBe(true),
		);
		// Out of the queue, the panel's one button reopens it.
		const japan = await open(user, 4, "Japan");
		expect(japan.getByRole("button", { name: "↩ Reopen" })).toBeTruthy();
		expect(japan.queryByRole("button", { name: /Approve & next/ })).toBeNull();
	});

	it("takes the birth country and date from Settings: the first stay is there since birth", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-settings");
		await seed(db);

		// Nothing stored yet: the suggestion picks the setting up.
		await setBirth(user, db, "MD", "1997-05-21");
		expect((await db.kv.get("trips:birthCountry"))?.value).toBe("MD");
		const first = renderApp("/collect/trips", { db });
		expect((await row(1, "Moldova")).textContent).toContain(
			"21 May 1997 → 1 Jan 2024",
		);
		expect((await row(2, "Moldova")).textContent).toContain("1 Jan → 1 Mar");
		expect(totals()).toContain("6 stays");
		expect(screen.queryByText(/Born in/)?.textContent).toMatch(
			/Born in 🇲🇩 Moldova · 21 May 1997/,
		);
		expect(
			screen
				.getByRole("link", { name: "Change in Settings" })
				.getAttribute("href"),
		).toBe("/settings");
		await user.click(screen.getByRole("button", { name: /^✓ Approve/ }));
		await waitFor(async () => expect(await db.stays.count()).toBe(6));
		first.unmount();

		// A stored history: a new country moves the stay since birth.
		await setBirth(user, db, "RO", "1997-05-21");
		await waitFor(async () =>
			expect((await storedStays(db))[0]).toMatchObject({
				countryCode: "RO",
				sinceBirth: true,
			}),
		);
		// Clearing the date removes it.
		await setBirth(user, db, "RO", "");
		await waitFor(async () => expect(await db.stays.count()).toBe(5));
		renderApp("/collect/trips", { db });
		expect((await row(1, "Moldova")).textContent).toContain("1 Jan → 1 Mar");
	});

	it("undoes an approved stay since birth removed in Settings, with its approval", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-birth-undo");
		await seed(db);
		await setBirth(user, db, "MD", "1997-05-21");
		const first = renderApp("/collect/trips", { db });
		expect((await row(1, "Moldova")).textContent).toContain("21 May 1997");
		// Storing the history; the stay since birth stays a suggestion that follows the setting.
		await user.click(screen.getByRole("button", { name: /^✓ Approve \d/ }));
		await waitFor(async () => expect(await db.stays.count()).toBe(6));
		first.unmount();
		const [birthStay] = await storedStays(db);
		if (!birthStay?.sinceBirth || birthStay.edited)
			throw new Error("no birth stay");
		await db.stays.update(birthStay.id, { approved: true });

		renderApp("/settings", { db });
		fireEvent.change(await screen.findByLabelText("Birth date"), {
			target: { value: "" },
		});
		await waitFor(async () => expect(await db.stays.count()).toBe(5));
		expect(screen.getByRole("status").textContent).toContain(
			"Cleared birth date",
		);
		await user.click(toastButton("Undo"));
		await waitFor(async () =>
			expect((await storedStays(db))[0]).toMatchObject({
				countryCode: "MD",
				sinceBirth: true,
				approved: true,
			}),
		);
		expect((await db.kv.get("trips:birth"))?.value).toBe("1997-05-21");
		expect(screen.getByLabelText<HTMLInputElement>("Birth date").value).toBe(
			"1997-05-21",
		);
		await user.click(toastButton("Redo"));
		await waitFor(async () => expect(await db.stays.count()).toBe(5));
		expect(await db.kv.get("trips:birth")).toBeUndefined();
	});

	it("leaves a stay since birth the user edited when the birth setting changes", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-birth-edited");
		await seed(db);
		await db.kv.bulkPut([
			{ key: "trips:birth", value: "1997-05-21" },
			{ key: "trips:birthCountry", value: "MD" },
		]);
		const first = renderApp("/collect/trips", { db });

		expect((await row(1, "Moldova")).textContent).toContain("21 May 1997");
		const birthStay = await open(user, 1, "Moldova");
		await user.click(birthStay.getByRole("button", { name: "Transit" }));
		await waitFor(async () => expect(await db.stays.count()).toBe(6));
		first.unmount();

		await setBirth(user, db, "RO", "1997-05-21");
		renderApp("/collect/trips", { db });
		expect((await row(1, "Moldova")).textContent).toContain("21 May 1997");
		expect(
			screen.queryByRole("button", { name: /^\d+\. Romania, 21 May/ }),
		).toBeNull();
	});

	it("groups stays by year: the newest two open, older ones folded with a count", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-years");
		await db.locations.bulkPut([
			photo("2017-06-01", "FR", "France", "Paris"),
			photo("2019-06-01", "ES", "Spain", "Madrid"),
			photo("2021-06-01", "IT", "Italy", "Rome"),
			photo("2023-06-01", "DE", "Germany", "Berlin"),
		]);
		renderApp("/collect/trips", { db });

		const year = (y: string) =>
			screen.getByRole("button", { name: new RegExp(`^${y}`) });
		await row(4, "Germany");
		expect(year("2023").getAttribute("aria-expanded")).toBe("true");
		expect(year("2021").getAttribute("aria-expanded")).toBe("true");
		expect(year("2019").getAttribute("aria-expanded")).toBe("false");
		expect(year("2019").textContent).toContain("1 stay");
		expect(year("2017").getAttribute("aria-expanded")).toBe("false");
		expect(shownNumbers()).toEqual([4, 3]);

		await user.click(year("2019"));
		expect(shownNumbers()).toEqual([4, 3, 2]);
		await user.click(year("2023"));
		expect(shownNumbers()).toEqual([3, 2]);
	});

	it("opens the year of a stay selected by its URL", async () => {
		const db = new VoyputDb("trips-years-url");
		await db.locations.bulkPut([
			photo("2017-06-01", "FR", "France", "Paris"),
			photo("2019-06-01", "ES", "Spain", "Madrid"),
			photo("2021-06-01", "IT", "Italy", "Rome"),
			photo("2023-06-01", "DE", "Germany", "Berlin"),
		]);
		renderApp("/collect/trips/stay-2017-06-01-fr", { db });
		expect(
			await screen.findByRole("region", { name: "Stay: France" }),
		).toBeTruthy();
		expect((await row(1, "France")).getAttribute("aria-pressed")).toBe("true");
	});

	it("moves to the stays around the open one with arrows and closes from the backdrop", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-sheet");
		await seed(db);
		renderApp("/collect/trips", { db });

		const first = await open(user, 1, "Moldova");
		expect(
			first.getByRole<HTMLButtonElement>("button", { name: "Previous stay" })
				.disabled,
		).toBe(true);
		await user.click(first.getByRole("button", { name: "Next stay" }));
		const romania = within(
			await screen.findByRole("region", { name: "Stay: Romania" }),
		);
		expect(romania.getByText(/1 → 5 Mar 2024/)).toBeTruthy();
		await user.click(romania.getByRole("button", { name: "Previous stay" }));
		await screen.findByRole("region", { name: "Stay: Moldova" });

		const last = await open(user, 5, "Moldova");
		expect(
			last.getByRole<HTMLButtonElement>("button", { name: "Next stay" })
				.disabled,
		).toBe(true);
		// An approve button is in the panel whatever the screen width.
		expect(
			last.getAllByRole("button", { name: "✓ Approve & next" }).length,
		).toBeGreaterThan(0);

		const backdrop = document.querySelector(".vp-trips-backdrop");
		expect(backdrop).not.toBeNull();
		await user.click(backdrop as Element);
		await waitFor(() =>
			expect(screen.queryByRole("region", { name: /^Stay:/ })).toBeNull(),
		);
		expect(document.querySelector(".vp-trips-backdrop")).toBeNull();
	});

	it("saves a typed place before a touch swipe switches or closes the sheet; a cancelled swipe does nothing", async () => {
		// jsdom has neither PointerEvent nor layout: give it touch pointers and a sheet-sized screen.
		const restore = touchSheet();
		try {
			const user = userEvent.setup();
			const db = new VoyputDb("trips-swipe");
			await seed(db);
			renderApp("/collect/trips", { db });

			const romania = await open(user, 2, "Romania");
			const field = romania.getByRole<HTMLInputElement>("textbox", {
				name: "Place",
			});
			const before = field.value;
			await user.clear(field);
			await user.type(field, "Sibiu");
			// The swipe ends while the field still has focus: no blur saves it.
			expect(document.activeElement).toBe(field);
			swipe(sheetHead("Romania"), -120, 4);

			await screen.findByRole("region", { name: "Stay: Moldova" });
			await waitFor(async () =>
				expect((await storedStays(db))[1]?.place).toBe("Sibiu"),
			);
			expect(screen.getByRole("status").textContent).toContain(
				"Changed Romania",
			);

			// Down closes; nothing else changes.
			swipe(sheetHead("Moldova"), 3, 140);
			await waitFor(() =>
				expect(screen.queryByRole("region", { name: /^Stay:/ })).toBeNull(),
			);
			const stored = await storedStays(db);
			expect(stored).toHaveLength(5);
			expect(stored.map((s) => s.approved)).toEqual([
				false,
				false,
				false,
				false,
				false,
			]);

			// A swipe the system cancels neither closes nor moves, and the sheet snaps back.
			await open(user, 4, "Japan");
			const head = sheetHead("Japan");
			const sheet = head.closest<HTMLElement>("[data-sheet]");
			fireEvent.pointerDown(head, touch(100, 20));
			fireEvent.pointerMove(head, touch(100, 160));
			expect(sheet?.style.transform).toBe("translateY(140px)");
			fireEvent.pointerCancel(head, touch(100, 160));
			fireEvent.pointerUp(head, touch(100, 160));
			expect(sheet?.style.transform).toBe("");
			expect(screen.getByRole("region", { name: "Stay: Japan" })).toBeTruthy();
			expect(await db.stays.count()).toBe(5);

			// Undo still takes the place back.
			await user.click(toastButton("Undo"));
			await waitFor(async () =>
				expect((await storedStays(db))[1]?.place).toBe(before),
			);
		} finally {
			restore();
		}
	});

	it("shows days without evidence as a thin gap row and adds a stay in it", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-gap");
		await db.stamps.bulkPut([
			stamp("s1", "2016-08-10", "ES", "Spain", "entry", "Madrid"),
			stamp("s2", "2016-08-24", "ES", "Spain", "exit", "Madrid"),
		]);
		await db.locations.bulkPut([
			photo("2016-10-01", "FR", "France", "Paris"),
			photo("2016-10-03", "FR", "France", "Paris"),
		]);
		renderApp("/collect/trips", { db });

		expect((await row(1, "Spain")).textContent).toContain("10 → 24 Aug 2016");
		expect((await row(2, "France")).textContent).toContain("1 Oct 2016 → now");
		const gap = screen.getByText("gap · 37 days").closest(".vp-stay-block");
		if (!(gap instanceof HTMLElement)) throw new Error("no gap row");
		expect(gap.textContent).toContain("25 Aug → 30 Sep 2016");
		// A gap is not an error.
		expect(summary()).toContain("0 errors");

		await user.click(
			within(gap).getByRole("button", { name: /Add a stay in the gap/ }),
		);
		const form = within(screen.getByRole("form", { name: "Add stay" }));
		expect(form.getByLabelText<HTMLInputElement>("Arrival date").value).toBe(
			"2016-08-24",
		);
		expect(form.getByLabelText<HTMLInputElement>("Departure date").value).toBe(
			"2016-10-01",
		);
		await user.selectOptions(
			form.getByRole("combobox", { name: "Country" }),
			"IT",
		);
		await user.click(form.getByRole("button", { name: "Add stay" }));

		expect((await row(2, "Italy")).textContent).toContain(
			"24 Aug → 1 Oct 2016",
		);
		expect(screen.queryByText(/^gap ·/)).toBeNull();
		await waitFor(async () =>
			expect(
				(await storedStays(db)).find((s) => s.countryCode === "IT"),
			).toMatchObject({
				edited: true,
				arrival: { date: "2016-08-24", source: "manual" },
			}),
		);
		await user.click(toastButton("Undo"));
		expect(await screen.findByText("gap · 37 days")).toBeTruthy();
	});

	it("sorts newest or oldest first from the menu and keeps the choice", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-sort");
		await seed(db);
		const first = renderApp("/collect/trips", { db });

		await row(5, "Moldova");
		expect(shownNumbers()).toEqual([5, 4, 3, 2, 1]);
		await more(user, "Oldest first");
		expect(shownNumbers()).toEqual([1, 2, 3, 4, 5]);
		await waitFor(async () =>
			expect((await db.kv.get("trips:order"))?.value).toBe("oldest"),
		);
		first.unmount();

		renderApp("/collect/trips", { db });
		await row(5, "Moldova");
		expect(shownNumbers()).toEqual([1, 2, 3, 4, 5]);
		await user.click(screen.getByRole("button", { name: "More stay actions" }));
		expect(
			screen
				.getByRole("menuitemradio", { name: "Oldest first" })
				.getAttribute("aria-checked"),
		).toBe("true");
	});

	it("splits a stay from the panel, undoes it, and a rebuild keeps the split", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-split");
		await seed(db);
		renderApp("/collect/trips", { db });

		const panel = await open(user, 2, "Romania");
		await user.click(panel.getByRole("button", { name: "Split stay 2" }));
		const form = within(screen.getByRole("form", { name: "Split stay" }));
		const day = form.getByLabelText("Split on");
		fireEvent.change(day, { target: { value: "2024-03-05" } });
		expect(
			form.getByRole<HTMLButtonElement>("button", { name: "✂ Split" }).disabled,
		).toBe(true);
		fireEvent.change(day, { target: { value: "2024-03-03" } });
		await user.click(form.getByRole("button", { name: "✂ Split" }));

		expect((await row(2, "Romania")).textContent).toContain("1 → 3 Mar 2024");
		expect((await row(3, "Romania")).textContent).toContain("3 → 5 Mar 2024");
		await waitFor(async () => expect(await db.stays.count()).toBe(6));
		expect(screen.getByRole("status").textContent).toContain("Split Romania");

		await user.click(toastButton("Undo"));
		await waitFor(async () => expect(await db.stays.count()).toBe(5));
		await user.click(toastButton("Redo"));
		await waitFor(async () => expect(await db.stays.count()).toBe(6));

		// Edited stays survive a rebuild; the rest is suggested again.
		await more(user, /^Rebuild suggestions/);
		expect(
			await screen.findByText(/Rebuilt suggestions/, { selector: "span" }),
		).toBeTruthy();
		expect((await row(3, "Romania")).textContent).toContain("3 → 5 Mar 2024");
		await waitFor(async () => expect(await db.stays.count()).toBe(6));
	});

	it("adds a stay from the top button, after the latest one, and after a stay from the panel", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-add");
		const { router } = renderApp("/collect/trips", { db });

		expect(await screen.findByText(/add a\s+stay by hand/)).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "+ Add stay" }));
		const form = within(screen.getByRole("form", { name: "Add stay" }));
		await user.selectOptions(
			form.getByRole("combobox", { name: "Country" }),
			"GE",
		);
		fireEvent.change(form.getByLabelText("Arrival date"), {
			target: { value: "2018-10-12" },
		});
		fireEvent.change(form.getByLabelText("Departure date"), {
			target: { value: "2018-10-20" },
		});
		await user.click(form.getByRole("button", { name: "Add stay" }));
		expect((await row(1, "Georgia")).textContent).toContain("12 → 20 Oct 2018");
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(
				"/collect/trips/stay-2018-10-12-ge-added",
			),
		);
		await waitFor(async () => expect(await db.stays.count()).toBe(1));

		const panel = within(
			await screen.findByRole("region", { name: "Stay: Georgia" }),
		);
		await user.click(
			panel.getByRole("button", { name: "Add a stay after stay 1" }),
		);
		const after = within(screen.getByRole("form", { name: "Add stay" }));
		expect(after.getByLabelText<HTMLInputElement>("Arrival date").value).toBe(
			"2018-10-20",
		);
		await user.selectOptions(
			after.getByRole("combobox", { name: "Country" }),
			"AM",
		);
		await user.click(after.getByRole("button", { name: "Add stay" }));
		expect((await row(2, "Armenia")).textContent).toContain(
			"20 Oct 2018 → now",
		);
	});

	it("adds a trip the migration could not place once the user picks its country", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-legacy");
		await seed(db);
		await db.kv.put({
			key: "trips:legacy",
			value: [
				{
					id: "lost",
					title: "Lost weekend",
					start: "2024-04-05",
					end: "2024-04-07",
					confirmed: true,
					arrival: { date: "2024-04-05", source: "manual", method: "car" },
					departure: { date: "2024-04-07", source: "manual", method: "car" },
					stops: [],
					stampIds: [],
				},
			],
		});
		renderApp("/collect/trips", { db });

		const legacy = within(
			await screen.findByRole("region", { name: "Trips without a country" }),
		);
		expect(legacy.getByText("Lost weekend")).toBeTruthy();
		await user.selectOptions(
			legacy.getByRole("combobox", { name: "Country of Lost weekend" }),
			"BG",
		);
		await user.click(legacy.getByRole("button", { name: "Add as stay" }));
		expect((await row(4, "Bulgaria")).textContent).toContain("5 → 7 Apr 2024");
		expect(
			screen.queryByRole("region", { name: "Trips without a country" }),
		).toBeNull();
		await waitFor(async () =>
			expect(await db.kv.get("trips:legacy")).toBeUndefined(),
		);
		await waitFor(async () =>
			expect((await storedStays(db)).map((s) => s.countryCode)).toContain("BG"),
		);
	});

	it("saves only a whole, plausible typed date: clearing or half-typing saves nothing", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-typed-date");
		await seed(db);
		renderApp("/collect/trips", { db });

		const japan = await open(user, 4, "Japan");
		const arrival = japan.getByLabelText<HTMLInputElement>("Arrival date");
		// Chrome reports "" while a part is cleared and 0002… while a year is typed.
		for (const value of ["", "0002-05-12", "0020-05-12", "0202-05-12"])
			fireEvent.change(arrival, { target: { value } });
		expect(japan.queryByText("Since birth")).toBeNull();
		expect(screen.queryByRole("status")).toBeNull();
		expect((await row(4, "Japan")).textContent).toContain("10 → 20 May 2024");

		fireEvent.change(arrival, { target: { value: "2024-05-12" } });
		expect(screen.getByRole("status").textContent).toContain("Changed Japan");
		await waitFor(async () =>
			expect((await storedStays(db))[3]?.arrival.date).toBe("2024-05-12"),
		);

		// A cleared field is not "since birth": leaving it shows the stored date.
		fireEvent.change(arrival, { target: { value: "" } });
		fireEvent.blur(arrival);
		expect(arrival.value).toBe("2024-05-12");
		fireEvent.change(arrival, { target: { value: "1899-12-31" } });
		fireEvent.keyDown(arrival, { key: "Enter" });
		expect(arrival.value).toBe("2024-05-12");
		expect(japan.queryByText("Since birth")).toBeNull();

		// One Undo takes back the one saved date.
		await user.click(toastButton("Undo"));
		expect((await row(4, "Japan")).textContent).toContain("10 → 20 May 2024");
		expect(arrival.value).toBe("2024-05-10");
	});

	it("saves a timeline drag over many days as one edit, on release", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-drag");
		await seed(db);
		renderApp("/collect/trips", { db });

		const romania = await open(user, 2, "Romania");
		// 25 Feb → 10 Mar 2024 (five days around 1 → 5 Mar): 15 days, 10 px each.
		const track = document.querySelector<HTMLElement>(".vp-trips-tl-inner");
		if (!track) throw new Error("no timeline");
		track.getBoundingClientRect = () => ({ left: 0, width: 150 }) as DOMRect;
		const departure = romania.getByRole("slider", { name: "Departure" });
		departure.setPointerCapture = () => {};

		fireEvent.pointerDown(departure, { pointerId: 1, clientX: 95, button: 0 });
		for (const clientX of [105, 115, 125, 135])
			fireEvent.pointerMove(departure, { pointerId: 1, clientX });
		// Mid-drag the handle follows the pointer; nothing is saved yet.
		expect(departure.getAttribute("aria-valuetext")).toBe("2024-03-09");
		expect(screen.queryByRole("status")).toBeNull();
		expect((await row(2, "Romania")).textContent).toContain("1 → 5 Mar 2024");

		fireEvent.pointerUp(departure, { pointerId: 1, clientX: 135 });
		expect((await row(2, "Romania")).textContent).toContain("1 → 9 Mar 2024");
		await waitFor(async () =>
			expect((await storedStays(db))[1]?.departure.date).toBe("2024-03-09"),
		);

		// One Undo goes back to before the drag, not one day.
		await user.click(toastButton("Undo"));
		expect((await row(2, "Romania")).textContent).toContain("1 → 5 Mar 2024");
		await waitFor(async () =>
			expect((await storedStays(db))[1]?.departure.date).toBe("2024-03-05"),
		);

		// A cancelled drag saves nothing.
		fireEvent.pointerDown(departure, { pointerId: 2, clientX: 95, button: 0 });
		fireEvent.pointerMove(departure, { pointerId: 2, clientX: 135 });
		fireEvent.pointerCancel(departure, { pointerId: 2 });
		expect(departure.getAttribute("aria-valuetext")).toBe("2024-03-05");
		expect((await row(2, "Romania")).textContent).toContain("1 → 5 Mar 2024");
	});

	it("puts an approved stay that gets an error back in the review queue", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-approved-error");
		await seed(db);
		renderApp("/collect/trips", { db });

		await row(2, "Romania");
		await user.click(screen.getByRole("button", { name: "✓ Approve 1" }));
		expect(screen.getAllByText(/4 stays to check\./)).toHaveLength(2);

		// Moldova now runs into the approved Romania, which gets the overlap error.
		const moldova = await open(user, 1, "Moldova");
		fireEvent.change(moldova.getByLabelText("Departure date"), {
			target: { value: "2024-03-03" },
		});
		expect(summary()).toContain("1 error ·");
		await user.click(moldova.getByRole("button", { name: "Close the stay" }));
		expect(screen.getAllByText(/5 stays to check\./)).toHaveLength(2);

		const romania = await open(user, 2, "Romania");
		expect(romania.getAllByText(/^\d \/ 5 to check$/)).toHaveLength(2);
		expect(
			romania
				.getAllByRole<HTMLButtonElement>("button", { name: "✓ Approve & next" })
				.every((b) => b.disabled),
		).toBe(true);
	});

	it("words the empty queue from the counts", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-queue-empty");
		await seed(db);
		renderApp("/collect/trips", { db });

		const [checkFirst] = await screen.findAllByRole("button", {
			name: "Check the first one →",
		});
		if (!checkFirst) throw new Error("no Check the first one button");
		await user.click(checkFirst);
		for (let left = 4; left > 0; left--) {
			const [approveNext] = await screen.findAllByRole("button", {
				name: "✓ Approve & next",
			});
			if (!approveNext) throw new Error("no Approve & next button");
			await user.click(approveNext);
		}
		// The last Approve & next has no next stay and closes the panel.
		expect(
			await screen.findAllByText(
				/^Nothing to check: 1 stay ready to approve, the rest approved\./,
			),
		).toHaveLength(2);

		await user.click(screen.getByRole("button", { name: "✓ Approve 1" }));
		expect(screen.getAllByText(/^Every stay is approved\./)).toHaveLength(2);
	});
});
