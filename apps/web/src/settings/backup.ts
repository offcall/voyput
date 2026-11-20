import {
	type LocationRow,
	type Passport,
	type PassportPhoto,
	type PhotoExtraction,
	type Stamp,
	type StampBox,
	type StayEdge,
	SUPPORTED_PHOTO_TYPES,
	TRAVEL_METHODS,
	type TravelStay,
} from "@voyput/core";
import type { KvRecord, PhotoRecord, VoyputDb } from "../db/db";
import { parseSettings, type Settings } from "./settings";

/** One file with everything this browser stores, except secrets (ADR 0048). */
export const BACKUP_FORMAT = "voyput-backup";
export const BACKUP_VERSION = 1;

/** Settings that go into a backup: never the OpenRouter key or the pairing token. */
export type BackupSettings = Omit<Settings, "openRouterKey" | "localToken">;
const SETTING_KEYS = [
	"model",
	"reasoningEffort",
	"locationWindowDays",
	"aiProvider",
	"localEngine",
	"localPort",
] as const satisfies readonly (keyof BackupSettings)[];

export const backupSettingsOf = (settings: Settings): BackupSettings => {
	const picked: Partial<Record<keyof BackupSettings, unknown>> = {};
	for (const key of SETTING_KEYS) picked[key] = settings[key];
	const parsed = parseSettings(picked);
	const { openRouterKey: _key, localToken: _token, ...rest } = parsed;
	return rest;
};

/** A photo row in the file: its fields, plus the image bytes in base64 when photos are included. */
export type BackupPhoto = PassportPhoto & { data: string };

export interface BackupTables {
	passports: Passport[];
	photos: BackupPhoto[];
	extractions: PhotoExtraction[];
	stamps: Stamp[];
	locations: LocationRow[];
	stays: TravelStay[];
	kv: KvRecord[];
}

/** The Dexie tables a backup holds, in file order; a test checks it lists every table. */
export const BACKUP_TABLES = [
	"passports",
	"photos",
	"extractions",
	"stamps",
	"locations",
	"stays",
	"kv",
] as const satisfies readonly (keyof BackupTables)[];

export interface Backup {
	exportedAt: string;
	dbVersion: number;
	includesPhotos: boolean;
	settings: BackupSettings;
	tables: BackupTables;
}

/** A file that cannot be imported; `message` is meant for the user. */
export class BackupError extends Error {
	override name = "BackupError";
}

/** What a database or a backup holds, for the import dialog. */
export interface BackupCounts {
	passports: number;
	photos: number;
	stamps: number;
	locations: number;
	stays: number;
}

export const countsOfBackup = ({ tables }: Backup): BackupCounts => ({
	passports: tables.passports.length,
	photos: tables.photos.length,
	stamps: tables.stamps.length,
	locations: tables.locations.length,
	stays: tables.stays.length,
});

export interface BackupStats {
	counts: BackupCounts;
	/** Estimated file size in bytes without photos, and what the photos add. */
	rowBytes: number;
	photoBytes: number;
}

/** Counts and an estimated file size. Reads only Dexie, so it can run as a live query. */
export async function backupStats(db: VoyputDb): Promise<BackupStats> {
	const [passports, photos, extractions, stamps, locations, stays, kv] =
		await Promise.all([
			db.passports.toArray(),
			db.photos.toArray(),
			db.extractions.toArray(),
			db.stamps.toArray(),
			db.locations.toArray(),
			db.stays.toArray(),
			db.kv.toArray(),
		]);
	let rowBytes = 0;
	for (const rows of [passports, extractions, stamps, locations, stays, kv])
		rowBytes += JSON.stringify(rows).length;
	let photoBytes = 0;
	for (const { blob, ...meta } of photos)
		photoBytes += JSON.stringify(meta).length + Math.ceil(blob.size / 3) * 4;
	return {
		counts: {
			passports: passports.length,
			photos: photos.length,
			stamps: stamps.length,
			locations: locations.length,
			stays: stays.length,
		},
		rowBytes,
		photoBytes,
	};
}

/** Lets the browser paint and handle input between photos. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const BASE64_CHUNK = 0x8000;

async function toBase64(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	const pieces: string[] = [];
	for (let at = 0; at < bytes.length; at += BASE64_CHUNK)
		pieces.push(String.fromCharCode(...bytes.subarray(at, at + BASE64_CHUNK)));
	return btoa(pieces.join(""));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** Rows written per string part, so no single string holds a large table. */
const ROWS_PER_PART = 2000;

/**
 * The backup file. Rows are read as stored, past reading hooks such as the
 * stamps' plausible-date view (ADR 0044), in one transaction (a consistent
 * snapshot); photos are encoded after it, one at a time.
 */
export async function exportBackup(
	db: VoyputDb,
	options: { includePhotos: boolean; settings: Settings; now: Date },
): Promise<Blob> {
	const rows = await db.transaction("r", db.tables, async () => {
		const read: Record<string, unknown[]> = {};
		for (const name of BACKUP_TABLES)
			read[name] =
				name === "photos" && !options.includePhotos
					? []
					: await db.table(name).toCollection().raw().toArray();
		return read;
	});
	const header = {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt: options.now.toISOString(),
		dbVersion: db.verno,
		includesPhotos: options.includePhotos,
		settings: backupSettingsOf(options.settings),
	};
	const head = JSON.stringify(header);
	const parts: BlobPart[] = [`${head.slice(0, -1)},"tables":{`];
	for (const [t, name] of BACKUP_TABLES.entries()) {
		parts.push(`${t ? "," : ""}${JSON.stringify(name)}:[`);
		const list = rows[name] ?? [];
		if (name === "photos") {
			for (const [i, photo] of (list as PhotoRecord[]).entries()) {
				const { blob, ...meta } = photo;
				const data = await toBase64(blob);
				parts.push(`${i ? "," : ""}${JSON.stringify({ ...meta, data })}`);
				await breathe();
			}
		} else {
			for (let at = 0; at < list.length; at += ROWS_PER_PART) {
				const chunk = JSON.stringify(list.slice(at, at + ROWS_PER_PART));
				parts.push(`${at ? "," : ""}${chunk.slice(1, -1)}`);
			}
		}
		parts.push("]");
	}
	parts.push("}}");
	return new Blob(parts, { type: "application/json" });
}

export const backupFileName = (now: Date): string =>
	`voyput-backup-${now.toISOString().slice(0, 10)}.json`;

// Row checks. Each lists every field of its type, so a new field fails the type check here.

type Check = (value: unknown) => boolean;
type Shape<T> = { [K in keyof T]-?: Check };

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const str: Check = (v) => typeof v === "string";
const num: Check = (v) => typeof v === "number" && Number.isFinite(v);
const bool: Check = (v) => typeof v === "boolean";
const orNull =
	(check: Check): Check =>
	(v) =>
		v === null || check(v);
const optional =
	(check: Check): Check =>
	(v) =>
		v === undefined || check(v);
const oneOf =
	(values: readonly unknown[]): Check =>
	(v) =>
		values.includes(v);
const listOf =
	(check: Check): Check =>
	(v) =>
		Array.isArray(v) && v.every(check);
const shape =
	<T>(fields: Shape<T>) =>
	(value: unknown): value is T =>
		isObject(value) &&
		Object.entries(fields).every(([key, check]) =>
			(check as Check)(value[key]),
		);

const isPassport = shape<Passport>({
	id: str,
	name: str,
	validFrom: orNull(str),
	validTo: orNull(str),
	createdAt: str,
});

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const isBase64: Check = (v) =>
	typeof v === "string" && v.length % 4 === 0 && BASE64_RE.test(v);

const photoFields: Shape<PassportPhoto> = {
	id: str,
	passportId: str,
	name: str,
	mimeType: oneOf(SUPPORTED_PHOTO_TYPES),
	rotation: oneOf([0, 90, 180, 270]),
	size: optional(num),
	addedAt: str,
};
const isBackupPhoto = shape<BackupPhoto>({ ...photoFields, data: isBase64 });

const isExtraction = shape<PhotoExtraction>({
	photoId: str,
	status: oneOf(["ok", "failed"]),
	notes: str,
	model: str,
	seconds: num,
	finishedAt: str,
});

/** A number from 0 to 1, as stamp boxes are stored. */
const unit: Check = (v) => typeof v === "number" && v >= 0 && v <= 1;

const isTrue: Check = (v) => v === true;
const isStamp = shape<Stamp>({
	id: str,
	passportId: str,
	photoId: str,
	direction: oneOf(["entry", "exit", "unknown"]),
	borderCrossing: oneOf(["car", "plane", "train", "ship", "foot", "unknown"]),
	dateText: str,
	date: orNull(str),
	country: orNull(str),
	countryCode: orNull(str),
	location: orNull(str),
	confidence: orNull(num),
	notes: str,
	problem: orNull(str),
	source: oneOf(["ai", "manual"]),
	reviewed: bool,
	dismissed: optional(
		(v) =>
			isObject(v) &&
			Object.entries(v).every(
				([key, flag]) =>
					["problem", "icloudCheck", "suggestion"].includes(key) &&
					isTrue(flag),
			),
	),
	readDate: optional(orNull(str)),
	box: optional(
		shape<StampBox>({ x: unit, y: unit, width: unit, height: unit }),
	),
});

const isLocation = shape<LocationRow>({
	date: str,
	lat: num,
	lon: num,
	countryCode: str,
	country: str,
	city: str,
	source: str,
	isVideo: bool,
	filename: str,
	uuid: str,
});

const isEdge = shape<StayEdge>({
	date: orNull(str),
	source: oneOf(["stamp", "photos", "estimated", "manual"]),
	method: oneOf(TRAVEL_METHODS),
	stampId: optional(str),
});
const isStay = shape<TravelStay>({
	id: str,
	countryCode: str,
	place: str,
	kind: oneOf(["stay", "transit"]),
	arrival: isEdge,
	departure: isEdge,
	stampIds: listOf(str),
	photoIds: listOf(str),
	approved: bool,
	edited: optional(bool),
	evidenceChanged: optional(bool),
	sinceBirth: optional(bool),
});

const isKv = (value: unknown): value is KvRecord =>
	isObject(value) && typeof value.key === "string" && "value" in value;

/** Primary key per table, to reject a file whose rows would collide. */
const KEY_OF: Record<keyof BackupTables, string> = {
	passports: "id",
	photos: "id",
	extractions: "photoId",
	stamps: "id",
	locations: "uuid",
	stays: "id",
	kv: "key",
};

const ROW_NAME: Record<keyof BackupTables, string> = {
	passports: "passport",
	photos: "page photo",
	extractions: "extraction result",
	stamps: "stamp",
	locations: "photo location",
	stays: "stay",
	kv: "saved value",
};

function readTable<T>(
	tables: Record<string, unknown>,
	name: keyof BackupTables,
	isRow: (value: unknown) => value is T,
): T[] {
	const rows = tables[name];
	if (!Array.isArray(rows))
		throw new BackupError(`The file has no "${name}" list.`);
	const keys = new Set<unknown>();
	rows.forEach((row: unknown, i) => {
		if (!isRow(row))
			throw new BackupError(
				`The file is damaged: ${ROW_NAME[name]} ${i + 1} of ${rows.length} is not valid.`,
			);
		const key = (row as Record<string, unknown>)[KEY_OF[name]];
		if (keys.has(key))
			throw new BackupError(
				`The file is damaged: two ${name} rows have the same ${KEY_OF[name]}.`,
			);
		keys.add(key);
	});
	return rows as T[];
}

/**
 * The backup in `text`, checked whole; throws a `BackupError` for anything
 * that cannot be imported into a database of `dbVersion`.
 */
export function parseBackup(text: string, dbVersion: number): Backup {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new BackupError("This is not a voyput backup: it is not JSON.");
	}
	if (!isObject(raw) || raw.format !== BACKUP_FORMAT)
		throw new BackupError("This is not a voyput backup file.");
	if (raw.version !== BACKUP_VERSION)
		throw new BackupError(
			typeof raw.version === "number" && raw.version > BACKUP_VERSION
				? `This backup was made by a newer voyput (file format ${raw.version}). Reload the page to get the newest version, then import again.`
				: `This backup's file format (${String(raw.version)}) is not supported.`,
		);
	if (raw.dbVersion !== dbVersion)
		throw new BackupError(
			typeof raw.dbVersion === "number" && raw.dbVersion > dbVersion
				? `This backup was made by a newer voyput (database version ${raw.dbVersion}, this one has ${dbVersion}). Reload the page to get the newest version, then import again.`
				: `This backup is from database version ${String(raw.dbVersion)}; this voyput imports version ${dbVersion} only.`,
		);
	if (
		typeof raw.exportedAt !== "string" ||
		typeof raw.includesPhotos !== "boolean"
	)
		throw new BackupError("The file is damaged: its header is incomplete.");
	if (!isObject(raw.settings))
		throw new BackupError("The file is damaged: it has no settings.");
	if (!isObject(raw.tables))
		throw new BackupError("The file is damaged: it has no tables.");
	const t = raw.tables;
	const tables: BackupTables = {
		passports: readTable(t, "passports", isPassport),
		photos: readTable(t, "photos", isBackupPhoto),
		extractions: readTable(t, "extractions", isExtraction),
		stamps: readTable(t, "stamps", isStamp),
		locations: readTable(t, "locations", isLocation),
		stays: readTable(t, "stays", isStay),
		kv: readTable(t, "kv", isKv),
	};
	if (!raw.includesPhotos && tables.photos.length > 0)
		throw new BackupError(
			"The file is damaged: it says it has no photos but lists some.",
		);
	return {
		exportedAt: raw.exportedAt,
		dbVersion,
		includesPhotos: raw.includesPhotos,
		settings: backupSettingsOf(parseSettings(raw.settings)),
		tables,
	};
}

/**
 * Replaces everything in the database with the backup, in one transaction:
 * if any write fails, the old data stays. Settings are the caller's to apply.
 */
export async function restoreBackup(
	db: VoyputDb,
	backup: Backup,
): Promise<void> {
	const photos: PhotoRecord[] = [];
	for (const { data, ...meta } of backup.tables.photos) {
		photos.push({
			...meta,
			blob: new Blob([fromBase64(data)], { type: meta.mimeType }),
		});
		await breathe();
	}
	const { tables } = backup;
	await db.transaction("rw", db.tables, async () => {
		await Promise.all(db.tables.map((table) => table.clear()));
		await Promise.all([
			db.passports.bulkAdd(tables.passports),
			db.photos.bulkAdd(photos),
			db.extractions.bulkAdd(tables.extractions),
			db.stamps.bulkAdd(tables.stamps),
			db.locations.bulkAdd(tables.locations),
			db.stays.bulkAdd(tables.stays),
			db.kv.bulkAdd(tables.kv),
		]);
	});
}
