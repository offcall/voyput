import type { LocationRow, Passport } from "@voyput/core";
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
});
