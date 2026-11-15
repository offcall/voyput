import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	gapBetween,
	mergeKept,
	type Stamp,
	stayHints,
	suggestStays,
	type TravelStay,
	usableStamps,
} from "@voyput/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoyputDb } from "../src/db/db";
import { removeDemo } from "../src/features/demo/loadDemo";
import { seedDemo, stubDemoFetch, stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const ownStamp: Stamp = {
	id: "mine-stamp",
	passportId: "mine",
	photoId: "mine-photo",
	direction: "entry",
	borderCrossing: "plane",
	dateText: "01.02.20 11",
	date: "2020-02-01",
	country: "Spain",
	countryCode: "ES",
	location: null,
	confidence: null,
	notes: "",
	problem: null,
	source: "manual",
	reviewed: true,
};

/** The user's own passport, photo, stamp and location: demo loading must leave them alone. */
async function seedOwnData(db: VoyputDb) {
	await db.passports.put({
		id: "mine",
		name: "My passport",
		validFrom: null,
		validTo: null,
		createdAt: "2026-01-01T00:00:00.000Z",
	});
	await db.photos.put({
		id: "mine-photo",
		passportId: "mine",
		name: "scan.jpg",
		mimeType: "image/jpeg",
		rotation: 0,
		addedAt: "2026-01-01T00:00:00.000Z",
		blob: new Blob(["x"], { type: "image/jpeg" }),
	});
	await db.stamps.put(ownStamp);
	await db.locations.put({
		date: "2020-02-02T12:00:00+01:00",
		lat: 40,
		lon: -3,
		countryCode: "ES",
		country: "Spain",
		city: "",
		source: "apple",
		isVideo: false,
		filename: "IMG_1.JPG",
		uuid: "mine-uuid",
	});
}

describe("demo data", () => {
	it("loads, replaces and removes demo data without touching the user's own", async () => {
		stubDemoFetch();
		stubObjectUrls();
		const user = userEvent.setup();
		const { db } = renderApp("/collect/passports");
		await seedOwnData(db);

		// Demo data starts from the Sources choice; Passports reports it in a thin banner.
		await user.click(
			await screen.findByRole("button", { name: /^Sources: .* · change$/ }),
		);
		await user.click(
			within(await screen.findByRole("dialog")).getByRole("button", {
				name: "Try with demo data",
			}),
		);
		const banner = within(
			await screen.findByRole("region", { name: "Demo data" }),
		);
		await waitFor(() =>
			expect(banner.getByRole("status").textContent).toBe(
				"Demo data loaded. 5 demo pages, 16 stamps and 2,467 locations · 6 countries · 2016–2019. Plus 10 sample pages with 38 stamps to review.",
			),
		);
		await user.click(
			screen.getByRole("link", { name: /^Step 2: Photo locations/ }),
		);
		await screen.findByText(
			"Demo photo locations loaded: 2,467 locations · 6 countries · 2016–2019.",
		);
		const stored = screen.getByRole("region", {
			name: "Stored photo locations",
		});
		await within(stored).findByText("2,468");
		for (const code of ["UA", "ES", "PL", "GE", "IT", "FR"]) {
			within(stored).getByText(code);
		}
		within(stored).getByRole("img", {
			name: "Locations per month, 2016-01 to 2020-02, coloured by country",
		});
		await screen.findByRole("link", {
			name: "Step 2: Photo locations, done, 2.5k locations",
		});
		await user.click(screen.getByRole("link", { name: /^Step 1: Passports/ }));
		const counts = async () => ({
			passports: await db.passports.count(),
			photos: await db.photos.count(),
			extractions: await db.extractions.count(),
			stamps: await db.stamps.count(),
			locations: await db.locations.count(),
		});
		const loaded = await counts();
		// Own data plus the demo passport (5 pages, 16 stamps) and the Commons samples (10 pages, 38 stamps).
		expect(loaded).toMatchObject({
			passports: 3,
			photos: 16,
			extractions: 15,
			stamps: 55,
		});
		expect(loaded.locations).toBeGreaterThan(2000);

		await user.click(
			screen.getByRole("button", { name: "Load demo data again" }),
		);
		await user.click(await screen.findByRole("button", { name: "Replace" }));
		await screen.findByText(/5 demo pages/);
		expect(await counts()).toEqual(loaded);

		await user.click(screen.getByRole("button", { name: "Remove demo data" }));
		await user.click(await screen.findByRole("button", { name: "Remove" }));
		await screen.findByText("Demo data removed.");
		expect(await counts()).toEqual({
			passports: 1,
			photos: 1,
			extractions: 0,
			stamps: 1,
			locations: 1,
		});
		expect(await db.stamps.get("mine-stamp")).toEqual(ownStamp);
		expect(await db.locations.get("mine-uuid")).toBeTruthy();
	});

	it("suggests a history of stays from the demo stamps and photos", async () => {
		const db = new VoyputDb("demo-trips");
		await seedDemo(db);
		const stamps = usableStamps(await db.stamps.toArray());
		const locations = await db.locations.toArray();
		const stays = suggestStays({ stamps, locations });

		const hints = stayHints(stays, {
			stamps,
			passports: await db.passports.toArray(),
			birth: null,
		});
		expect(hints.flat().filter((h) => h.severity === "error")).toEqual([]);
		expect(
			stays.map((s) => [
				s.countryCode,
				s.arrival.date,
				s.departure.date,
				`${s.arrival.source}/${s.departure.source}`,
			]),
		).toEqual([
			// From the first photo on: no stay since birth without a birth country.
			["UA", "2016-01-01", "2016-08-10", "photos/stamp"],
			["ES", "2016-08-10", "2016-08-24", "stamp/stamp"],
			["UA", "2016-08-24", "2017-05-03", "stamp/stamp"],
			["PL", "2017-05-03", "2017-05-12", "stamp/stamp"],
			["UA", "2017-05-12", "2018-10-12", "stamp/stamp"],
			["GE", "2018-10-12", "2018-10-20", "stamp/stamp"],
			["UA", "2018-10-20", "2019-07-01", "stamp/stamp"],
			// A Schengen trip: entry in Italy, photos in France, exit from France.
			["IT", "2019-07-01", "2019-07-08", "stamp/photos"],
			["FR", "2019-07-08", "2019-07-15", "photos/stamp"],
			["UA", "2019-07-15", null, "stamp/estimated"],
		]);
		// Stamps and photos cover every day: no gap between stays.
		expect(
			stays.slice(1).flatMap((s, i) => {
				const gap = gapBetween(stays[i] as TravelStay, s);
				return gap ? [gap] : [];
			}),
		).toEqual([]);
	});

	it("removes only the stays built on demo data, not the user's own", async () => {
		const db = new VoyputDb("demo-mixed-history");
		await seedDemo(db);
		await seedOwnData(db);
		const stamps = usableStamps(await db.stamps.toArray());
		const locations = await db.locations.toArray();
		const own: TravelStay = {
			id: "own-spain",
			countryCode: "ES",
			place: "Madrid",
			kind: "stay",
			arrival: {
				date: "2020-02-01",
				source: "stamp",
				method: "plane",
				stampId: "mine-stamp",
			},
			departure: { date: "2020-02-05", source: "manual", method: "plane" },
			stampIds: ["mine-stamp"],
			photoIds: ["mine-uuid"],
			approved: true,
		};
		const history = mergeKept(
			suggestStays({ stamps, locations }).filter(
				(s) => s.countryCode !== "ES" || s.arrival.date !== "2020-02-01",
			),
			[own],
		);
		// A demo stay that also holds one of the user's photos keeps it.
		const mixed = history.findIndex((s) => s.arrival.date === "2019-07-15");
		history[mixed] = {
			...(history[mixed] as TravelStay),
			photoIds: [...(history[mixed]?.photoIds ?? []), "mine-uuid"],
		};
		await db.stays.bulkPut(history);

		await removeDemo(db);
		const left = (await db.stays.toArray()).sort((a, b) =>
			(a.arrival.date ?? "").localeCompare(b.arrival.date ?? ""),
		);
		expect(
			left.map((s) => [s.id, s.countryCode, s.photoIds, s.approved]),
		).toEqual([
			[history[mixed]?.id, "UA", ["mine-uuid"], false],
			["own-spain", "ES", ["mine-uuid"], true],
		]);
		expect(left[0]?.arrival).toMatchObject({ source: "estimated" });
		expect(left[0]?.arrival.stampId).toBeUndefined();
	});
});
