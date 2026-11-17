import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Stamp, suggestHistory, type TravelStay } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import {
	deletePassport,
	deletePhoto,
} from "../src/features/import/photos/passportStore";
import {
	deleteStamp,
	restoreStamp,
	updateStamp,
} from "../src/features/review/reviewStore";
import { renderApp } from "./renderApp";

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
		expect(changed.map((s) => s.id)).toEqual([before.id]);

		await restoreStamp(db, STAMPS[2] as Stamp, changed);
		expect(await db.stamps.get("s3")).toBeTruthy();
		expect(await romania(db)).toEqual(before);
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
});
