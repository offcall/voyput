import { Blob as NodeBlob } from "node:buffer";
import type { Passport, Stamp, TravelStay } from "@voyput/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type PhotoRecord, VoyputDb } from "../src/db/db";
import {
	BACKUP_TABLES,
	BackupError,
	exportBackup,
	parseBackup,
	restoreBackup,
} from "../src/settings/backup";
import { DEFAULT_SETTINGS, type Settings } from "../src/settings/settings";
import { seedDemo } from "./fixtures/demo";

// Synthetic data only: made-up ids, places and bytes.

// fake-indexeddb clones with Node's structuredClone, which drops jsdom's Blob
// bytes; Node's own Blob survives it, as a browser's Blob survives IndexedDB.
beforeAll(() => {
	vi.stubGlobal("Blob", NodeBlob);
});
afterAll(() => {
	vi.unstubAllGlobals();
});

const NOW = new Date("2026-03-04T05:06:07.000Z");
const SECRET_KEY = "sk-or-test-secret-key";
const SECRET_TOKEN = "pairing-token-secret";
const settings: Settings = {
	...DEFAULT_SETTINGS,
	openRouterKey: SECRET_KEY,
	localToken: SECRET_TOKEN,
	model: "test/model",
	locationWindowDays: 14,
};

const passport: Passport = {
	id: "p1",
	name: "Test passport",
	validFrom: "2020-01-01",
	validTo: null,
	createdAt: "2026-01-01T00:00:00Z",
};

const stamp = (i: number): Stamp => ({
	id: `s${i}`,
	passportId: "p1",
	photoId: `ph${i % 2}`,
	direction: i % 2 ? "exit" : "entry",
	borderCrossing: "plane",
	dateText: `${i}.01.21`,
	// Stamp 0 has a stored year no traveller could have, which reads as no date (ADR 0044).
	date:
		i === 0 ? "0027-10-02" : `2021-01-${String((i % 28) + 1).padStart(2, "0")}`,
	country: "Testland",
	countryCode: "ZZ",
	location: null,
	confidence: i % 3 ? 80 : null,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: i % 2 === 0,
	...(i === 0 ? { dismissed: { problem: true }, readDate: null } : {}),
	...(i === 1 ? { box: { x: 0.1, y: 0.2, width: 0.3, height: 0.25 } } : {}),
});

const stay: TravelStay = {
	id: "st1",
	countryCode: "ZZ",
	place: "Nowhere",
	kind: "stay",
	arrival: {
		date: "2021-01-01",
		source: "stamp",
		method: "plane",
		stampId: "s0",
	},
	departure: { date: null, source: "estimated", method: "unknown" },
	stampIds: ["s0"],
	photoIds: ["u1"],
	approved: true,
	evidenceChanged: true,
};

const photo = (i: number, bytes: number[]): PhotoRecord => ({
	id: `ph${i}`,
	passportId: "p1",
	name: `page-${i}.png`,
	mimeType: "image/png",
	rotation: 90,
	size: bytes.length,
	addedAt: "2026-01-02T00:00:00Z",
	blob: new Blob([new Uint8Array(bytes)], { type: "image/png" }),
});

let dbCount = 0;
async function filledDb(): Promise<VoyputDb> {
	const db = new VoyputDb(`backup-${++dbCount}`);
	await db.passports.put(passport);
	await db.photos.bulkPut([
		photo(0, [0, 1, 2, 250, 255]),
		photo(
			1,
			Array.from({ length: 70_000 }, (_, i) => i % 256),
		),
	]);
	await db.extractions.put({
		photoId: "ph0",
		status: "ok",
		notes: "2 stamps",
		model: "test/model",
		seconds: 3.5,
		finishedAt: "2026-01-03T00:00:00Z",
	});
	await db.stamps.bulkPut(Array.from({ length: 5 }, (_, i) => stamp(i)));
	await db.locations.put({
		date: "2021-01-01T10:00:00+01:00",
		lat: 1.5,
		lon: -2.25,
		countryCode: "ZZ",
		country: "Testland",
		city: "Nowhere",
		source: "test",
		isVideo: false,
		filename: "IMG_0001.HEIC",
		uuid: "u1",
	});
	await db.stays.put(stay);
	await db.kv.bulkPut([
		{ key: "trips:birth", value: "1990-02-03" },
		{ key: "review:ui", value: { view: "all", nested: [1, null] } },
	]);
	return db;
}

/** Every table as stored (no reading hook), photos with their bytes, for comparison. */
async function snapshot(db: VoyputDb) {
	const out: Record<string, unknown[]> = {};
	for (const table of db.tables) {
		const rows = await table.toCollection().raw().toArray();
		out[table.name] =
			table.name === "photos"
				? await Promise.all(
						(rows as PhotoRecord[]).map(async ({ blob, ...meta }) => ({
							...meta,
							type: blob.type,
							bytes: [...new Uint8Array(await blob.arrayBuffer())],
						})),
					)
				: rows;
	}
	return out;
}

const exportText = async (db: VoyputDb, includePhotos = true) =>
	(await exportBackup(db, { includePhotos, settings, now: NOW })).text();

describe("backup file", () => {
	it("covers every table of the database", () => {
		const db = new VoyputDb("backup-tables");
		expect([...BACKUP_TABLES].sort()).toEqual(
			db.tables.map((t) => t.name).sort(),
		);
	});

	it("round trips: export, wipe, import gives the same data", async () => {
		const db = await filledDb();
		const before = await snapshot(db);
		const text = await exportText(db);
		await db.transaction("rw", db.tables, () =>
			Promise.all(db.tables.map((t) => t.clear())),
		);
		expect(await db.stamps.count()).toBe(0);

		const backup = parseBackup(text, db.verno);
		await restoreBackup(db, backup);
		expect(await snapshot(db)).toEqual(before);
		const [restored] = await db.stamps.where("id").equals("s0").raw().toArray();
		expect(restored).toMatchObject({
			date: "0027-10-02",
			problem: null,
			dismissed: { problem: true },
		});
		expect(backup.exportedAt).toBe(NOW.toISOString());
		expect(backup.settings.model).toBe("test/model");
		expect(backup.settings.locationWindowDays).toBe(14);
	});

	it("never writes the OpenRouter key or the pairing token", async () => {
		const text = await exportText(await filledDb());
		expect(text).not.toContain(SECRET_KEY);
		expect(text).not.toContain(SECRET_TOKEN);
		const raw = JSON.parse(text);
		expect(raw.settings).not.toHaveProperty("openRouterKey");
		expect(raw.settings).not.toHaveProperty("localToken");
		expect(raw).toMatchObject({
			format: "voyput-backup",
			version: 1,
			dbVersion: 5,
			includesPhotos: true,
		});
	});

	it("leaves the photos out when asked, and keeps the rest", async () => {
		const db = await filledDb();
		const raw = JSON.parse(await exportText(db, false));
		expect(raw.includesPhotos).toBe(false);
		expect(raw.tables.photos).toEqual([]);
		expect(raw.tables.stamps).toHaveLength(5);

		const backup = parseBackup(JSON.stringify(raw), db.verno);
		await restoreBackup(db, backup);
		expect(await db.photos.count()).toBe(0);
		expect(await db.stamps.count()).toBe(5);
	});

	it.each([
		["not JSON", () => "{oops", /not JSON/],
		[
			"another format",
			(r: Record<string, unknown>) => ({ ...r, format: "x" }),
			/not a voyput backup/,
		],
		[
			"a newer file format",
			(r: Record<string, unknown>) => ({ ...r, version: 2 }),
			/newer voyput/,
		],
		[
			"an older database",
			(r: Record<string, unknown>) => ({ ...r, dbVersion: 4 }),
			/database version 4/,
		],
		[
			"a newer database",
			(r: Record<string, unknown>) => ({ ...r, dbVersion: 9 }),
			/newer voyput/,
		],
		[
			"a missing table",
			(r: Record<string, unknown>) => {
				const { stays: _gone, ...tables } = r.tables as Record<string, unknown>;
				return { ...r, tables };
			},
			/no "stays" list/,
		],
		[
			"a wrong row",
			(r: Record<string, unknown>) => {
				const tables = r.tables as Record<string, unknown[]>;
				return {
					...r,
					tables: {
						...tables,
						stamps: [...(tables.stamps ?? []), { id: "s9" }],
					},
				};
			},
			/stamp 6 of 6 is not valid/,
		],
		[
			"a duplicate key",
			(r: Record<string, unknown>) => {
				const tables = r.tables as Record<string, unknown[]>;
				return { ...r, tables: { ...tables, stays: [stay, stay] } };
			},
			/same id/,
		],
		[
			"broken photo bytes",
			(r: Record<string, unknown>) => {
				const tables = r.tables as Record<string, Record<string, unknown>[]>;
				const photos = (tables.photos ?? []).map((p) => ({
					...p,
					data: "!!!",
				}));
				return { ...r, tables: { ...tables, photos } };
			},
			/page photo 1 of 2/,
		],
	])("rejects %s and keeps the old data", async (_name, change, message) => {
		const db = await filledDb();
		const before = await snapshot(db);
		const raw = JSON.parse(await exportText(db));
		const result = change(raw);
		const text = typeof result === "string" ? result : JSON.stringify(result);
		expect(() => parseBackup(text, db.verno)).toThrow(BackupError);
		expect(() => parseBackup(text, db.verno)).toThrow(message);
		expect(await snapshot(db)).toEqual(before);
	});

	it.each([
		[
			"a stamp date that is no calendar day",
			"stamps",
			1,
			{ date: "2021-02-30" },
			/stamp 2 of 5 is not valid \(its "date" is wrong\)/,
		],
		[
			"a stamp date that is not a date",
			"stamps",
			1,
			{ date: "soon" },
			/stamp 2 of 5 is not valid/,
		],
		[
			"a passport date that is no calendar day",
			"passports",
			0,
			{ validFrom: "2020-13-01" },
			/passport 1 of 1 .*"validFrom"/,
		],
		[
			"a stay date that is no calendar day",
			"stays",
			0,
			{ arrival: { ...stay.arrival, date: "2021-1-1" } },
			/stay 1 of 1 .*"arrival"/,
		],
		[
			"a location without a day",
			"locations",
			0,
			{ date: "yesterday" },
			/photo location 1 of 1 .*"date"/,
		],
		[
			"a latitude out of range",
			"locations",
			0,
			{ lat: 999 },
			/photo location 1 of 1 .*"lat"/,
		],
		[
			"a longitude out of range",
			"locations",
			0,
			{ lon: -181 },
			/photo location 1 of 1 .*"lon"/,
		],
		[
			"empty photo bytes",
			"photos",
			0,
			{ data: "" },
			/page photo 1 of 2 .*"data"/,
		],
		[
			"a page of a missing passport",
			"photos",
			1,
			{ passportId: "p9" },
			/page photo 2 of 2 points to a passport/,
		],
		[
			"a stamp of a missing passport",
			"stamps",
			2,
			{ passportId: "p9" },
			/stamp 3 of 5 points to a passport/,
		],
		[
			"a stamp on a missing page",
			"stamps",
			3,
			{ photoId: "ph9" },
			/stamp 4 of 5 points to a page photo/,
		],
		[
			"an extraction of a missing page",
			"extractions",
			0,
			{ photoId: "ph9" },
			/extraction result 1 of 1 points to a page photo/,
		],
		[
			"a stay on a missing stamp",
			"stays",
			0,
			{ stampIds: ["s9"] },
			/stay 1 of 1 points to a stamp/,
		],
		[
			"a stay edge on a missing stamp",
			"stays",
			0,
			{ departure: { ...stay.departure, stampId: "s9" } },
			/stay 1 of 1 points to a stamp/,
		],
		[
			"a stay on a missing photo location",
			"stays",
			0,
			{ photoIds: ["u9"] },
			/stay 1 of 1 points to a photo location/,
		],
	] as const)(
		"rejects %s and keeps the old data",
		async (_name, table, row, patch, message) => {
			const db = await filledDb();
			const before = await snapshot(db);
			const raw = JSON.parse(await exportText(db));
			const rows = [...raw.tables[table]];
			rows[row] = { ...rows[row], ...patch };
			const text = JSON.stringify({
				...raw,
				tables: { ...raw.tables, [table]: rows },
			});
			expect(() => parseBackup(text, db.verno)).toThrow(BackupError);
			expect(() => parseBackup(text, db.verno)).toThrow(message);
			expect(await snapshot(db)).toEqual(before);
		},
	);

	it("keeps stamps on pages and extractions that a file without photos leaves out", () => {
		const raw = {
			format: "voyput-backup",
			version: 1,
			exportedAt: NOW.toISOString(),
			dbVersion: 5,
			includesPhotos: false,
			settings: {},
			tables: {
				passports: [passport],
				photos: [],
				extractions: [],
				stamps: [stamp(1)],
				locations: [],
				stays: [],
				kv: [],
			},
		};
		expect(parseBackup(JSON.stringify(raw), 5).tables.stamps).toHaveLength(1);
	});

	it("round trips the demo library", async () => {
		const db = new VoyputDb(`backup-${++dbCount}`);
		await seedDemo(db);
		const before = await snapshot(db);
		const backup = parseBackup(await exportText(db), db.verno);
		await restoreBackup(db, backup);
		expect(await snapshot(db)).toEqual(before);
	});

	it("rolls back to the old data when a write fails inside the import", async () => {
		const db = await filledDb();
		const before = await snapshot(db);
		const backup = parseBackup(await exportText(db), db.verno);
		// Skips validation and breaks the transaction: a duplicate key.
		const [first] = backup.tables.locations;
		if (first) backup.tables.locations.push({ ...first });
		await expect(restoreBackup(db, backup)).rejects.toThrow();
		expect(await snapshot(db)).toEqual(before);
	});
});
