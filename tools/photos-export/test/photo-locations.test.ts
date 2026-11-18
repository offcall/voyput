import { spawn, spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Runs tools/photos-export/photo-locations.sh with /bin/sh (dash here, so
 * bash- or zsh-only syntax fails) against fixture Photos.sqlite files built
 * with the sqlite3 CLI, in the macOS Big Sur+ (ZASSET) and Catalina
 * (ZGENERICASSET) shapes.
 */
/** Vitest runs from the repository root. */
const SCRIPT = resolve("tools/photos-export/photo-locations.sh");
const hasSqlite = spawnSync("sqlite3", ["-version"]).status === 0;
const APPLE_EPOCH = Date.UTC(2001, 0, 1) / 1000;

/** Seconds since 2001-01-01 UTC, as Photos stores ZDATECREATED. */
const apple = (iso: string) => Date.parse(iso) / 1000 - APPLE_EPOCH;

let dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs = [];
});

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "photo-locations-test-"));
	dirs.push(dir);
	return dir;
}

function sqlite(db: string, sql: string) {
	const result = spawnSync("sqlite3", [db], { input: sql, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr);
}

interface Asset {
	taken: string | null;
	lat: number | null;
	lon: number | null;
	trashed?: boolean;
	video?: boolean;
	uuid: string;
	file: string;
	/** Seconds east of UTC; Big Sur schema only. */
	tz?: number;
	original?: string;
}

const value = (v: string | number | null | undefined) =>
	v === null || v === undefined
		? "NULL"
		: typeof v === "number"
			? String(v)
			: `'${v.replaceAll("'", "''")}'`;

/** A Photos.sqlite with the asset table of a macOS version. */
function library(
	assets: Asset[],
	schema: "bigsur" | "catalina" = "bigsur",
): string {
	const dir = tempDir();
	const db = join(dir, "Photos.sqlite");
	const table = schema === "bigsur" ? "ZASSET" : "ZGENERICASSET";
	const lines = [
		`CREATE TABLE ${table} (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, ZDATECREATED TIMESTAMP, ZLATITUDE FLOAT, ZLONGITUDE FLOAT, ZTRASHEDSTATE INTEGER, ZKIND INTEGER, ZUUID VARCHAR, ZFILENAME VARCHAR);`,
	];
	if (schema === "bigsur")
		lines.push(
			"CREATE TABLE ZADDITIONALASSETATTRIBUTES (Z_PK INTEGER PRIMARY KEY, ZASSET INTEGER, ZTIMEZONEOFFSET INTEGER, ZORIGINALFILENAME VARCHAR);",
		);
	assets.forEach((asset, i) => {
		const pk = i + 1;
		lines.push(
			`INSERT INTO ${table} VALUES (${pk}, 3, ${value(asset.taken && apple(asset.taken))}, ${value(asset.lat)}, ${value(asset.lon)}, ${asset.trashed ? 1 : 0}, ${asset.video ? 1 : 0}, ${value(asset.uuid)}, ${value(asset.file)});`,
		);
		if (schema === "bigsur")
			lines.push(
				`INSERT INTO ZADDITIONALASSETATTRIBUTES VALUES (${pk}, ${pk}, ${value(asset.tz)}, ${value(asset.original)});`,
			);
	});
	sqlite(db, lines.join("\n"));
	return db;
}

function run(args: string[], out = join(tempDir(), "photo_locations.csv")) {
	const result = spawnSync("sh", [SCRIPT, "--out", out, ...args], {
		encoding: "utf8",
		env: { PATH: process.env.PATH, HOME: tempDir(), TMPDIR: tempDir() },
	});
	let csv: string | null = null;
	try {
		csv = readFileSync(out, "utf8");
	} catch {}
	return { ...result, csv, out };
}

const PARIS: Asset = {
	taken: "2019-05-01T21:30:05Z",
	tz: 7200,
	lat: 48.8566,
	lon: 2.3522,
	uuid: "A1",
	file: "IMG_0001.HEIC",
	original: "IMG_0001.HEIC",
};
const NEWFOUNDLAND: Asset = {
	taken: "2019-04-30T12:00:00Z",
	tz: -12600,
	lat: 47.5615,
	lon: -52.7126,
	video: true,
	uuid: "A2",
	file: "x.mov",
	original: 'Trip, "day 1".MOV',
};
/** 23:00 UTC on 2 May is already 3 May in Lisbon summer time (+01:00). */
const PAST_MIDNIGHT: Asset = {
	taken: "2019-05-02T23:00:00Z",
	tz: 3600,
	lat: 38.7223,
	lon: -9.1393,
	uuid: "A3",
	file: "IMG_0003.JPG",
};
const LEFT_OUT: Asset[] = [
	{ ...PARIS, uuid: "trashed", trashed: true },
	{ ...PARIS, uuid: "no-location", lat: -180, lon: -180 },
	{ ...PARIS, uuid: "null-location", lat: null, lon: null },
	{ ...PARIS, uuid: "no-date", taken: null },
];

describe.skipIf(!hasSqlite)("photo-locations.sh", () => {
	it("writes local times, coordinates and quoted names, oldest first (Big Sur+)", () => {
		const db = library([PARIS, ...LEFT_OUT, PAST_MIDNIGHT, NEWFOUNDLAND]);
		const result = run(["--library", db]);

		expect(result.status, result.stderr).toBe(0);
		expect(result.csv).toBe(
			[
				"date,lat,lon,is_video,filename,uuid",
				'2019-04-30T08:30:00-03:30,47.561500,-52.712600,true,"Trip, ""day 1"".MOV",A2',
				"2019-05-01T23:30:05+02:00,48.856600,2.352200,false,IMG_0001.HEIC,A1",
				"2019-05-03T00:00:00+01:00,38.722300,-9.139300,false,IMG_0003.JPG,A3",
				"",
			].join("\n"),
		);
		expect(result.stdout).toContain("Saved 3 photo locations");
		expect(result.stdout).toContain("from 2019-04-30 to 2019-05-03");
		expect(result.stdout).toContain("3 left out");
	});

	it("writes the CSV readable by its owner only, also over an old one", () => {
		const out = join(tempDir(), "photo_locations.csv");
		writeFileSync(out, "old");
		chmodSync(out, 0o644);
		const result = run(["--library", library([PARIS])], out);

		expect(result.status, result.stderr).toBe(0);
		expect(result.csv).toContain("IMG_0001.HEIC");
		expect(statSync(out).mode & 0o777).toBe(0o600);
	});

	it("filters --since/--until on the photo's local day", () => {
		const db = library([PARIS, PAST_MIDNIGHT, NEWFOUNDLAND]);
		const result = run([
			"--library",
			db,
			"--since=2019-05-01",
			"--until",
			"2019-05-02",
		]);

		expect(result.status, result.stderr).toBe(0);
		expect(result.csv?.trim().split("\n").slice(1)).toEqual([
			"2019-05-01T23:30:05+02:00,48.856600,2.352200,false,IMG_0001.HEIC,A1",
		]);
	});

	it("reads the Catalina table, in UTC when no time zone is stored", () => {
		const db = library([PARIS, ...LEFT_OUT], "catalina");
		const result = run(["--library", db, "--quiet"]);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("");
		expect(result.csv).toBe(
			"date,lat,lon,is_video,filename,uuid\n2019-05-01T21:30:05Z,48.856600,2.352200,false,IMG_0001.HEIC,A1\n",
		);
	});

	it("finds Photos.sqlite inside a .photoslibrary folder", () => {
		const db = library([PARIS]);
		const bundle = join(tempDir(), "Photos Library.photoslibrary");
		spawnSync("mkdir", ["-p", join(bundle, "database")]);
		spawnSync("cp", [db, join(bundle, "database", "Photos.sqlite")]);

		const result = run(["--library", bundle]);

		expect(result.status, result.stderr).toBe(0);
		expect(result.csv).toContain(",A1\n");
	});

	it("reads a copy when Photos holds the database locked", async () => {
		const db = library([PARIS]);
		const holder = spawn("sqlite3", [db]);
		holder.stdin.write("BEGIN EXCLUSIVE;\nSELECT 'locked';\n");
		await new Promise((resolve) => holder.stdout.once("data", resolve));
		try {
			const result = run(["--library", db]);

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("temporary copy");
			expect(result.csv).toContain(",A1\n");
		} finally {
			holder.kill();
		}
	});

	it.skipIf(process.getuid?.() === 0)(
		"asks for Full Disk Access when the database cannot be opened",
		() => {
			const db = library([PARIS]);
			chmodSync(db, 0);
			const result = run(["--library", db]);

			expect(result.status).toBe(1);
			expect(result.stderr).toContain("Full Disk Access");
			expect(result.csv).toBeNull();
		},
	);

	it("explains a missing library, a bad day and an unknown schema", () => {
		const missing = run(["--library", join(tempDir(), "nope.photoslibrary")]);
		expect(missing.status).toBe(1);
		expect(missing.stderr).toContain("Photos library not found");

		const db = library([PARIS]);
		const badDay = run(["--library", db, "--since", "2019-5-1'; DROP"]);
		expect(badDay.status).toBe(1);
		expect(badDay.stderr).toContain("--since must be a day");

		sqlite(db, "ALTER TABLE ZASSET DROP COLUMN ZKIND;");
		const old = run(["--library", db]);
		expect(old.status).toBe(1);
		expect(old.stderr).toContain("no ZASSET.ZKIND");
		expect(old.csv).toBeNull();
	});
});
