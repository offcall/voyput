/** One geotagged photo or video from the Apple Photos export CSV. */
export interface LocationRow {
	/** ISO 8601 date-time as exported. */
	date: string;
	lat: number;
	lon: number;
	countryCode: string;
	country: string;
	city: string;
	source: string;
	isVideo: boolean;
	filename: string;
	uuid: string;
}

/** Columns the export writes, in order. */
export const LOCATION_CSV_COLUMNS = [
	"date",
	"lat",
	"lon",
	"country_code",
	"country",
	"city",
	"source",
	"is_video",
	"filename",
	"uuid",
] as const;
