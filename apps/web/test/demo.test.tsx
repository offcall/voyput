import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	guessHomeCountry,
	type Stamp,
	suggestTrips,
	usableStamps,
} from "@voyput/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoyputDb } from "../src/db/db";
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

		await user.click(
			await screen.findByRole("button", { name: "Load demo data" }),
		);
		await screen.findByText(
			"Loaded 5 demo pages, 16 stamps and 2,467 locations · 6 countries · 2016–2019. Plus 10 sample pages with 38 stamps to review.",
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

		await user.click(screen.getByRole("button", { name: "Load demo data" }));
		await user.click(await screen.findByRole("button", { name: "Replace" }));
		await screen.findByText(/Loaded 5 demo pages/);
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

	it("yields the four demo trips with stamp boundaries", async () => {
		const db = new VoyputDb("demo-trips");
		await seedDemo(db);
		const stamps = usableStamps(await db.stamps.toArray());
		const locations = await db.locations.toArray();
		const home = guessHomeCountry(stamps, locations);
		expect(home).toBe("UA");

		const trips = suggestTrips({ stamps, locations, home: home ?? "" });
		expect(
			trips.map((t) => ({
				start: t.start,
				end: t.end,
				countries: [...new Set(t.stops.map((s) => s.countryCode))],
				arrival: t.arrival.source,
				departure: t.departure.source,
			})),
		).toEqual(
			[
				["2016-08-10", "2016-08-24", ["ES"]],
				["2017-05-03", "2017-05-12", ["PL"]],
				["2018-10-12", "2018-10-20", ["GE"]],
				["2019-07-01", "2019-07-15", ["IT", "FR"]],
			].map(([start, end, countries]) => ({
				start,
				end,
				countries,
				arrival: "stamp",
				departure: "stamp",
			})),
		);
	});
});
