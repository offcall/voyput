import type { Passport, Stamp } from "@voyput/core";
import { describe, expect, it } from "vitest";
import type { AiAnswer, AiClient } from "../src/ai/openrouter";
import { type PhotoRecord, VoyputDb } from "../src/db/db";
import { extractPhoto } from "../src/features/extract/extractPhoto";
import { runsFor } from "../src/features/extract/runs";
import { type Backup, restoreBackup } from "../src/settings/backup";

// Synthetic data only.

const passport: Passport = {
	id: "p1",
	name: "Blue",
	validFrom: null,
	validTo: null,
	createdAt: "2024-01-01T00:00:00Z",
};

const photo: PhotoRecord = {
	id: "ph1",
	passportId: "p1",
	name: "page-1.png",
	mimeType: "image/png",
	rotation: 0,
	addedAt: "2024-01-01T00:00:00Z",
	blob: new Blob(["x"], { type: "image/png" }),
};

const imported: Stamp = {
	id: "imported",
	passportId: "p1",
	photoId: "ph1",
	direction: "entry",
	borderCrossing: "plane",
	dateText: "01.02.20",
	date: "2020-02-01",
	country: "Testland",
	countryCode: "ZZ",
	location: null,
	confidence: 80,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: false,
};

const { blob: _blob, ...photoMeta } = photo;
const backup: Backup = {
	exportedAt: "2026-01-01T00:00:00.000Z",
	dbVersion: 5,
	includesPhotos: true,
	settings: {
		model: "test/model",
		reasoningEffort: "low",
		locationWindowDays: 10,
		aiProvider: "openrouter",
		localEngine: "auto",
		localPort: 47615,
	},
	tables: {
		passports: [passport],
		photos: [{ ...photoMeta, data: "eA==" }],
		extractions: [
			{
				photoId: "ph1",
				status: "ok",
				notes: "from the backup",
				model: "test/model",
				seconds: 1,
				finishedAt: "2026-01-01T00:00:00Z",
			},
		],
		stamps: [imported],
		locations: [],
		stays: [],
		kv: [],
	},
};

const answer = (stamps: object[]): AiAnswer => ({
	cost: null,
	text: JSON.stringify({ notes: "late answer", stamps }),
});

describe("backup import during an extraction run", () => {
	it.each([
		["an answer", (p: Pending) => p.resolve(answer([LATE_STAMP]))],
		["a failure", (p: Pending) => p.reject(new Error("timeout"))],
	])("keeps the imported data when %s comes late", async (name, settle) => {
		const db = new VoyputDb(`backup-run-${name}`);
		await db.passports.put(passport);
		await db.photos.put(photo);
		const pending: Pending[] = [];
		const ai: AiClient = {
			askAboutImage: () =>
				new Promise<AiAnswer>((resolve, reject) =>
					pending.push({ resolve, reject }),
				),
			listImageModels: () => Promise.reject(new Error("no network")),
		};
		const settings = {
			openRouterKey: "k",
			model: "test/model",
			reasoningEffort: "low" as const,
		};
		const runs = runsFor(db);
		const run = runs.start([photo], (p, current) =>
			extractPhoto(db, ai, settings, passport, p, current),
		);
		await expect.poll(() => pending.length).toBe(1);

		// What Settings > Your data does on import.
		runs.cancel();
		await restoreBackup(db, backup);
		const [first] = pending;
		if (first) settle(first);
		await run;

		expect((await db.stamps.toArray()).map((s) => s.id)).toEqual(["imported"]);
		expect((await db.extractions.get("ph1"))?.notes).toBe("from the backup");
	});
});

interface Pending {
	resolve: (a: AiAnswer) => void;
	reject: (e: Error) => void;
}

const LATE_STAMP = {
	direction: "exit",
	dateText: "10.07.19",
	date: "2019-07-10",
	country: "MD",
	countryCode: "MD",
	location: null,
	confidence: 90,
};
