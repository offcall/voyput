/**
 * The fictional traveller behind the demo data: a Kyiv resident's trips from
 * 2016 to 2025. Cities, airports and border checkpoints are real public
 * places; the person, dates and officer numbers are invented.
 */

export type Direction = "entry" | "exit" | "unknown";
export type Crossing = "plane" | "car" | "foot";

export interface City {
	name: string;
	lat: number;
	lon: number;
	/** Jitter radius in degrees; airports and checkpoints are small. */
	spread?: number;
	/** Airside transit: always a few photos, never a stamp. */
	transit?: boolean;
	/** A land border post: photos are not allowed there. */
	post?: boolean;
}

export interface Country {
	code: string;
	name: string;
	/** UTC offset in standard time, and whether EU summer time applies. */
	utc: number;
	dst: boolean;
	cities: City[];
}

const c = (
	code: string,
	name: string,
	utc: number,
	dst: boolean,
	cities: [string, number, number, number?][],
	transit: string[] = [],
): Country => ({
	code,
	name,
	utc,
	dst,
	cities: cities.map(([city, lat, lon, spread]) => ({
		name: city,
		lat,
		lon,
		...(spread === undefined ? {} : { spread }),
		...(transit.includes(city) ? { transit: true } : {}),
		...(BORDER_POSTS.includes(city) ? { post: true } : {}),
	})),
});

const BORDER_POSTS = [
	"Krakovets",
	"Shehyni",
	"Rava-Ruska",
	"Mohyliv-Podilskyi",
	"Korczowa",
	"Medyka",
	"Hrebenne",
	"Sadakhlo",
	"Otaci",
];

export const COUNTRIES: Record<string, Country> = Object.fromEntries(
	[
		c("UA", "Ukraine", 2, true, [
			["Kyiv", 50.4501, 30.5234],
			["Boryspil", 50.345, 30.8947, 0.004],
			["Lviv", 49.8397, 24.0297],
			["Odesa", 46.4825, 30.7233],
			["Kharkiv", 49.9935, 36.2304],
			["Yaremche", 48.4583, 24.5528, 0.01],
			["Krakovets", 49.9555, 23.1365, 0.003],
			["Shehyni", 49.7953, 22.9616, 0.003],
			["Rava-Ruska", 50.2401, 23.6255, 0.004],
			["Mohyliv-Podilskyi", 48.4447, 27.7961, 0.006],
		]),
		c("ES", "Spain", 1, true, [
			["Barcelona", 41.3874, 2.1686],
			["El Prat de Llobregat", 41.2974, 2.0833, 0.004],
			["Sitges", 41.237, 1.8059, 0.008],
			["Madrid", 40.4168, -3.7038],
			["Seville", 37.3891, -5.9845],
			["Valencia", 39.4699, -0.3763],
		]),
		c("PL", "Poland", 1, true, [
			["Kraków", 50.0647, 19.945],
			["Warsaw", 52.2297, 21.0122],
			["Gdańsk", 54.352, 18.6466],
			["Przemyśl", 49.7838, 22.7677, 0.008],
			["Korczowa", 49.9545, 23.0862, 0.003],
			["Medyka", 49.8049, 22.9369, 0.003],
			["Hrebenne", 50.2585, 23.5755, 0.003],
		]),
		c("GE", "Georgia", 4, false, [
			["Tbilisi", 41.7151, 44.8271],
			["Stepantsminda", 42.6566, 44.6433, 0.01],
			["Sadakhlo", 41.2442, 44.8063, 0.004],
		]),
		c("AM", "Armenia", 4, false, [
			["Dilijan", 40.7406, 44.8634, 0.01],
			["Sevan", 40.5488, 44.948, 0.01],
			["Yerevan", 40.1792, 44.4991],
			["Zvartnots", 40.1473, 44.3959, 0.004],
		]),
		c(
			"TR",
			"Turkey",
			3,
			false,
			[
				["Istanbul", 41.0082, 28.9784],
				["Yeşilköy", 40.9769, 28.8146, 0.004],
				["Arnavutköy", 41.2753, 28.7519, 0.004],
				["Antalya", 36.8969, 30.7133],
				["Kemer", 36.5983, 30.5597, 0.01],
			],
			["Arnavutköy"],
		),
		c("TH", "Thailand", 7, false, [
			["Bangkok", 13.7563, 100.5018],
			["Bang Phli", 13.69, 100.7501, 0.004],
			["Chiang Mai", 18.7883, 98.9853],
			["Ao Nang", 8.0326, 98.8234, 0.01],
			["Patong", 7.8961, 98.2964, 0.01],
		]),
		c("QA", "Qatar", 3, false, [["Doha", 25.2731, 51.6081, 0.004]], ["Doha"]),
		c(
			"AE",
			"United Arab Emirates",
			4,
			false,
			[
				["Dubai", 25.2048, 55.2708],
				["Abu Dhabi", 24.4539, 54.3773],
				["Al Garhoud", 25.2532, 55.3657, 0.004],
			],
			["Al Garhoud"],
		),
		c("IT", "Italy", 1, true, [
			["Rome", 41.9028, 12.4964],
			["Florence", 43.7696, 11.2558],
		]),
		c("FR", "France", 1, true, [
			["Nice", 43.7102, 7.262],
			["Menton", 43.7747, 7.4975, 0.006],
		]),
		c("ME", "Montenegro", 1, true, [
			["Tivat", 42.43, 18.699, 0.006],
			["Kotor", 42.4247, 18.7712, 0.008],
			["Budva", 42.2911, 18.84, 0.008],
		]),
		c("PT", "Portugal", 0, true, [
			["Lisbon", 38.7223, -9.1393],
			["Sintra", 38.8029, -9.3817, 0.01],
			["Porto", 41.1579, -8.6291],
			["Maia", 41.2481, -8.6814, 0.004],
		]),
		c("DE", "Germany", 1, true, [["Berlin", 52.52, 13.405]]),
		c("JP", "Japan", 9, false, [
			["Narita", 35.772, 140.3929, 0.004],
			["Tokyo", 35.6762, 139.6503],
			["Hakone", 35.2324, 139.1069, 0.01],
			["Kyoto", 35.0116, 135.7681],
			["Nara", 34.6851, 135.8048, 0.008],
			["Osaka", 34.6937, 135.5023],
			["Izumisano", 34.4347, 135.2441, 0.004],
		]),
		c("GR", "Greece", 2, true, [
			["Athens", 37.9838, 23.7275],
			["Naxos", 37.1036, 25.3766, 0.01],
		]),
		c("MD", "Moldova", 2, true, [
			["Otaci", 48.4302, 27.7931, 0.004],
			["Chișinău", 47.0105, 28.8638],
			["Orheiul Vechi", 47.3036, 28.9692, 0.006],
		]),
	].map((country) => [country.code, country]),
);

export const HOME = "UA";
export const HOME_CITY = "Kyiv";

/** A border post as the stamps print it. */
export interface Post {
	country: string;
	crossing: Crossing;
	/** Name on the stamp. */
	printed: string;
	/** Name in the ground truth. */
	location: string;
	/** Booth or post number printed on Schengen-style stamps. */
	code: string;
}

export const POSTS = {
	KBP: {
		country: "UA",
		crossing: "plane",
		printed: "БОРИСПІЛЬ",
		location: "Boryspil Airport",
		code: "KBP",
	},
	KRAKOVETS: {
		country: "UA",
		crossing: "car",
		printed: "КРАКОВЕЦЬ",
		location: "Krakovets",
		code: "",
	},
	SHEHYNI: {
		country: "UA",
		crossing: "foot",
		printed: "ШЕГИНІ",
		location: "Shehyni",
		code: "",
	},
	RAVA: {
		country: "UA",
		crossing: "car",
		printed: "РАВА-РУСЬКА",
		location: "Rava-Ruska",
		code: "",
	},
	MOHYLIV: {
		country: "UA",
		crossing: "car",
		printed: "МОГИЛІВ-ПОДІЛЬСЬКИЙ",
		location: "Mohyliv-Podilskyi",
		code: "",
	},
	BCN: {
		country: "ES",
		crossing: "plane",
		printed: "BARCELONA",
		location: "Barcelona El Prat Airport",
		code: "B 017",
	},
	KORCZOWA: {
		country: "PL",
		crossing: "car",
		printed: "KORCZOWA",
		location: "Korczowa",
		code: "SG 104",
	},
	MEDYKA: {
		country: "PL",
		crossing: "foot",
		printed: "MEDYKA",
		location: "Medyka",
		code: "SG 211",
	},
	HREBENNE: {
		country: "PL",
		crossing: "car",
		printed: "HREBENNE",
		location: "Hrebenne",
		code: "SG 087",
	},
	WAW: {
		country: "PL",
		crossing: "plane",
		printed: "WARSZAWA-OKĘCIE",
		location: "Warsaw Chopin Airport",
		code: "SG 312",
	},
	TBS: {
		country: "GE",
		crossing: "plane",
		printed: "TBILISI AIRPORT",
		location: "Tbilisi Airport",
		code: "",
	},
	SADAKHLO: {
		country: "GE",
		crossing: "car",
		printed: "SADAKHLO",
		location: "Sadakhlo",
		code: "",
	},
	BAGRATASHEN: {
		country: "AM",
		crossing: "car",
		printed: "BAGRATASHEN",
		location: "Bagratashen",
		code: "",
	},
	EVN: {
		country: "AM",
		crossing: "plane",
		printed: "ZVARTNOTS",
		location: "Zvartnots Airport",
		code: "",
	},
	ISL: {
		country: "TR",
		crossing: "plane",
		printed: "İSTANBUL ATATÜRK HV.",
		location: "Istanbul Atatürk Airport",
		code: "",
	},
	AYT: {
		country: "TR",
		crossing: "plane",
		printed: "ANTALYA HAVALİMANI",
		location: "Antalya Airport",
		code: "",
	},
	BKK: {
		country: "TH",
		crossing: "plane",
		printed: "SUVARNABHUMI AIRPORT",
		location: "Suvarnabhumi Airport",
		code: "",
	},
	DXB: {
		country: "AE",
		crossing: "plane",
		printed: "DUBAI AIRPORT",
		location: "Dubai Airport",
		code: "",
	},
	FCO: {
		country: "IT",
		crossing: "plane",
		printed: "FIUMICINO",
		location: "Rome Fiumicino Airport",
		code: "A 041",
	},
	NCE: {
		country: "FR",
		crossing: "plane",
		printed: "NICE",
		location: "Nice Côte d'Azur Airport",
		code: "0632",
	},
	TIV: {
		country: "ME",
		crossing: "plane",
		printed: "TIVAT",
		location: "Tivat Airport",
		code: "",
	},
	LIS: {
		country: "PT",
		crossing: "plane",
		printed: "LISBOA",
		location: "Lisbon Airport",
		code: "L 23",
	},
	OPO: {
		country: "PT",
		crossing: "plane",
		printed: "PORTO",
		location: "Porto Airport",
		code: "P 08",
	},
	NRT: {
		country: "JP",
		crossing: "plane",
		printed: "NARITA (N)",
		location: "Narita Airport",
		code: "",
	},
	KIX: {
		country: "JP",
		crossing: "plane",
		printed: "KANSAI (K)",
		location: "Kansai Airport",
		code: "",
	},
	OTACI: {
		country: "MD",
		crossing: "car",
		printed: "OTACI",
		location: "Otaci",
		code: "",
	},
} satisfies Record<string, Post>;

export type PostId = keyof typeof POSTS;

/** What the stamp says (the truth) and, for planted Review problems, what was read. */
export interface StampPlan {
	post: PostId;
	direction: Exclude<Direction, "unknown">;
	/** YYYY-MM-DD as printed. */
	date: string;
	/** Officer or booth number. */
	officer: string;
	/** Faint ink, a stamp half pressed, or a smudge over one part. */
	faint?: boolean;
	smudge?: "date" | "direction";
	/** A Review problem left on purpose: what the reader got instead. */
	read?: {
		date?: string;
		dateText?: string;
		direction?: Direction;
		location?: null;
		reviewed: boolean;
		confidence: number;
		notes: string;
	};
}

/**
 * From `at` (local time, "YYYY-MM-DD HH:MM") on, the traveller is in this
 * city; an empty country means in the air.
 */
export interface Move {
	at: string;
	country: string;
	city: string;
}

export interface Trip {
	moves: Move[];
	stamps: StampPlan[];
	/** A long stay: fewer photos per day, like at home. */
	long?: boolean;
}

const m = (at: string, country: string, city: string): Move => ({
	at,
	country,
	city,
});

let officer = 7;
/** A stamp with an invented officer number. */
const s = (
	post: PostId,
	direction: "entry" | "exit",
	date: string,
	extra: Partial<StampPlan> = {},
): StampPlan => {
	officer = (officer * 37 + 11) % 97;
	return {
		post,
		direction,
		date,
		officer: String(officer + 3).padStart(2, "0"),
		...extra,
	};
};

const home = (at: string) => m(at, "UA", "Kyiv");
/** On a plane: no photos until the next move. */
const air = (at: string) => m(at, "", "");

/** Trips abroad in date order. */
export const TRIPS: Trip[] = [
	{
		moves: [
			m("2016-08-10 07:00", "UA", "Boryspil"),
			m("2016-08-10 13:30", "ES", "Barcelona"),
			m("2016-08-17 11:00", "ES", "Sitges"),
			m("2016-08-20 12:00", "ES", "Barcelona"),
			m("2016-08-24 13:00", "ES", "El Prat de Llobregat"),
			home("2016-08-24 21:30"),
		],
		stamps: [
			s("KBP", "exit", "2016-08-10"),
			s("BCN", "entry", "2016-08-10"),
			s("BCN", "exit", "2016-08-24"),
			s("KBP", "entry", "2016-08-24"),
		],
	},
	{
		// New Year in Kraków by bus from Lviv.
		moves: [
			m("2017-01-02 09:00", "UA", "Lviv"),
			m("2017-01-03 10:30", "UA", "Krakovets"),
			m("2017-01-03 12:30", "PL", "Korczowa"),
			m("2017-01-03 17:00", "PL", "Kraków"),
			m("2017-01-08 13:00", "PL", "Korczowa"),
			m("2017-01-08 15:00", "UA", "Krakovets"),
			m("2017-01-08 17:30", "UA", "Lviv"),
			home("2017-01-09 12:00"),
		],
		stamps: [
			s("KRAKOVETS", "exit", "2017-01-03"),
			s("KORCZOWA", "entry", "2017-01-03"),
			s("KORCZOWA", "exit", "2017-01-08"),
			s("KRAKOVETS", "entry", "2017-01-08"),
		],
	},
	{
		// Georgia, then overland to Armenia.
		moves: [
			m("2017-06-15 06:00", "UA", "Boryspil"),
			m("2017-06-15 11:30", "GE", "Tbilisi"),
			m("2017-06-18 10:00", "GE", "Stepantsminda"),
			m("2017-06-20 18:00", "GE", "Tbilisi"),
			m("2017-06-22 10:00", "GE", "Sadakhlo"),
			m("2017-06-22 12:00", "AM", "Dilijan"),
			m("2017-06-24 11:00", "AM", "Sevan"),
			m("2017-06-25 15:00", "AM", "Yerevan"),
			m("2017-06-29 03:30", "AM", "Zvartnots"),
			home("2017-06-29 08:30"),
		],
		stamps: [
			s("KBP", "exit", "2017-06-15"),
			s("TBS", "entry", "2017-06-15"),
			s("SADAKHLO", "exit", "2017-06-22"),
			s("BAGRATASHEN", "entry", "2017-06-22"),
			s("EVN", "exit", "2017-06-29"),
			s("KBP", "entry", "2017-06-29"),
		],
	},
	{
		moves: [
			m("2017-10-20 06:00", "UA", "Boryspil"),
			m("2017-10-20 10:00", "TR", "Istanbul"),
			m("2017-10-24 15:00", "TR", "Yeşilköy"),
			home("2017-10-24 20:00"),
		],
		stamps: [
			s("KBP", "exit", "2017-10-20"),
			s("ISL", "entry", "2017-10-20"),
			s("ISL", "exit", "2017-10-24"),
			s("KBP", "entry", "2017-10-24"),
		],
	},
	{
		// Thailand through Doha, no stamp in Qatar.
		moves: [
			m("2018-02-08 16:00", "UA", "Boryspil"),
			m("2018-02-08 22:30", "QA", "Doha"),
			air("2018-02-08 23:50"),
			m("2018-02-09 08:30", "TH", "Bangkok"),
			m("2018-02-14 10:00", "TH", "Chiang Mai"),
			m("2018-02-19 13:00", "TH", "Ao Nang"),
			m("2018-02-23 12:00", "TH", "Bangkok"),
			m("2018-02-25 16:00", "TH", "Bang Phli"),
			m("2018-02-25 21:30", "QA", "Doha"),
			air("2018-02-25 23:40"),
			home("2018-02-26 08:30"),
		],
		stamps: [
			s("KBP", "exit", "2018-02-08"),
			s("BKK", "entry", "2018-02-09"),
			s("BKK", "exit", "2018-02-25"),
			s("KBP", "entry", "2018-02-26", { faint: true }),
		],
	},
	{
		// Rome and Florence, then the train to Nice: Schengen in, Schengen out.
		moves: [
			m("2018-07-05 06:00", "UA", "Boryspil"),
			m("2018-07-05 10:30", "IT", "Rome"),
			m("2018-07-09 12:00", "IT", "Florence"),
			m("2018-07-12 17:00", "FR", "Nice"),
			m("2018-07-14 10:00", "FR", "Menton"),
			m("2018-07-14 18:00", "FR", "Nice"),
			home("2018-07-15 19:00"),
		],
		stamps: [
			s("KBP", "exit", "2018-07-05"),
			// Planted: a smudged 5 read as 3, so the entry lands two days before the flight.
			s("FCO", "entry", "2018-07-05", {
				smudge: "date",
				read: {
					date: "2018-07-03",
					dateText: "03.07.18",
					reviewed: false,
					confidence: 63,
					notes: "Day digit is smudged; 03 or 05.",
				},
			}),
			s("NCE", "exit", "2018-07-15"),
			s("KBP", "entry", "2018-07-15"),
		],
	},
	{
		moves: [
			m("2019-09-03 06:30", "UA", "Boryspil"),
			m("2019-09-03 10:00", "ME", "Tivat"),
			m("2019-09-03 12:00", "ME", "Kotor"),
			m("2019-09-06 11:00", "ME", "Budva"),
			m("2019-09-10 10:00", "ME", "Tivat"),
			home("2019-09-10 15:30"),
		],
		stamps: [
			s("KBP", "exit", "2019-09-03"),
			s("TIV", "entry", "2019-09-03"),
			// Planted: a smudged 0 read as 6, so the exit lands at home.
			s("TIV", "exit", "2019-09-10", {
				smudge: "date",
				read: {
					date: "2019-09-16",
					dateText: "16.09.2019",
					reviewed: false,
					confidence: 58,
					notes: "Second digit of the day is smudged; 16 or 10.",
				},
			}),
			s("KBP", "entry", "2019-09-10"),
		],
	},
	{
		moves: [
			m("2019-12-27 08:00", "UA", "Boryspil"),
			m("2019-12-27 15:00", "AE", "Dubai"),
			m("2019-12-31 10:00", "AE", "Abu Dhabi"),
			m("2019-12-31 19:00", "AE", "Dubai"),
			m("2020-01-04 09:00", "AE", "Al Garhoud"),
			home("2020-01-04 14:00"),
		],
		stamps: [
			s("KBP", "exit", "2019-12-27"),
			s("DXB", "entry", "2019-12-27"),
			s("DXB", "exit", "2020-01-04"),
			s("KBP", "entry", "2020-01-04"),
		],
	},
	{
		moves: [
			m("2021-07-10 05:30", "UA", "Boryspil"),
			m("2021-07-10 09:30", "TR", "Kemer"),
			m("2021-07-21 11:00", "TR", "Antalya"),
			home("2021-07-24 17:00"),
		],
		stamps: [
			s("KBP", "exit", "2021-07-10"),
			s("AYT", "entry", "2021-07-10"),
			// Planted: the entry/exit word is smudged.
			s("AYT", "exit", "2021-07-24", {
				smudge: "direction",
				read: {
					direction: "unknown",
					reviewed: false,
					confidence: 61,
					notes: "Direction word smudged; entry or exit not readable.",
				},
			}),
			s("KBP", "entry", "2021-07-24"),
		],
	},
	{
		// Portugal through Istanbul both ways, airside.
		moves: [
			m("2021-10-14 16:00", "UA", "Boryspil"),
			m("2021-10-14 21:00", "TR", "Arnavutköy"),
			air("2021-10-15 07:30"),
			m("2021-10-15 10:30", "PT", "Lisbon"),
			m("2021-10-19 10:00", "PT", "Sintra"),
			m("2021-10-19 18:00", "PT", "Lisbon"),
			m("2021-10-20 12:00", "PT", "Porto"),
			m("2021-10-24 06:00", "PT", "Maia"),
			m("2021-10-24 13:30", "TR", "Arnavutköy"),
			air("2021-10-24 21:30"),
			home("2021-10-25 01:00"),
		],
		stamps: [
			s("KBP", "exit", "2021-10-14"),
			s("LIS", "entry", "2021-10-15"),
			s("OPO", "exit", "2021-10-24"),
			s("KBP", "entry", "2021-10-25"),
		],
	},
	{
		// A summer in Poland, on foot over the border, with two weeks in Berlin.
		long: true,
		moves: [
			m("2022-06-04 09:00", "UA", "Shehyni"),
			m("2022-06-04 11:30", "PL", "Medyka"),
			m("2022-06-04 13:00", "PL", "Przemyśl"),
			m("2022-06-04 18:00", "PL", "Kraków"),
			m("2022-07-10 12:00", "DE", "Berlin"),
			m("2022-07-24 18:00", "PL", "Kraków"),
			m("2022-08-12 12:00", "PL", "Gdańsk"),
			m("2022-08-19 18:00", "PL", "Kraków"),
			m("2022-08-31 09:00", "PL", "Przemyśl"),
			m("2022-08-31 11:00", "PL", "Medyka"),
			m("2022-08-31 13:00", "UA", "Shehyni"),
			m("2022-08-31 16:00", "UA", "Lviv"),
			home("2022-09-02 12:00"),
		],
		stamps: [
			s("SHEHYNI", "exit", "2022-06-04"),
			s("MEDYKA", "entry", "2022-06-04"),
			s("MEDYKA", "exit", "2022-08-31"),
			s("SHEHYNI", "entry", "2022-08-31"),
		],
	},
	{
		// A month in Thailand: bus to Warsaw, then through Dubai.
		moves: [
			m("2023-01-10 08:00", "UA", "Lviv"),
			m("2023-01-11 09:00", "UA", "Krakovets"),
			m("2023-01-11 11:00", "PL", "Korczowa"),
			m("2023-01-11 19:00", "PL", "Warsaw"),
			m("2023-01-12 19:30", "AE", "Al Garhoud"),
			air("2023-01-12 22:40"),
			m("2023-01-13 08:00", "TH", "Bangkok"),
			m("2023-01-17 12:00", "TH", "Patong"),
			m("2023-01-25 14:00", "TH", "Chiang Mai"),
			m("2023-02-05 13:00", "TH", "Bangkok"),
			air("2023-02-11 01:50"),
			m("2023-02-11 07:00", "AE", "Al Garhoud"),
			air("2023-02-11 09:30"),
			m("2023-02-11 14:00", "PL", "Warsaw"),
			m("2023-02-12 13:00", "PL", "Korczowa"),
			m("2023-02-12 15:00", "UA", "Krakovets"),
			m("2023-02-12 18:00", "UA", "Lviv"),
			home("2023-02-13 12:00"),
		],
		stamps: [
			s("KRAKOVETS", "exit", "2023-01-11"),
			s("KORCZOWA", "entry", "2023-01-11"),
			s("WAW", "exit", "2023-01-12"),
			s("BKK", "entry", "2023-01-13"),
			// A 01:50 flight: the last photos in Thailand are from the day before.
			s("BKK", "exit", "2023-02-11"),
			// Planted: faint, its checkpoint not readable.
			s("WAW", "entry", "2023-02-11", {
				faint: true,
				read: {
					location: null,
					reviewed: false,
					confidence: 64,
					notes: "Faint stamp; the checkpoint name is not readable.",
				},
			}),
			s("KORCZOWA", "exit", "2023-02-12"),
			s("KRAKOVETS", "entry", "2023-02-12"),
		],
	},
	{
		// Japan through Istanbul, from Warsaw.
		moves: [
			m("2023-10-01 09:00", "UA", "Lviv"),
			m("2023-10-02 08:00", "UA", "Rava-Ruska"),
			m("2023-10-02 10:00", "PL", "Hrebenne"),
			m("2023-10-02 17:00", "PL", "Warsaw"),
			m("2023-10-03 15:00", "TR", "Arnavutköy"),
			air("2023-10-03 19:00"),
			m("2023-10-04 12:00", "JP", "Narita"),
			m("2023-10-04 16:00", "JP", "Tokyo"),
			m("2023-10-08 11:00", "JP", "Hakone"),
			m("2023-10-10 15:00", "JP", "Kyoto"),
			m("2023-10-14 10:00", "JP", "Nara"),
			m("2023-10-14 17:00", "JP", "Kyoto"),
			m("2023-10-15 12:00", "JP", "Osaka"),
			m("2023-10-18 08:00", "JP", "Izumisano"),
			m("2023-10-18 17:00", "TR", "Arnavutköy"),
			air("2023-10-18 21:30"),
			m("2023-10-19 00:30", "PL", "Warsaw"),
			m("2023-10-19 13:00", "PL", "Hrebenne"),
			m("2023-10-19 15:00", "UA", "Rava-Ruska"),
			m("2023-10-19 18:00", "UA", "Lviv"),
			home("2023-10-20 12:00"),
		],
		stamps: [
			s("RAVA", "exit", "2023-10-02"),
			s("HREBENNE", "entry", "2023-10-02"),
			s("WAW", "exit", "2023-10-03"),
			s("NRT", "entry", "2023-10-04"),
			s("KIX", "exit", "2023-10-18"),
			s("WAW", "entry", "2023-10-19"),
			s("HREBENNE", "exit", "2023-10-19"),
			s("RAVA", "entry", "2023-10-19", { faint: true }),
		],
	},
	{
		// Spain again, flying from Kraków: no Spanish stamp inside Schengen.
		moves: [
			m("2024-04-19 10:00", "UA", "Lviv"),
			m("2024-04-20 09:00", "UA", "Shehyni"),
			m("2024-04-20 11:00", "PL", "Medyka"),
			m("2024-04-20 18:00", "PL", "Kraków"),
			m("2024-04-21 13:00", "ES", "Madrid"),
			m("2024-04-25 12:00", "ES", "Seville"),
			m("2024-04-28 15:00", "ES", "Valencia"),
			m("2024-05-03 15:00", "PL", "Kraków"),
			m("2024-05-04 10:00", "PL", "Medyka"),
			m("2024-05-04 12:00", "UA", "Shehyni"),
			m("2024-05-04 15:00", "UA", "Lviv"),
			home("2024-05-05 12:00"),
		],
		stamps: [
			s("SHEHYNI", "exit", "2024-04-20"),
			s("MEDYKA", "entry", "2024-04-20"),
			s("MEDYKA", "exit", "2024-05-04"),
			s("SHEHYNI", "entry", "2024-05-04"),
		],
	},
	{
		// Greece from Kraków, again only the Polish land border stamps.
		moves: [
			m("2024-08-06 10:00", "UA", "Lviv"),
			m("2024-08-07 09:00", "UA", "Krakovets"),
			m("2024-08-07 11:00", "PL", "Korczowa"),
			m("2024-08-07 18:00", "PL", "Kraków"),
			m("2024-08-08 14:00", "GR", "Athens"),
			m("2024-08-11 12:00", "GR", "Naxos"),
			m("2024-08-16 16:00", "GR", "Athens"),
			m("2024-08-18 15:00", "PL", "Kraków"),
			m("2024-08-19 10:00", "PL", "Korczowa"),
			m("2024-08-19 12:00", "UA", "Krakovets"),
			m("2024-08-19 15:00", "UA", "Lviv"),
			home("2024-08-20 12:00"),
		],
		stamps: [
			s("KRAKOVETS", "exit", "2024-08-07"),
			s("KORCZOWA", "entry", "2024-08-07"),
			s("KORCZOWA", "exit", "2024-08-19"),
			s("KRAKOVETS", "entry", "2024-08-19"),
		],
	},
	{
		// A long weekend in Moldova by car.
		moves: [
			m("2025-03-07 13:00", "UA", "Mohyliv-Podilskyi"),
			m("2025-03-07 15:00", "MD", "Otaci"),
			m("2025-03-07 18:00", "MD", "Chișinău"),
			m("2025-03-09 11:00", "MD", "Orheiul Vechi"),
			m("2025-03-09 17:00", "MD", "Chișinău"),
			m("2025-03-11 10:00", "MD", "Otaci"),
			m("2025-03-11 12:00", "UA", "Mohyliv-Podilskyi"),
			home("2025-03-11 19:00"),
		],
		stamps: [
			s("MOHYLIV", "exit", "2025-03-07"),
			s("OTACI", "entry", "2025-03-07"),
			s("OTACI", "exit", "2025-03-11"),
			s("MOHYLIV", "entry", "2025-03-11"),
		],
	},
];

/** Trips inside Ukraine: photos only. */
export const DOMESTIC: Move[] = [
	m("2016-05-06 12:00", "UA", "Lviv"),
	home("2016-05-09 18:00"),
	m("2017-07-20 12:00", "UA", "Odesa"),
	home("2017-07-27 19:00"),
	m("2018-01-03 10:00", "UA", "Yaremche"),
	home("2018-01-07 20:00"),
	m("2019-04-12 11:00", "UA", "Kharkiv"),
	home("2019-04-14 21:00"),
	m("2020-08-01 12:00", "UA", "Odesa"),
	home("2020-08-09 19:00"),
	m("2021-02-20 10:00", "UA", "Yaremche"),
	home("2021-02-23 20:00"),
	m("2022-03-02 15:00", "UA", "Lviv"),
	home("2022-05-28 12:00"),
	// The night train to Lviv before the border.
	m("2022-06-03 09:00", "UA", "Lviv"),
];

/** Lockdown: almost no photos. */
export const QUIET = { from: "2020-03-16", to: "2020-06-30" };

/** Location data covers these days, home days included. */
export const LOCATIONS_FROM = "2016-01-01";
export const LOCATIONS_TO = "2025-12-31";

export const PASSPORT = {
	validFrom: "2016-02-15",
	validTo: "2026-02-15",
};

export const PAGE_WIDTH = 1200;
export const PAGE_HEIGHT = 1700;
