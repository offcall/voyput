import type { LegacyTrip, LocationRow, Passport } from "@voyput/core";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { LEGACY_TRIPS_KEY, VoyputDb } from "../src/db/db";

const passport: Passport = {
	id: "p1",
	name: "Demo",
	validFrom: null,
	validTo: null,
	createdAt: "2026-01-01",
};
const row: LocationRow = {
	date: "2024-05-01T10:00:00",
	lat: 41.39,
	lon: 2.17,
	countryCode: "ES",
	country: "Spain",
	city: "Barcelona",
	source: "apple",
	isVideo: false,
	filename: "IMG_1.jpg",
	uuid: "u1",
};

/** The database as version 2 left it, with its `trips` table. */
function oldDb(name: string): Dexie {
	const old = new Dexie(name);
	old.version(2).stores({
		passports: "id",
		photos: "id, passportId",
		extractions: "photoId",
		stamps: "id, passportId, photoId, date",
		locations: "uuid, date, countryCode",
		trips: "id, start",
		kv: "key",
	});
	return old;
}

const spain: LegacyTrip = {
	id: "t1",
	title: "Barcelona",
	start: "2024-04-30",
	end: "2024-05-03",
	confirmed: true,
	arrival: { date: "2024-04-30", source: "manual", method: "plane" },
	departure: { date: "2024-05-03", source: "manual", method: "plane" },
	stops: [
		{
			id: "s",
			day: "2024-05-01",
			countryCode: "ES",
			country: "Spain",
			cities: ["Barcelona"],
			kind: "stay",
		},
	],
	stampIds: [],
};

/** Country, arrival, departure of the stored stays, in date order. */
async function storedStays(db: VoyputDb) {
	return (await db.stays.toArray())
		.sort((a, b) => (a.arrival.date ?? "").localeCompare(b.arrival.date ?? ""))
		.map((s) => [s.countryCode, s.arrival.date, s.departure.date]);
}

describe("database", () => {
	it("keeps photos and does not duplicate re-imported locations after reopening", async () => {
		const first = new VoyputDb("db-roundtrip");
		await first.passports.put(passport);
		await first.photos.put({
			id: "ph1",
			passportId: "p1",
			name: "page1.png",
			mimeType: "image/png",
			rotation: 90,
			addedAt: "2026-01-01",
			blob: new Blob(["png-bytes"], { type: "image/png" }),
		});
		await first.locations.bulkPut([row, row]);
		first.close();

		const second = new VoyputDb("db-roundtrip");
		const photo = await second.photos.get("ph1");
		expect(photo?.rotation).toBe(90);
		expect(photo?.blob).toBeTruthy();
		expect(await second.photos.where("passportId").equals("p1").count()).toBe(
			1,
		);
		expect(await second.locations.count()).toBe(1);
		second.close();
	});

	it("turns stored trips into stays inside a suggested history", async () => {
		const old = oldDb("db-migrate");
		const trip: LegacyTrip = {
			id: "t1",
			title: "Barcelona",
			start: "2024-04-30",
			end: "2024-05-03",
			confirmed: true,
			arrival: { date: "2024-04-30", source: "manual", method: "plane" },
			departure: { date: "2024-05-03", source: "manual", method: "plane" },
			stops: [
				{
					id: "s",
					day: "2024-05-01",
					countryCode: "ES",
					country: "Spain",
					cities: ["Barcelona"],
					kind: "stay",
				},
			],
			stampIds: [],
		};
		await old.table("trips").put(trip);
		await old
			.table("locations")
			.bulkPut([
				row,
				{ ...row, uuid: "u2", date: "2024-05-10T10:00:00", countryCode: "UA" },
			]);
		await old.table("kv").put({ key: "trips:home", value: "UA" });
		old.close();

		const db = new VoyputDb("db-migrate");
		const stays = await db.stays.toArray();
		expect(
			stays
				.sort((a, b) =>
					(a.arrival.date ?? "").localeCompare(b.arrival.date ?? ""),
				)
				.map((s) => [
					s.countryCode,
					s.arrival.date,
					s.departure.date,
					s.approved,
				]),
		).toEqual([
			["UA", null, "2024-04-30", false],
			["ES", "2024-04-30", "2024-05-03", true],
			["UA", "2024-05-03", null, false],
		]);
		expect(db.tables.map((t) => t.name)).not.toContain("trips");
		db.close();
	});

	it("keeps deleted trips deleted: their periods stay home", async () => {
		const old = oldDb("db-migrate-dismissed");
		await old.table("trips").put(spain);
		await old
			.table("locations")
			.bulkPut([
				row,
				{ ...row, uuid: "u2", date: "2024-06-01T10:00:00", countryCode: "PL" },
				{ ...row, uuid: "u3", date: "2024-06-10T10:00:00", countryCode: "UA" },
			]);
		await old.table("kv").bulkPut([
			{ key: "trips:home", value: "UA" },
			{
				key: "trips:dismissed",
				value: [{ start: "2024-05-31", end: "2024-06-05" }],
			},
		]);
		old.close();

		const db = new VoyputDb("db-migrate-dismissed");
		expect(await storedStays(db)).toEqual([
			["UA", null, "2024-04-30"],
			["ES", "2024-04-30", "2024-05-03"],
			["UA", "2024-05-03", null],
		]);
		db.close();
	});

	it("places trips without stops by their stamps or title, keeps the rest", async () => {
		const old = oldDb("db-migrate-stopless");
		const bare = (id: string, title: string, start: string, end: string) => ({
			...spain,
			id,
			title,
			start,
			end,
			arrival: { date: start, source: "manual", method: "car" },
			departure: { date: end, source: "manual", method: "car" },
			stops: [],
			stampIds: id === "stamped" ? ["st1"] : [],
		});
		await old
			.table("trips")
			.bulkPut([
				bare("stamped", "Weekend", "2024-02-01", "2024-02-03"),
				bare("titled", "Lisbon, Portugal", "2024-03-01", "2024-03-04"),
				bare("lost", "Lost weekend", "2024-04-05", "2024-04-07"),
			]);
		await old.table("stamps").put({
			id: "st1",
			passportId: "p1",
			photoId: "ph1",
			direction: "entry",
			borderCrossing: "car",
			dateText: "",
			date: "2024-02-01",
			country: "Romania",
			countryCode: "RO",
			location: null,
			confidence: null,
			notes: "",
			problem: null,
			source: "manual",
			reviewed: true,
		});
		await old.table("kv").put({ key: "trips:home", value: "UA" });
		old.close();

		const db = new VoyputDb("db-migrate-stopless");
		expect(await storedStays(db)).toEqual([
			["UA", null, "2024-02-01"],
			["RO", "2024-02-01", "2024-02-03"],
			["UA", "2024-02-03", "2024-03-01"],
			["PT", "2024-03-01", "2024-03-04"],
			["UA", "2024-03-04", null],
		]);
		const kept = await db.kv.get(LEGACY_TRIPS_KEY);
		expect(
			Array.isArray(kept?.value) && kept.value.map((t: LegacyTrip) => t.id),
		).toEqual(["lost"]);
		db.close();
	});
});
