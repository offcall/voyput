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

/** Home is Moldova; one trip to Romania with stamps, one to Japan with photos only. */
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

const trip = (n: number) =>
	screen.getByRole("region", { name: new RegExp(`^Trip ${n}: `) });

async function storedStays(db: VoyputDb) {
	const stays = await db.stays.toArray();
	return stays.sort((a, b) =>
		(a.arrival.date ?? "").localeCompare(b.arrival.date ?? ""),
	);
}

describe("trips", () => {
	it("lists the suggested stays with their trips and approves the clear ones", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-list");
		await seed(db);
		const first = renderApp("/collect/trips", { db });

		expect(await row(1, "Moldova")).toBeTruthy();
		expect(screen.getByText(/Your first change saves it/)).toBeTruthy();
		expect((await row(2, "Romania")).textContent).toContain(
			"1 → 5 March, 2024",
		);
		expect((await row(2, "Romania")).textContent).toContain("5 days");
		expect((await row(4, "Japan")).textContent).toContain("10 → 20 May, 2024");
		expect((await row(5, "Moldova")).textContent).toContain("now");
		expect(trip(1).querySelector(".vp-stays-trip-title")?.textContent).toBe(
			"Romania",
		);
		expect(within(trip(2)).getByRole("button", { name: /Japan/ })).toBeTruthy();
		expect(screen.getByText(/Home:/).textContent).toContain("Moldova");
		expect(stat("Trips")).toBe("2");
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
		// A transit is passed through: Japan no longer counts as visited.
		expect(stat("Countries visited")).toBe("1");

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

	it("takes a birth date and a picked home", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-settings");
		await seed(db);
		renderApp("/collect/trips", { db });

		expect((await row(1, "Moldova")).textContent).toContain("Since birth");
		fireEvent.change(screen.getByLabelText("Birth date"), {
			target: { value: "1990-02-03" },
		});
		expect((await row(1, "Moldova")).textContent).toContain(
			"3 February 1990 → 1 March 2024",
		);
		await waitFor(async () =>
			expect((await db.kv.get("trips:birth"))?.value).toBe("1990-02-03"),
		);

		await user.click(screen.getByRole("button", { name: "change" }));
		await user.selectOptions(
			screen.getByRole("combobox", { name: "Home country" }),
			"RO",
		);
		expect(screen.getByText(/Home:/).textContent).toContain("Romania");
		expect((await db.kv.get("trips:home"))?.value).toBe("RO");
	});
});
