import type {
	LocationRow,
	Passport,
	PassportPhoto,
	PhotoExtraction,
	Stamp,
	Trip,
} from "@voyput/core";
import Dexie, { type Table } from "dexie";

export interface PhotoRecord extends PassportPhoto {
	blob: Blob;
}

/** Small values that are not worth their own table, e.g. UI state of a section. */
export interface KvRecord {
	key: string;
	value: unknown;
}

/** Everything the user brings and edits lives here, in their browser. */
export class VoyputDb extends Dexie {
	declare passports: Table<Passport, string>;
	declare photos: Table<PhotoRecord, string>;
	declare extractions: Table<PhotoExtraction, string>;
	declare stamps: Table<Stamp, string>;
	/** Keyed by the export's photo uuid, so re-importing a CSV never duplicates rows. */
	declare locations: Table<LocationRow, string>;
	declare trips: Table<Trip, string>;
	declare kv: Table<KvRecord, string>;

	constructor(name = "voyput") {
		super(name);
		this.version(1).stores({
			passports: "id",
			photos: "id, passportId",
			extractions: "photoId",
			stamps: "id, passportId, photoId, date",
			locations: "uuid, date",
			trips: "id, start",
			kv: "key",
		});
	}
}
