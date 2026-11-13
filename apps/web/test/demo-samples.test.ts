import { type Stamp, type Trip, usableStamps } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import {
	DEMO_SAMPLES_ID,
	type FetchFile,
	loadDemo,
	removeDemo,
} from "../src/features/demo/loadDemo";
import { readDemoFile, seedDemo } from "./fixtures/demo";

describe("demo sample pages from Wikimedia Commons", () => {
	it("loads the sample passport with unreviewed model stamps that feed no trips", async () => {
		const db = new VoyputDb("demo-samples-load");
		const summary = await seedDemo(db);
		expect(summary.samples).toEqual({ pages: 10, stamps: 38 });

		const passport = await db.passports.get(DEMO_SAMPLES_ID);
		expect(passport?.name).toBe("Sample stamps (Wikimedia Commons)");
		const photos = await db.photos
			.where("passportId")
			.equals(DEMO_SAMPLES_ID)
			.toArray();
		expect(photos).toHaveLength(10);
		expect(photos.every((p) => p.mimeType === "image/jpeg")).toBe(true);

		const stamps = await db.stamps
			.where("passportId")
			.equals(DEMO_SAMPLES_ID)
			.toArray();
		expect(stamps).toHaveLength(38);
		expect(stamps.every((s) => s.source === "ai" && !s.reviewed)).toBe(true);
		expect(usableStamps(stamps)).toEqual([]);

		const extraction = await db.extractions.get(photos[0]?.id ?? "");
		expect(extraction).toMatchObject({
			status: "ok",
			model: "google/gemini-3.8-flash",
		});
	});

	it("removes the sample passport unless the user added a photo to it", async () => {
		const db = new VoyputDb("demo-samples-remove");
		await seedDemo(db);
		await removeDemo(db);
		expect(await db.passports.get(DEMO_SAMPLES_ID)).toBeUndefined();
		expect(await db.photos.count()).toBe(0);
		expect(await db.stamps.count()).toBe(0);

		await seedDemo(db);
		await db.photos.put({
			id: "mine-photo",
			passportId: DEMO_SAMPLES_ID,
			name: "scan.jpg",
			mimeType: "image/jpeg",
			rotation: 0,
			addedAt: "2026-01-01T00:00:00.000Z",
			blob: new Blob(["x"], { type: "image/jpeg" }),
		});
		await removeDemo(db);
		expect(await db.passports.get(DEMO_SAMPLES_ID)).toBeTruthy();
		expect(await db.photos.count()).toBe(1);
	});

	it("removes stamps the user added on a sample page and trips built on them", async () => {
		const db = new VoyputDb("demo-samples-added-stamp");
		await seedDemo(db);
		const added: Stamp = {
			id: "3f1c9a52-0000-4000-8000-000000000001",
			passportId: DEMO_SAMPLES_ID,
			photoId: "demo-photo-sample-03",
			direction: "entry",
			borderCrossing: "plane",
			dateText: "21 08 05",
			date: "2005-08-21",
			country: "Turkey",
			countryCode: "TR",
			location: null,
			confidence: null,
			notes: "",
			problem: null,
			source: "manual",
			reviewed: true,
		};
		await db.stamps.put(added);
		const trip = (id: string, stampIds: string[]): Trip => ({
			id,
			title: id,
			start: "2005-08-21",
			end: "2005-09-05",
			confirmed: true,
			arrival: { date: "2005-08-21", source: "stamp", method: "plane" },
			departure: { date: "2005-09-05", source: "manual", method: "ship" },
			stops: [],
			stampIds,
		});
		await db.trips.bulkPut([
			trip("on-sample-stamp", [added.id]),
			trip("own-trip", ["mine-stamp"]),
		]);

		await removeDemo(db);
		expect(await db.stamps.get(added.id)).toBeUndefined();
		expect(await db.stamps.count()).toBe(0);
		expect(await db.trips.get("on-sample-stamp")).toBeUndefined();
		expect(await db.trips.get("own-trip")).toBeTruthy();
	});

	it("rejects a samples file with a stamp that is not a demo row", async () => {
		const db = new VoyputDb("demo-samples-invalid");
		const fetchFile: FetchFile = async (name) => {
			const blob = await readDemoFile(name);
			if (name !== "samples.json") return blob;
			const samples = JSON.parse(await blob.text());
			samples.stamps[0].id = "user-stamp";
			return new Blob([JSON.stringify(samples)]);
		};
		await expect(loadDemo(db, fetchFile)).rejects.toThrow(
			"samples.json is not valid demo data",
		);
		expect(await db.passports.count()).toBe(0);
	});
});
