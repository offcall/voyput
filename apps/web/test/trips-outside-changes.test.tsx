import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Stamp, suggestHistory, type TravelStay } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { deleteStamp } from "../src/features/review/reviewStore";
import { saveStayChanges } from "../src/features/trips/tripStore";
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

/** Moldova → Romania (approved) → Moldova. */
const STAMPS = [
	stamp("s1", "2024-03-01", "MD", "exit"),
	stamp("s2", "2024-03-01", "RO", "entry"),
	stamp("s3", "2024-03-05", "RO", "exit", "ph2"),
	stamp("s4", "2024-03-05", "MD", "entry", "ph2"),
];

let n = 0;

async function seed() {
	const db = new VoyputDb(`trips-outside-${++n}`);
	await db.stamps.bulkPut(STAMPS);
	const stays = suggestHistory({
		stamps: STAMPS,
		locations: [],
		birthCountry: null,
		birth: null,
		dismissed: [],
	}).map((s) => (s.countryCode === "RO" ? { ...s, approved: true } : s));
	await db.stays.bulkPut(stays);
	return { db, stays };
}

const byCountry = (stays: readonly TravelStay[], code: string) =>
	stays.find((s) => s.countryCode === code) as TravelStay;

describe("saving stays as a diff", () => {
	it("keeps a stamp edit written after the page read the history", async () => {
		const { db, stays: loaded } = await seed();
		const ro = byCountry(loaded, "RO");
		// Elsewhere, after the page loaded: a stamp of Romania is deleted.
		await deleteStamp(db, STAMPS[2] as Stamp);

		// The page edits another stay, then Romania itself.
		const first = loaded.map((s) =>
			s.id === ro.id ? s : { ...s, place: "Chișinău" },
		);
		await saveStayChanges(db, loaded, first);
		const second = first.map((s) =>
			s.id === ro.id ? { ...s, place: "Bucharest" } : s,
		);
		await saveStayChanges(db, first, second);

		const stored = (await db.stays.get(ro.id)) as TravelStay;
		expect(stored).toMatchObject({
			place: "Bucharest",
			evidenceChanged: true,
			stampIds: ["s2"],
			approved: true,
		});
		expect(
			(await db.stays.toArray()).filter((s) => s.place === "Chișinău"),
		).toHaveLength(2);
	});

	it("drops the flag only when the edit resolves it, and deletes removed stays", async () => {
		const { db } = await seed();
		await deleteStamp(db, STAMPS[2] as Stamp);
		const flagged = await db.stays.toArray();
		const ro = byCountry(flagged, "RO");
		const { evidenceChanged: _, ...kept } = ro;
		const md = byCountry(flagged, "MD");
		const after = flagged
			.filter((s) => s.id !== md.id)
			.map((s) => (s.id === ro.id ? { ...kept, edited: true } : s));
		await saveStayChanges(db, flagged, after);
		expect((await db.stays.get(ro.id))?.evidenceChanged).toBeUndefined();
		expect(await db.stays.get(md.id)).toBeUndefined();
		expect(await db.stays.count()).toBe(2);
	});

	it("does not bring back a stay deleted elsewhere", async () => {
		const { db, stays: loaded } = await seed();
		const md = byCountry(loaded, "MD");
		await db.stays.delete(md.id);
		await saveStayChanges(
			db,
			loaded,
			loaded.map((s) => (s.id === md.id ? { ...s, place: "Chișinău" } : s)),
		);
		expect(await db.stays.get(md.id)).toBeUndefined();
	});
});

const approved = async (db: VoyputDb) =>
	(await db.stays.toArray()).filter((s) => s.approved).length;

describe("Stays page and outside changes", () => {
	it("shows an outside change and Undo does not restore the stale history", async () => {
		const user = userEvent.setup();
		const { db } = await seed();
		renderApp("/collect/trips", { db });
		await screen.findByRole("button", { name: /^2\. Romania,/ });

		// An edit on the page, so there is something to undo.
		await user.click(screen.getByRole("button", { name: /^✓ Approve \d/ }));
		await waitFor(async () => expect(await approved(db)).toBeGreaterThan(1));
		const approvedByPage = await approved(db);

		// Elsewhere (Review, another tab): a stamp of Romania is deleted.
		await deleteStamp(db, STAMPS[2] as Stamp);
		expect(
			await screen.findByRole("button", { name: "Keep Romania as is" }),
		).toBeTruthy();

		// Undo has nothing older than the outside change to bring back.
		await user.keyboard("{Control>}z{/Control}");
		const ro = byCountry(await db.stays.toArray(), "RO");
		expect(ro).toMatchObject({ evidenceChanged: true, stampIds: ["s2"] });
		expect(await approved(db)).toBe(approvedByPage);

		// An edit after it keeps the flag on the stays it did not resolve.
		await user.click(
			screen.getByRole("button", { name: "Keep Romania as is" }),
		);
		await waitFor(async () =>
			expect((await db.stays.get(ro.id))?.evidenceChanged).toBeUndefined(),
		);
		expect((await db.stays.get(ro.id))?.stampIds).toEqual(["s2"]);
	});
});
