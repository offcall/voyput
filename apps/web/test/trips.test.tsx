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

describe("trips", () => {
	it("suggests two trips, confirms and renames one, and keeps it after reload", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-test");
		await seed(db);
		const first = renderApp("/trips", { db });

		expect(await screen.findByRole("button", { name: "Romania" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Japan" })).toBeTruthy();
		expect(screen.getAllByText("Suggested")).toHaveLength(2);

		await user.click(screen.getByRole("button", { name: "Romania" }));
		const detail = screen
			.getByRole("heading", { name: "Trip: Romania" })
			.closest("section");
		if (!detail) throw new Error("trip detail not found");
		const d = within(detail);
		expect(d.getByText("2024-03-02")).toBeTruthy();
		expect(d.getByText("Bucharest")).toBeTruthy();
		expect(d.getAllByRole("listitem")).toHaveLength(4);

		const title = d.getByLabelText("Title");
		await user.clear(title);
		await user.type(title, "Spring in Romania");
		await user.click(d.getByRole("button", { name: "Confirm" }));
		expect(
			await screen.findByRole("button", { name: "Spring in Romania" }),
		).toBeTruthy();

		const stored = await db.trips.toArray();
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			title: "Spring in Romania",
			confirmed: true,
			start: "2024-03-01",
			end: "2024-03-05",
			stampIds: ["s1", "s2", "s3", "s4"],
		});
		first.unmount();

		renderApp("/trips", { db });
		expect(
			await screen.findByRole("button", { name: "Spring in Romania" }),
		).toBeTruthy();
		expect(screen.getByText("Confirmed")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Japan" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Romania" })).toBeNull();
	});

	it("edits dates, deletes a suggestion and adds a trip, all kept after reload", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-edit-test");
		await seed(db);
		const first = renderApp("/trips", { db });

		const openDetail = async (name: string) => {
			await user.click(await screen.findByRole("button", { name }));
			const section = screen
				.getByRole("heading", { name: `Trip: ${name}` })
				.closest("section");
			if (!section) throw new Error("trip detail not found");
			return within(section);
		};

		let d = await openDetail("Japan");
		fireEvent.change(d.getByLabelText("Start"), {
			target: { value: "2024-05-11" },
		});
		await user.click(d.getByRole("button", { name: "Save" }));
		await screen.findAllByText("Draft");

		d = await openDetail("Romania");
		await user.click(d.getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));

		await user.click(screen.getByRole("button", { name: "New trip" }));
		await user.type(screen.getByLabelText("New trip title"), "Weekend in Kyiv");
		fireEvent.change(screen.getByLabelText("New trip start"), {
			target: { value: "2024-07-01" },
		});
		fireEvent.change(screen.getByLabelText("New trip end"), {
			target: { value: "2024-07-03" },
		});
		await user.click(screen.getByRole("button", { name: "Add trip" }));
		await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
		first.unmount();

		renderApp("/trips", { db });
		await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
		expect(screen.queryByRole("button", { name: "Romania" })).toBeNull();
		expect(
			screen.getByRole("button", { name: "Weekend in Kyiv" }),
		).toBeTruthy();
		const japan = (await db.trips.toArray()).find((t) => t.title === "Japan");
		expect(japan).toMatchObject({
			start: "2024-05-11",
			end: "2024-05-11",
			confirmed: false,
			arrival: { source: "manual", date: "2024-05-11" },
		});
		expect(japan?.stops.map((s) => s.cities)).toEqual([["Kyoto"]]);
	});

	it("flags a trip whose stamp disagrees with the photos or was deleted", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-problem-test");
		await seed(db);
		await db.stamps.put(
			stamp("s5", "2024-05-11", "KR", "South Korea", "entry", "Incheon"),
		);
		const first = renderApp("/trips", { db });

		const japan = (
			await screen.findByRole("button", { name: "Japan → South Korea" })
		).closest("article");
		if (!japan) throw new Error("trip card not found");
		expect(within(japan).getByText("1 issue")).toBeTruthy();
		await user.click(
			within(japan).getByRole("button", { name: "Japan → South Korea" }),
		);
		const detail = screen
			.getByRole("heading", { name: "Trip: Japan → South Korea" })
			.closest("section");
		if (!detail) throw new Error("trip detail not found");
		expect(within(detail).getByText("stamp-without-photos")).toBeTruthy();
		await user.click(within(detail).getByRole("button", { name: "Confirm" }));
		await screen.findAllByText("Confirmed");
		first.unmount();

		await db.stamps.delete("s5");
		renderApp("/trips", { db });
		const card = (
			await screen.findByRole("button", { name: "Japan → South Korea" })
		).closest("article");
		if (!card) throw new Error("trip card not found");
		expect(within(card).getByText("1 issue")).toBeTruthy();
	});

	it("moves trip edges with the arrow keys and keeps the new period", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("trips-keys-test");
		await seed(db);
		const first = renderApp("/trips", { db });
		await user.click(await screen.findByRole("button", { name: "Romania" }));

		const start = screen.getByRole("slider", { name: "Trip start" });
		const end = screen.getByRole("slider", { name: "Trip end" });
		start.focus();
		await user.keyboard("{ArrowRight}");
		expect(start.getAttribute("aria-valuetext")).toBe("2024-03-02");
		await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
		expect(start.getAttribute("aria-valuetext")).toBe("2024-03-02");
		end.focus();
		await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
		expect(end.getAttribute("aria-valuetext")).toBe("2024-03-05");
		await user.keyboard("{ArrowRight}");
		expect(end.getAttribute("aria-valuetext")).toBe("2024-03-06");

		await user.click(screen.getByRole("button", { name: "Save" }));
		await screen.findAllByText("Draft");
		first.unmount();

		renderApp("/trips", { db });
		await user.click(await screen.findByRole("button", { name: "Romania" }));
		const stored = await db.trips.toArray();
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			start: "2024-03-02",
			end: "2024-03-06",
			arrival: { source: "manual", date: "2024-03-02" },
			departure: { source: "manual", date: "2024-03-06" },
		});
		expect(stored[0]?.stops.map((s) => s.day)).toEqual([
			"2024-03-02",
			"2024-03-03",
			"2024-03-05",
		]);
		expect(
			screen
				.getByRole("slider", { name: "Trip start" })
				.getAttribute("aria-valuetext"),
		).toBe("2024-03-02");
	});
});
