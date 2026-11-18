import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	buildPhotoIndex,
	checkStamp,
	gapBetween,
	mergeKept,
	needsAttention,
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
				"Demo data loaded. 10 demo pages, 74 stamps and 5,373 locations · 17 countries · 2016–2025. Plus 10 sample pages with 38 stamps to review.",
			),
		);
		await user.click(
			screen.getByRole("link", { name: /^Step 2: Photo locations/ }),
		);
		await screen.findByText(
			"Demo photo locations loaded: 5,373 locations · 17 countries · 2016–2025.",
		);
		const stored = screen.getByRole("region", {
			name: "Stored photo locations",
		});
		await within(stored).findByText("5,374");
		for (const code of ["UA", "PL", "TH", "JP", "QA", "MD"]) {
			within(stored).getByText(code);
		}
		within(stored).getByRole("img", {
			name: "Locations per year, 2016 to 2025, coloured by country",
		});
		await screen.findByRole("link", {
			name: "Step 2: Photo locations, done, 5.4k locations",
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
		// Own data plus the demo passport (10 pages, 74 stamps) and the Commons samples (10 pages, 38 stamps).
		expect(loaded).toMatchObject({
			passports: 3,
			photos: 21,
			extractions: 20,
			stamps: 113,
			locations: 5374,
		});

		await user.click(
			screen.getByRole("button", { name: "Load demo data again" }),
		);
		await user.click(await screen.findByRole("button", { name: "Replace" }));
		await screen.findByText(/10 demo pages/);
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
		// A history dominated by trips: transits show as a day in Qatar, Turkey
		// or the UAE between two stamps, Schengen trips beyond the first country
		// come from photos.
		expect(
			stays.map(
				(s) =>
					`${s.countryCode} ${s.arrival.date} ${s.departure.date ?? "-"} ${s.arrival.source}/${s.departure.source}`,
			),
		).toEqual([
			"UA 2016-01-01 2016-08-10 photos/stamp",
			"ES 2016-08-10 2016-08-24 stamp/stamp",
			"UA 2016-08-24 2017-01-03 stamp/stamp",
			"PL 2017-01-03 2017-01-08 stamp/stamp",
			"UA 2017-01-08 2017-06-15 stamp/stamp",
			"GE 2017-06-15 2017-06-22 stamp/stamp",
			"AM 2017-06-22 2017-06-29 stamp/stamp",
			"UA 2017-06-29 2017-10-20 stamp/stamp",
			"TR 2017-10-20 2017-10-24 stamp/stamp",
			"UA 2017-10-24 2018-02-08 stamp/stamp",
			"QA 2018-02-08 2018-02-09 estimated/estimated",
			"TH 2018-02-09 2018-02-25 stamp/stamp",
			"QA 2018-02-25 2018-02-26 estimated/estimated",
			"UA 2018-02-26 2018-07-05 stamp/stamp",
			"IT 2018-07-05 2018-07-12 estimated/photos",
			"FR 2018-07-12 2018-07-15 photos/stamp",
			"UA 2018-07-15 2019-09-03 stamp/stamp",
			"ME 2019-09-03 2019-09-10 stamp/estimated",
			"UA 2019-09-10 2019-12-27 stamp/stamp",
			"AE 2019-12-27 2020-01-04 stamp/stamp",
			"UA 2020-01-04 2021-07-10 stamp/stamp",
			"TR 2021-07-10 2021-07-24 stamp/estimated",
			"UA 2021-07-24 2021-10-14 stamp/stamp",
			"TR 2021-10-14 2021-10-15 estimated/estimated",
			"PT 2021-10-15 2021-10-24 stamp/stamp",
			"TR 2021-10-24 2021-10-25 estimated/estimated",
			"UA 2021-10-25 2022-06-04 stamp/stamp",
			"PL 2022-06-04 2022-07-10 stamp/photos",
			"DE 2022-07-10 2022-07-24 photos/photos",
			"PL 2022-07-24 2022-08-31 photos/stamp",
			"UA 2022-08-31 2023-01-11 stamp/stamp",
			"PL 2023-01-11 2023-01-12 stamp/stamp",
			"AE 2023-01-12 2023-01-13 estimated/estimated",
			"TH 2023-01-13 2023-02-11 stamp/stamp",
			"AE 2023-02-11 2023-02-11 estimated/photos",
			"PL 2023-02-11 2023-02-12 photos/stamp",
			"UA 2023-02-12 2023-10-02 stamp/stamp",
			"PL 2023-10-02 2023-10-03 stamp/stamp",
			"TR 2023-10-03 2023-10-04 estimated/estimated",
			"JP 2023-10-04 2023-10-18 stamp/stamp",
			"TR 2023-10-18 2023-10-19 estimated/estimated",
			"PL 2023-10-19 2023-10-19 stamp/stamp",
			"UA 2023-10-19 2024-04-20 stamp/stamp",
			"PL 2024-04-20 2024-04-21 stamp/photos",
			"ES 2024-04-21 2024-05-03 photos/photos",
			"PL 2024-05-03 2024-05-04 photos/stamp",
			"UA 2024-05-04 2024-08-07 stamp/stamp",
			"PL 2024-08-07 2024-08-08 stamp/photos",
			"GR 2024-08-08 2024-08-18 photos/photos",
			"PL 2024-08-18 2024-08-19 photos/stamp",
			"UA 2024-08-19 2025-03-07 stamp/stamp",
			"MD 2025-03-07 2025-03-11 stamp/stamp",
			"UA 2025-03-11 - stamp/estimated",
		]);
		// Stamps and photos cover every day: no gap between stays.
		expect(
			stays.slice(1).flatMap((s, i) => {
				const gap = gapBetween(stays[i] as TravelStay, s);
				return gap ? [gap] : [];
			}),
		).toEqual([]);
	});

	it("leaves only the planted problems in the Review queue", async () => {
		const db = new VoyputDb("demo-review-queue");
		await seedDemo(db);
		// Read back as the app reads them: in uuid order.
		const index = buildPhotoIndex(await db.locations.toArray());
		const stamps = await db.stamps
			.where("passportId")
			.equals("demo-passport")
			.toArray();
		const open = stamps
			.map((stamp) => ({ stamp, check: checkStamp(index, stamp) }))
			.filter(needsAttention)
			.map(({ stamp, check }) => [
				stamp.countryCode,
				stamp.direction,
				stamp.date,
				stamp.reviewed,
				check.suggestion,
			]);
		expect(open).toEqual([
			// A smudged 5 read as 3: the photos are still at home.
			[
				"IT",
				"entry",
				"2018-07-03",
				false,
				expect.stringContaining("around 2018-07-05"),
			],
			// A smudged 10 read as 16: the photos are back home by then.
			[
				"ME",
				"exit",
				"2019-09-16",
				false,
				expect.stringContaining("around 2019-09-10"),
			],
			// The entry/exit word is smudged.
			["TR", "unknown", "2021-07-24", false, expect.any(String)],
			// Faint, checkpoint unreadable.
			["PL", "entry", "2023-02-11", false, expect.any(String)],
		]);
		// No warning ships dismissed: every travel day passes the check on its
		// own, the 01:50 Bangkok exit included.
		expect(stamps.filter((stamp) => stamp.dismissed)).toEqual([]);
		const bangkokExit = stamps.find(
			(stamp) => stamp.countryCode === "TH" && stamp.date === "2023-02-11",
		);
		expect(bangkokExit && checkStamp(index, bangkokExit).icloudCheck).toBe("");
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
		const mixed = history.findIndex((s) => s.arrival.date === "2025-03-11");
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
			["own-spain", "ES", ["mine-uuid"], true],
			[history[mixed]?.id, "UA", ["mine-uuid"], false],
		]);
		expect(left[1]?.arrival).toMatchObject({ source: "estimated" });
		expect(left[1]?.arrival.stampId).toBeUndefined();
	});

	it("asks before the Sources link replaces stored demo data", async () => {
		stubDemoFetch();
		stubObjectUrls();
		const db = new VoyputDb(`demo-replace-${Date.now()}`);
		await seedDemo(db);
		await db.stamps.update("demo-stamp-01", { location: "Edited" });
		const user = userEvent.setup();
		renderApp("/collect/passports", { db });

		const tryDemo = async () => {
			await user.click(
				await screen.findByRole("button", { name: /^Sources: .* · change$/ }),
			);
			await user.click(
				within(await screen.findByRole("dialog")).getByRole("button", {
					name: "Try with demo data",
				}),
			);
			return screen.findByRole("dialog", { name: "Replace demo data?" });
		};
		const edited = async () => (await db.stamps.get("demo-stamp-01"))?.location;

		await user.click(
			within(await tryDemo()).getByRole("button", { name: "Cancel" }),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Replace demo data?" }),
			).toBeNull(),
		);
		expect(await edited()).toBe("Edited");

		await user.click(
			within(await tryDemo()).getByRole("button", { name: "Replace" }),
		);
		await screen.findByText(/10 demo pages/);
		expect(await edited()).not.toBe("Edited");
	});
});
