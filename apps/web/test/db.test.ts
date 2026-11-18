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
			["ES", "2024-04-30", "2024-05-03", true],
			["UA", "2024-05-03", null, false],
		]);
		expect(db.tables.map((t) => t.name)).not.toContain("trips");
		expect(await db.kv.get("trips:home")).toBeUndefined();
		db.close();
	});

	it("keeps deleted trips deleted: nothing begins in their periods", async () => {
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
		// No evidence between the trip and the UA photo: the gap stays open.
		expect(await storedStays(db)).toEqual([
			["ES", "2024-04-30", "2024-05-03"],
			["UA", "2024-06-10", null],
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
			["RO", "2024-02-01", "2024-02-03"],
			["PT", "2024-03-01", "2024-03-04"],
		]);
		const kept = await db.kv.get(LEGACY_TRIPS_KEY);
		expect(
			Array.isArray(kept?.value) && kept.value.map((t: LegacyTrip) => t.id),
		).toEqual(["lost"]);
		db.close();
	});

	it("drops only provably generated home stays from a stored history (version 5)", async () => {
		const old = new Dexie("db-migrate-home");
		old.version(4).stores({
			passports: "id",
			photos: "id, passportId",
			extractions: "photoId",
			stamps: "id, passportId, photoId, date",
			locations: "uuid, date, countryCode",
			stays: "id",
			kv: "key",
		});
		const edge = (date: string | null, method = "unknown") => ({
			date,
			source: "estimated",
			method,
		});
		const stay = (
			id: string,
			countryCode: string,
			arrival: string | null,
			departure: string | null,
			extra: Record<string, unknown> = {},
		) => ({
			id,
			countryCode,
			place: "",
			kind: "stay",
			arrival: edge(arrival),
			departure: edge(departure),
			stampIds: [],
			photoIds: [],
			approved: false,
			...extra,
		});
		await old.table("stays").bulkPut([
			// Made up by the old suggestion and untouched: these go.
			stay("stay-birth-ua", "UA", null, "2024-04-30"),
			stay("stay-2024-05-03-ua-home", "UA", "2024-05-03", "2024-06-01", {
				// Inferred from the stay before it, as the old builder did.
				arrival: edge("2024-05-03", "plane"),
			}),
			// Evidence: stays.
			stay("stay-2024-04-30-es", "ES", "2024-04-30", "2024-05-03", {
				photoIds: ["u1"],
				departure: edge("2024-05-03", "plane"),
			}),
			// Edits version 4 could not flag: all stay.
			stay("stay-2024-06-01-ua", "PL", "2024-06-01", "2024-06-10"),
			stay("stay-2024-06-10-ua", "UA", "2024-06-10", "2024-06-20", {
				kind: "transit",
			}),
			stay("stay-2024-06-20-ua", "UA", "2024-06-20", "2024-07-01", {
				arrival: edge("2024-06-20", "ship"),
			}),
			stay("stay-2024-07-01-ua", "UA", "2024-07-01", "2024-07-10", {
				place: "Kyiv",
			}),
			stay("stay-2024-07-10-ua", "UA", "2024-07-10", "2024-08-01", {
				arrival: { ...edge("2024-07-10"), source: "manual" },
			}),
			stay("stay-2024-08-01-ua", "UA", "2024-08-01", null, {
				approved: true,
			}),
		]);
		await old.table("kv").put({ key: "trips:home", value: "UA" });
		old.close();

		const db = new VoyputDb("db-migrate-home");
		expect((await db.stays.toArray()).map((s) => s.id).sort()).toEqual([
			"stay-2024-04-30-es",
			"stay-2024-06-01-ua",
			"stay-2024-06-10-ua",
			"stay-2024-06-20-ua",
			"stay-2024-07-01-ua",
			"stay-2024-07-10-ua",
			"stay-2024-08-01-ua",
		]);
		expect(await db.kv.get("trips:home")).toBeUndefined();
		db.close();
	});
});
