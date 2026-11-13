import type { LegacyTrip, LocationRow, Passport } from "@voyput/core";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";

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
		const old = new Dexie("db-migrate");
		old.version(2).stores({
			passports: "id",
			photos: "id, passportId",
			extractions: "photoId",
			stamps: "id, passportId, photoId, date",
			locations: "uuid, date, countryCode",
			trips: "id, start",
			kv: "key",
		});
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
});
