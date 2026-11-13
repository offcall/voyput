/**
 * Hand-read stamps of the Wikimedia Commons sample pages in
 * apps/web/public/demo/sample-*.jpg. A `null` date or direction is not scored
 * (faint or ambiguous print); an `optional` stamp is neither required nor an
 * extra when the model reports it (conditions boxes, visas, extensions).
 */

export type Direction = "entry" | "exit";

export interface TruthStamp {
	label: string;
	/** Accepted ISO codes; the first is the expected one. */
	countryCodes: string[];
	date: string | null;
	direction: Direction | null;
	optional?: true;
}

export interface TruthPage {
	file: string;
	stamps: TruthStamp[];
}

const stamp = (
	label: string,
	countryCodes: string | string[],
	date: string | null,
	direction: Direction | null,
	optional?: true,
): TruthStamp => ({
	label,
	countryCodes: Array.isArray(countryCodes) ? countryCodes : [countryCodes],
	date,
	direction,
	...(optional ? { optional } : {}),
});

const UK_CONDITIONS = "UK leave-to-enter conditions box";

export const GROUND_TRUTH: TruthPage[] = [
	{
		file: "sample-01.jpg",
		stamps: [
			stamp("US Toronto preclearance ADMITTED", "US", "2004-07-17", "entry"),
			stamp("UK Gatwick", "GB", "2004-10-06", "entry"),
			stamp("Madrid-Barajas", "ES", "2005-06-01", "entry"),
			stamp("UK Heathrow", "GB", "2005-05-31", "entry"),
			stamp(UK_CONDITIONS, "GB", null, null, true),
			stamp(UK_CONDITIONS, "GB", null, null, true),
		],
	},
	{
		file: "sample-02.jpg",
		stamps: [
			stamp("Romania Bucuresti-Aurel Vlaicu", "RO", "2005-08-21", null),
			stamp("Romania, rotated", "RO", "2005-08-13", null),
			stamp("Zanzibar departure", "TZ", "2005-11-06", "exit"),
			stamp("Johannesburg departure", "ZA", "2005-12-09", "exit"),
			stamp("UK Channel Tunnel", "GB", "2005-10-18", "entry"),
			stamp(UK_CONDITIONS, "GB", null, null, true),
		],
	},
	{
		file: "sample-03.jpg",
		stamps: [
			stamp("Turkey visa sticker", "TR", null, null, true),
			stamp("Istanbul airport GIRIS", "TR", "2005-08-21", "entry"),
			stamp("Turkey sea border CIKIS", "TR", "2005-09-05", "exit"),
			stamp("Wien-Schwechat, upside down", "AT", "2006-09-28", "entry"),
			stamp("Amsterdam Schiphol", "NL", "2006-05-22", "exit"),
			stamp("Roissy-CDG, faint", "FR", "2006-03-07", "entry"),
		],
	},
	{
		file: "sample-04.jpg",
		stamps: [
			stamp("Austria, faint", "AT", "2006-10-11", "exit"),
			stamp("Kelebia, faint date", "HU", null, null),
			stamp("Amsterdam Schiphol", "NL", "2006-05-04", "entry"),
			stamp("Budapest Ferihegy-1", "HU", "2006-09-09", "entry"),
		],
	},
	{
		file: "sample-05.jpg",
		stamps: [
			stamp("Suvarnabhumi arrival", "TH", "2006-10-25", "entry"),
			stamp("Samui departed", "TH", "2006-11-04", "exit"),
			stamp("Philippines arrival, red", "PH", "2006-11-04", "entry"),
			stamp("green date-only stamp", "PH", "2006-11-25", null, true),
			stamp("Suvarnabhumi arrival", "TH", "2006-12-19", "entry"),
			stamp("Suvarnabhumi departed", "TH", "2007-01-05", "exit"),
		],
	},
	{
		file: "sample-06.jpg",
		stamps: [
			stamp("Philippine visa waiver (stay permit)", "PH", null, null, true),
			stamp("Philippine departure, green", "PH", "2006-12-19", "exit"),
			stamp("Wien-Schwechat", "AT", "2006-10-05", "entry"),
		],
	},
	{
		file: "sample-07.jpg",
		stamps: [
			stamp("US CBP ADMITTED SFR", "US", "2007-09-20", "entry"),
			stamp("Tahiti, faint", ["PF", "FR"], "2007-10-24", null),
			stamp("Tahiti Faaa", ["PF", "FR"], "2007-11-04", null),
			stamp("Barcelona", "ES", "2007-04-15", "entry"),
		],
	},
	{
		file: "sample-08.jpg",
		stamps: [
			stamp("Casablanca Mohammed V SORTIE", "MA", "2005-07-23", "exit"),
			stamp("Tanger port ENTREE, month unreadable", "MA", null, "entry"),
			stamp("Praha-Ruzyne", "CZ", "2005-10-15", "exit"),
		],
	},
	{
		file: "sample-09.jpg",
		stamps: [
			stamp("US CBP ADMITTED SFR", "US", "2008-12-30", "entry"),
			stamp("Amsterdam Schiphol, rotated", "NL", "2008-12-30", "exit"),
			stamp("Amsterdam Schiphol", "NL", "2009-04-16", "entry"),
		],
	},
	{
		file: "sample-10.jpg",
		stamps: [
			stamp("Koeln/Bonn", "DE", "2009-06-28", "exit"),
			stamp("Croatia Pula (ul = entry)", "HR", "2009-06-28", "entry"),
			stamp("Slovenia Dobova rail", "SI", "2009-07-02", "exit"),
		],
	},
];
