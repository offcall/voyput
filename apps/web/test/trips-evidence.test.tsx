import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	type Passport,
	type Stamp,
	suggestHistory,
	type TravelStay,
} from "@voyput/core";
import { describe, expect, it } from "vitest";
import { type PhotoRecord, VoyputDb } from "../src/db/db";
import { extractPhoto } from "../src/features/extract/extractPhoto";
import {
	deletePassport,
	deletePhoto,
} from "../src/features/import/photos/passportStore";
import {
	deleteStamp,
	restoreStamp,
	updateStamp,
} from "../src/features/review/reviewStore";
import { DEFAULT_SETTINGS } from "../src/settings/settings";
import { offlineAi, renderApp } from "./renderApp";

const PICKER = "Drop photo_locations.csv here or pick it";

const stamp = (
	id: string,
	date: string,
	countryCode: string,
	direction: Stamp["direction"],
	photoId = "ph1",
): Stamp => ({
	id,
	passportId: "p1",
	photoId,
	direction,
	borderCrossing: "plane",
	dateText: date,
	date,
	country: countryCode,
	countryCode,
	location: null,
	confidence: 95,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: true,
});

/** Moldova → Romania (approved) → Moldova, built from four stamps on two pages. */
const STAMPS = [
	stamp("s1", "2024-03-01", "MD", "exit"),
	stamp("s2", "2024-03-01", "RO", "entry"),
	stamp("s3", "2024-03-05", "RO", "exit", "ph2"),
	stamp("s4", "2024-03-05", "MD", "entry", "ph2"),
];

let n = 0;

/** A database with the stamps and, unless `stored` is false, the history saved with Romania approved. */
async function seed(stored = true) {
	const db = new VoyputDb(`trips-evidence-${++n}`);
	await db.stamps.bulkPut(STAMPS);
	if (stored) {
		const stays = suggestHistory({
			stamps: STAMPS,
			locations: [],
			birthCountry: null,
			birth: null,
			dismissed: [],
		});
		await db.stays.bulkPut(
			stays.map((s) => (s.countryCode === "RO" ? { ...s, approved: true } : s)),
		);
	}
	return db;
}

const romania = async (db: VoyputDb) =>
	(await db.stays.toArray()).find((s) => s.countryCode === "RO") as TravelStay;

/** Every stamp id the stored stays point at, once each. */
const allStampIds = async (db: VoyputDb) =>
	[
		...new Set(
			(await db.stays.toArray()).flatMap((s) => [
				...s.stampIds,
				...[s.arrival.stampId, s.departure.stampId].filter(
					(id) => id !== undefined,
				),
			]),
		),
	].sort();

describe("stays after evidence changes", () => {
	it("keeps an approved stay when its stamp is deleted, flags it, and Undo on Review puts it back", async () => {
		const db = await seed();
		const before = await romania(db);
		const changed = await deleteStamp(db, STAMPS[2] as Stamp);
		const after = await romania(db);
		expect(after).toMatchObject({
			id: before.id,
			approved: true,
			evidenceChanged: true,
			stampIds: ["s2"],
			departure: { date: "2024-03-05", source: "estimated" },
		});
		expect(await allStampIds(db)).not.toContain("s3");
		expect(await db.stays.count()).toBe(3);
		expect(changed.stays.map((s) => s.id)).toEqual([before.id]);

		await restoreStamp(db, STAMPS[2] as Stamp, changed);
		expect(await db.stamps.get("s3")).toBeTruthy();
		expect(await romania(db)).toEqual(before);
	});

	it("undoes only the delete's own cleanup and keeps later changes", async () => {
		const db = await seed();
		const id = (await romania(db)).id;
		const undo = await deleteStamp(db, STAMPS[2] as Stamp);
		// Later: the other stamp of the stay is edited, and the place is set elsewhere.
		await updateStamp(db, "s2", { date: "2024-03-02" });
		await db.stays.update(id, { place: "Bucharest" });

		await restoreStamp(db, STAMPS[2] as Stamp, undo);
		expect(await romania(db)).toMatchObject({
			place: "Bucharest",
			stampIds: ["s2", "s3"],
			departure: { date: "2024-03-05", source: "stamp", stampId: "s3" },
			evidenceChanged: true,
			approved: true,
		});

		// Without a later evidence change the flag goes with the Undo.
		const plain = await seed();
		const undoPlain = await deleteStamp(plain, STAMPS[2] as Stamp);
		await plain.stays.update(id, { place: "Bucharest" });
		await restoreStamp(plain, STAMPS[2] as Stamp, undoPlain);
		const back = await romania(plain);
		expect(back).toMatchObject({ place: "Bucharest", stampIds: ["s2", "s3"] });
		expect(back.evidenceChanged).toBeUndefined();
	});

	it("drops the photos a replacing CSV no longer has from stored stays", async () => {
		const user = userEvent.setup();
		const db = await seed(false);
		const row = (uuid: string, date: string, countryCode: string) => ({
			date: `${date}T12:00:00+02:00`,
			lat: 0,
			lon: 0,
			countryCode,
			country: countryCode,
			city: "",
			source: "apple",
			isVideo: false,
			filename: `${uuid}.jpg`,
			uuid,
		});
		await db.locations.bulkPut([
			row("u1", "2024-05-10", "JP"),
			row("u2", "2024-05-11", "JP"),
		]);
		await db.stays.put({
			id: "jp",
			countryCode: "JP",
			place: "",
			kind: "stay",
			arrival: { date: "2024-05-10", source: "photos", method: "unknown" },
			departure: { date: "2024-05-11", source: "photos", method: "unknown" },
			stampIds: [],
			photoIds: ["u1", "u2"],
			approved: true,
		});
		renderApp("/collect/locations", { db });
		await user.upload(
			await screen.findByLabelText(PICKER),
			new File(
				[
					[
						"date,lat,lon,country_code,country,city,source,is_video,filename,uuid",
						"2024-05-11T12:00:00,35,139,JP,Japan,Tokyo,apple,False,b.jpg,u2",
					].join("\n"),
				],
				"photo_locations.csv",
				{ type: "text/csv" },
			),
		);
		await screen.findByText(/Imported 1 location/);
		expect(await db.stays.get("jp")).toMatchObject({
			photoIds: ["u2"],
			evidenceChanged: true,
			approved: true,
		});
	});

	it("flags the stays of a stamp whose date or country is edited, not of other edits", async () => {
		const db = await seed();
		await updateStamp(db, "s2", { location: "Otopeni" });
		await updateStamp(db, "s2", { date: "2024-03-01" });
		expect((await romania(db)).evidenceChanged).toBeUndefined();
		await updateStamp(db, "s2", { date: "2024-03-02" });
		expect(await romania(db)).toMatchObject({
			evidenceChanged: true,
			approved: true,
			arrival: { date: "2024-03-01", stampId: "s2" },
		});

		const other = await seed();
		await updateStamp(other, "s3", { countryCode: "BG" });
		expect((await romania(other)).evidenceChanged).toBe(true);
	});

	it("flags every stay built on a deleted passport's or photo's stamps", async () => {
		const db = await seed();
		await deletePhoto(db, "ph2");
		expect(await allStampIds(db)).toEqual(["s1", "s2"]);
		await deletePassport(db, "p1");
		const stays = await db.stays.toArray();
		expect(stays).toHaveLength(3);
		expect(stays.every((s) => s.evidenceChanged)).toBe(true);
		expect(await allStampIds(db)).toEqual([]);
	});

	it("stores nothing while the history is only a suggestion", async () => {
		const db = await seed(false);
		await deleteStamp(db, STAMPS[2] as Stamp);
		await deletePassport(db, "p1");
		expect(await db.stays.count()).toBe(0);
	});

	it("shows a flagged stay on Stays, keeps or re-suggests it, and undoes both", async () => {
		const user = userEvent.setup();
		const db = await seed();
		await deleteStamp(db, STAMPS[2] as Stamp);
		renderApp("/collect/trips", { db });

		const row = await screen.findByRole("button", { name: /^2\. Romania,/ });
		expect(row.getAttribute("aria-label")).toMatch(/evidence changed$/);
		expect(row.textContent).toContain("evidence changed");

		await user.click(
			screen.getByRole("button", { name: "Keep Romania as is" }),
		);
		expect(screen.getByRole("status").textContent).toContain(
			"Kept Romania as is",
		);
		await waitFor(async () =>
			expect(await romania(db)).toMatchObject({ edited: true, approved: true }),
		);
		expect((await romania(db)).evidenceChanged).toBeUndefined();
		expect(
			screen.queryByRole("button", { name: "Keep Romania as is" }),
		).toBeNull();

		await user.click(
			within(screen.getByRole("status")).getByRole("button", { name: "Undo" }),
		);
		await waitFor(async () =>
			expect((await romania(db)).evidenceChanged).toBe(true),
		);

		await user.click(
			await screen.findByRole("button", {
				name: "Re-suggest Romania from the evidence",
			}),
		);
		await waitFor(async () =>
			expect(await romania(db)).toMatchObject({
				approved: false,
				stampIds: ["s2"],
				arrival: { date: "2024-03-01", source: "stamp" },
				// It meets the kept Moldova stay's arrival, as on a rebuild.
				departure: { date: "2024-03-05", stampId: "s4" },
			}),
		);
		expect((await romania(db)).evidenceChanged).toBeUndefined();
		expect(await db.stays.count()).toBe(3);

		await user.click(
			within(screen.getByRole("status")).getByRole("button", { name: "Undo" }),
		);
		await waitFor(async () =>
			expect(await romania(db)).toMatchObject({
				approved: true,
				evidenceChanged: true,
			}),
		);
	});

	it("does not approve a flagged stay from its panel until it is resolved", async () => {
		const user = userEvent.setup();
		const db = await seed();
		await deleteStamp(db, STAMPS[0] as Stamp);
		renderApp("/collect/trips", { db });
		await user.click(
			await screen.findByRole("button", { name: /^1\. Moldova,/ }),
		);
		const panel = within(
			await screen.findByRole("region", { name: "Stay: Moldova" }),
		);
		const approve = panel.getByRole("button", { name: "✓ Approve" });
		expect((approve as HTMLButtonElement).disabled).toBe(true);
		panel.getByText(/Evidence changed: re-suggest or keep it/);

		await user.click(
			screen.getByRole("button", { name: "Keep Moldova as is" }),
		);
		expect(
			(panel.getByRole("button", { name: "✓ Approve" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});

	it("cleans stays when a re-extraction replaces a stamp the user unmarked", async () => {
		const db = await seed();
		const passport: Passport = {
			id: "p1",
			name: "Passport",
			validFrom: null,
			validTo: null,
			createdAt: "2024-01-01T00:00:00Z",
		};
		await db.passports.put(passport);
		const page: PhotoRecord = {
			id: "ph1",
			passportId: "p1",
			name: "page-1.jpg",
			mimeType: "image/jpeg",
			rotation: 0,
			size: 1,
			addedAt: "2024-01-01T00:00:00Z",
			blob: new Blob(["x"]),
		};
		await db.photos.put(page);
		// Built from a reviewed stamp, then marked unreviewed again.
		await updateStamp(db, "s2", { reviewed: false });
		await extractPhoto(
			db,
			{
				...offlineAi,
				askAboutImage: async () => ({
					cost: null,
					text: JSON.stringify({ notes: "", stamps: [] }),
				}),
			},
			DEFAULT_SETTINGS,
			passport,
			page,
		);
		expect(await db.stamps.get("s2")).toBeUndefined();
		expect(await allStampIds(db)).not.toContain("s2");
		expect(await romania(db)).toMatchObject({
			evidenceChanged: true,
			approved: true,
			arrival: { date: "2024-03-01", source: "estimated" },
		});
	});

	it("flags stays whose photo has another day or country in a replacing CSV", async () => {
		const user = userEvent.setup();
		const db = await seed(false);
		await db.locations.put({
			date: "2024-05-10T12:00:00+09:00",
			lat: 35,
			lon: 139,
			countryCode: "JP",
			country: "Japan",
			city: "Tokyo",
			source: "apple",
			isVideo: false,
			filename: "a.jpg",
			uuid: "u1",
		});
		const jp: TravelStay = {
			id: "jp",
			countryCode: "JP",
			place: "",
			kind: "stay",
			arrival: { date: "2024-05-10", source: "photos", method: "unknown" },
			departure: { date: "2024-05-10", source: "photos", method: "unknown" },
			stampIds: [],
			photoIds: ["u1"],
			approved: true,
		};
		await db.stays.bulkPut([jp, { ...jp, id: "other", photoIds: [] }]);
		renderApp("/collect/locations", { db });
		await user.upload(
			await screen.findByLabelText(PICKER),
			new File(
				[
					[
						"date,lat,lon,country_code,country,city,source,is_video,filename,uuid",
						"2024-05-12T12:00:00,37,127,KR,Korea,Seoul,apple,False,a.jpg,u1",
					].join("\n"),
				],
				"photo_locations.csv",
				{ type: "text/csv" },
			),
		);
		await screen.findByText(/Imported 1 location/);
		expect(await db.stays.get("jp")).toMatchObject({
			photoIds: ["u1"],
			evidenceChanged: true,
		});
		expect((await db.stays.get("other"))?.evidenceChanged).toBeUndefined();
	});

	it("keeps the flag on Undo when a stamp only an edge reads changed since", async () => {
		const db = await seed();
		const ro = await romania(db);
		// As after a rebuild: the departure meets Moldova's entry stamp, not in stampIds.
		await db.stays.put({
			...ro,
			stampIds: ["s2", "s3"],
			departure: { ...ro.departure, source: "stamp", stampId: "s4" },
		});
		const undo = await deleteStamp(db, STAMPS[1] as Stamp);
		await updateStamp(db, "s4", { date: "2024-03-06" });
		await restoreStamp(db, STAMPS[1] as Stamp, undo);
		expect(await romania(db)).toMatchObject({
			stampIds: ["s2", "s3"],
			arrival: { source: "stamp", stampId: "s2" },
			evidenceChanged: true,
		});
	});
});
