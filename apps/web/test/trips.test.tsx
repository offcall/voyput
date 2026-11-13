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

const stat = (label: string) =>
	screen.getByText(label, { selector: ".vp-stat-label" }).nextElementSibling
		?.textContent;

/** A stay's row button, by its number and country. */
const row = (n: number, country: string) =>
	screen.findByRole("button", { name: new RegExp(`^${n}\\. ${country},`) });

/** Stay numbers in the order the list shows them. */
const shownNumbers = () =>
	[...document.querySelectorAll(".vp-stays .vp-stay-num")].map((n) =>
		Number(n.textContent),
	);

async function storedStays(db: VoyputDb) {
	const stays = await db.stays.toArray();
	return stays.sort((a, b) =>
		(a.arrival.date ?? "").localeCompare(b.arrival.date ?? ""),
	);
}

describe("trips", () => {
	it("lists the suggested stays without home stays and approves the clear ones", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-list");
		await seed(db);
		const first = renderApp("/collect/trips", { db });

		// The first stay begins with the first photo, not "since birth".
		expect((await row(1, "Moldova")).textContent).toContain(
			"1 Jan → 1 Mar 2024",
		);
		expect(screen.getByText(/Your first change saves it/)).toBeTruthy();
		expect((await row(2, "Romania")).textContent).toContain("1 → 5 Mar 2024");
		expect((await row(2, "Romania")).textContent).toContain("5 days");
		expect((await row(4, "Japan")).textContent).toContain("10 → 20 May 2024");
		expect((await row(5, "Moldova")).textContent).toContain("now");
		expect(screen.queryByText(/Home/)).toBeNull();
		expect(screen.queryByRole("region", { name: /^Trip / })).toBeNull();
		expect(stat("Stays")).toBe("5");
		expect(stat("Countries")).toBe("3");
		expect(stat("Left to approve")).toBe("5");
		expect(await db.stays.count()).toBe(0);

		// Only Romania has stamps on both edges.
		await user.click(
			screen.getByRole("button", { name: "✓ Approve clear (1)" }),
		);
		expect(stat("Approved")).toBe("1");
		await waitFor(async () =>
			expect((await storedStays(db)).map((s) => s.approved)).toEqual([
				false,
				true,
				false,
				false,
				false,
			]),
		);
		first.unmount();

		renderApp("/collect/trips", { db });
		expect(await row(2, "Romania")).toBeTruthy();
		expect(stat("Approved")).toBe("1");
		expect(screen.queryByText(/Your first change saves it/)).toBeNull();
	});

	it("marks a transit, edits methods, deletes and undoes, all saved", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-edit");
		await seed(db);
		renderApp("/collect/trips", { db });

		const japan = (await row(4, "Japan")).closest(".vp-stay") as HTMLElement;
		await user.click(within(japan).getByRole("button", { name: "Transit" }));
		await user.selectOptions(
			within(japan).getByRole("combobox", { name: "Arrival method" }),
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
		expect(stat("Countries")).toBe("2");

		await user.click(screen.getByRole("button", { name: "Delete stay 2" }));
		expect(
			screen.queryByRole("button", { name: /^\d+\. Romania,/ }),
		).toBeNull();
		await waitFor(async () => expect(await db.stays.count()).toBe(4));
		await user.click(screen.getByRole("button", { name: "← Undo" }));
		expect(await row(2, "Romania")).toBeTruthy();
		await waitFor(async () => expect(await db.stays.count()).toBe(5));
		await user.click(screen.getByRole("button", { name: "Redo →" }));
		await waitFor(async () => expect(await db.stays.count()).toBe(4));
	});

	it("edits a stay's dates in the detail and shows the crossing hints", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-detail");
		await seed(db);
		const { router } = renderApp("/collect/trips", { db });

		await user.click(await row(4, "Japan"));
		await waitFor(() =>
			expect(router.state.location.pathname).toMatch(
				/^\/collect\/trips\/stay-/,
			),
		);
		const detail = within(screen.getByRole("region", { name: "Stay: Japan" }));
		expect(detail.getByDisplayValue("Tokyo, Kyoto")).toBeTruthy();

		const arrival = detail.getByLabelText("Arrival date");
		fireEvent.change(arrival, { target: { value: "2024-05-12" } });
		expect(await screen.findByText(/Long travel window/)).toBeTruthy();
		expect(detail.getByText("Set by hand")).toBeTruthy();

		fireEvent.change(arrival, { target: { value: "2024-05-01" } });
		expect(await screen.findByText(/Overlap/)).toBeTruthy();
		expect(stat("With errors")).toBe("1");
		const japan = (await row(4, "Japan")).closest(".vp-stay") as HTMLElement;
		expect(
			within(japan).getByRole<HTMLButtonElement>("button", {
				name: "✓ Approve",
			}).disabled,
		).toBe(true);

		await user.click(
			detail.getByRole("button", { name: /Use previous departure/ }),
		);
		expect(screen.queryByText(/Overlap/)).toBeNull();
		expect(stat("With errors")).toBe("0");
		await waitFor(async () =>
			expect((await storedStays(db))[3]?.arrival).toMatchObject({
				date: "2024-05-10",
				source: "manual",
			}),
		);
	});

	it("takes a birth country and date: the first stay is there since birth", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-settings");
		await seed(db);
		renderApp("/collect/trips", { db });

		const born = () => screen.getByText(/Born in/).closest("p");
		await screen.findByText(/Born in/);
		expect(born()?.textContent).toContain("no country set");
		await user.click(screen.getByRole("button", { name: "set" }));
		await user.selectOptions(
			screen.getByRole("combobox", { name: "Birth country" }),
			"MD",
		);
		// A country alone does not start a stay since birth.
		expect((await row(1, "Moldova")).textContent).toContain("1 Jan");
		fireEvent.change(screen.getByLabelText("Birth date"), {
			target: { value: "1997-05-21" },
		});
		expect((await row(1, "Moldova")).textContent).toContain(
			"21 May 1997 → 1 Mar 2024",
		);
		await user.click(screen.getByRole("button", { name: "Done" }));
		expect(born()?.textContent).toMatch(/Born in 🇲🇩 Moldova · 21 May 1997/);
		await waitFor(async () => {
			expect((await db.kv.get("trips:birth"))?.value).toBe("1997-05-21");
			expect((await db.kv.get("trips:birthCountry"))?.value).toBe("MD");
		});
		// Undo takes back the date and the stay since birth.
		await user.click(screen.getByRole("button", { name: "← Undo" }));
		expect((await row(1, "Moldova")).textContent).toContain("1 Jan");
		await waitFor(async () =>
			expect(await db.kv.get("trips:birth")).toBeUndefined(),
		);
	});

	it("shows days without evidence as a gap row and adds a stay in it", async () => {
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
		expect(stat("With errors")).toBe("0");

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
		await user.click(screen.getByRole("button", { name: "← Undo" }));
		expect(await screen.findByText("gap · 37 days")).toBeTruthy();
	});

	it("sorts newest or oldest first and keeps the choice", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-sort");
		await seed(db);
		const first = renderApp("/collect/trips", { db });

		await row(5, "Moldova");
		expect(shownNumbers()).toEqual([5, 4, 3, 2, 1]);
		await user.click(screen.getByRole("button", { name: "Oldest first" }));
		expect(shownNumbers()).toEqual([1, 2, 3, 4, 5]);
		await waitFor(async () =>
			expect((await db.kv.get("trips:order"))?.value).toBe("oldest"),
		);
		first.unmount();

		renderApp("/collect/trips", { db });
		await row(5, "Moldova");
		expect(shownNumbers()).toEqual([1, 2, 3, 4, 5]);
		expect(
			screen
				.getByRole("button", { name: "Oldest first" })
				.getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("splits a stay at a day, undoes it, and a rebuild keeps the split", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-split");
		await seed(db);
		renderApp("/collect/trips", { db });

		await row(2, "Romania");
		await user.click(screen.getByRole("button", { name: "Split stay 2" }));
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
		expect(stat("Stays")).toBe("6");
		await waitFor(async () => expect(await db.stays.count()).toBe(6));

		await user.click(screen.getByRole("button", { name: "← Undo" }));
		expect(stat("Stays")).toBe("5");
		await waitFor(async () => expect(await db.stays.count()).toBe(5));
		await user.click(screen.getByRole("button", { name: "Redo →" }));
		expect(stat("Stays")).toBe("6");

		// Edited stays survive a rebuild; the rest is suggested again.
		expect(screen.getByText("Keeps approved and edited stays")).toBeTruthy();
		await user.click(
			screen.getByRole("button", { name: "Rebuild suggestions" }),
		);
		await waitFor(() => expect(stat("Stays")).toBe("6"));
		expect((await row(3, "Romania")).textContent).toContain("3 → 5 Mar 2024");
	});

	it("adds a stay from the top button, after the latest one", async () => {
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
});
