import {
	type LocationRow,
	type Passport,
	type PassportPhoto,
	type PhotoExtraction,
	type Stamp,
	type TravelStay,
	withPlausibleDate,
} from "@voyput/core";
import Dexie, { type Table } from "dexie";
import { localToday } from "../data/today";
import { migrateTrips } from "./migrations/v3";
import { dropHomeStays } from "./migrations/v5";

/** `kv` key of stored trips the version 3 upgrade could not place in a country. */
export { LEGACY_TRIPS_KEY } from "./migrations/v3";

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
	/** The travel history, one stay per row; the Trips step orders them by date. */
	declare stays: Table<TravelStay, string>;
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
		// Country index: the app-wide colour palette counts locations per country.
		this.version(2).stores({ locations: "uuid, date, countryCode" });
		// Upgrades run frozen copies in ./migrations (ADR 0039), never live core code.
		// Stays replace trips (ADR 0019); the trips table goes in the next version.
		this.version(3).stores({ stays: "id" }).upgrade(migrateTrips);
		this.version(4).stores({ trips: null });
		// No home any more (ADR 0022): generated home stays and the home pick go.
		this.version(5).upgrade(dropHomeStays);
		// A stored year no traveller could have (0027) reads as no date with a
		// problem, everywhere stamps are read; the stored record stays (ADR 0044).
		// `bulkGet` passes undefined for a missing id.
		this.stamps.hook(
			"reading",
			(stamp: Stamp | undefined) =>
				stamp && withPlausibleDate(stamp, localToday()),
		);
	}
}
