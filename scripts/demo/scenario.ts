/**
 * The fictional traveller behind the demo data: home country, trips, and the
 * stamps on each passport page. Cities and checkpoints are invented; only the
 * countries are real, so maps and charts have something to show.
 */

export type StampStyle = "schengen" | "ukraine" | "generic";
export type Direction = "entry" | "exit";
export type Crossing = "plane" | "car";

export interface City {
	name: string;
	lat: number;
	lon: number;
}

export interface Country {
	code: string;
	name: string;
	/** Letter code inside a Schengen star circle. */
	schengenLetter?: string;
	/** UTC offset in summer and winter, for photo timestamps. */
	tz: { summer: string; winter: string };
	cities: City[];
}

export const COUNTRIES: Record<string, Country> = {
	UA: {
		code: "UA",
		name: "Ukraine",
		tz: { summer: "+03:00", winter: "+02:00" },
		cities: [
			{ name: "Demohrad", lat: 49.42, lon: 32.06 },
			{ name: "Riverdem", lat: 48.91, lon: 30.12 },
			{ name: "Stepove-Demo", lat: 47.95, lon: 33.4 },
		],
	},
	ES: {
		code: "ES",
		name: "Spain",
		schengenLetter: "E",
		tz: { summer: "+02:00", winter: "+01:00" },
		cities: [
			{ name: "Valdemo", lat: 40.02, lon: -3.55 },
			{ name: "Playa Demo", lat: 39.48, lon: -0.62 },
			{ name: "Sierra Demo", lat: 37.52, lon: -4.48 },
		],
	},
	PL: {
		code: "PL",
		name: "Poland",
		schengenLetter: "PL",
		tz: { summer: "+02:00", winter: "+01:00" },
		cities: [
			{ name: "Demowo", lat: 52.02, lon: 19.48 },
			{ name: "Polanka Demo", lat: 50.31, lon: 21.95 },
		],
	},
	GE: {
		code: "GE",
		name: "Georgia",
		tz: { summer: "+04:00", winter: "+04:00" },
		cities: [
			{ name: "Demovani", lat: 41.86, lon: 44.52 },
			{ name: "Mtademo", lat: 42.02, lon: 43.31 },
		],
	},
	IT: {
		code: "IT",
		name: "Italy",
		schengenLetter: "I",
		tz: { summer: "+02:00", winter: "+01:00" },
		cities: [
			{ name: "Montedemo", lat: 43.02, lon: 12.41 },
			{ name: "Lagodemo", lat: 45.31, lon: 10.92 },
		],
	},
	FR: {
		code: "FR",
		name: "France",
		schengenLetter: "F",
		tz: { summer: "+02:00", winter: "+01:00" },
		cities: [
			{ name: "Demoville", lat: 46.52, lon: 2.48 },
			{ name: "Port-Demo", lat: 43.88, lon: 4.62 },
		],
	},
};

export const HOME = "UA";

/** One leg of a trip: days spent in one country. */
export interface Leg {
	country: string;
	/** YYYY-MM-DD, inclusive. */
	from: string;
	to: string;
}

export interface TripPlan {
	legs: Leg[];
	crossing: Crossing;
}

export const TRIPS: TripPlan[] = [
	{
		crossing: "plane",
		legs: [{ country: "ES", from: "2016-08-10", to: "2016-08-24" }],
	},
	{
		crossing: "car",
		legs: [{ country: "PL", from: "2017-05-03", to: "2017-05-12" }],
	},
	{
		crossing: "plane",
		legs: [{ country: "GE", from: "2018-10-12", to: "2018-10-20" }],
	},
	{
		crossing: "plane",
		legs: [
			{ country: "IT", from: "2019-07-01", to: "2019-07-08" },
			{ country: "FR", from: "2019-07-08", to: "2019-07-15" },
		],
	},
];

/** Location data covers these years, home days included. */
export const LOCATIONS_FROM = "2016-01-01";
export const LOCATIONS_TO = "2019-12-31";

export interface StampPlan {
	style: StampStyle;
	country: string;
	direction: Direction;
	crossing: Crossing;
	/** YYYY-MM-DD */
	date: string;
	/** Officer or booth number printed after the date. */
	officer: string;
	/** Checkpoint as printed on the stamp. */
	checkpoint: string;
	/** Checkpoint name for the ground truth; null when it is not readable. */
	location: string | null;
	/** Centre on the page in px, and rotation in degrees. */
	x: number;
	y: number;
	rotate: number;
	notes?: string;
}

export interface PagePlan {
	stamps: StampPlan[];
}

export const PAGE_WIDTH = 1200;
export const PAGE_HEIGHT = 1700;

export const PAGES: PagePlan[] = [
	{
		stamps: [
			{
				style: "ukraine",
				country: "UA",
				direction: "exit",
				crossing: "plane",
				date: "2016-08-10",
				officer: "05",
				checkpoint: "Аеропорт Демо 990010",
				location: "Demo Airport",
				x: 330,
				y: 360,
				rotate: -4,
			},
			{
				style: "schengen",
				country: "ES",
				direction: "entry",
				crossing: "plane",
				date: "2016-08-10",
				officer: "33",
				checkpoint: "VALDEMO A 003",
				location: "Valdemo",
				x: 850,
				y: 420,
				rotate: 90,
			},
			{
				style: "schengen",
				country: "ES",
				direction: "exit",
				crossing: "plane",
				date: "2016-08-24",
				officer: "17",
				checkpoint: "VALDEMO A 003",
				location: "Valdemo",
				x: 380,
				y: 980,
				rotate: 3,
			},
			{
				style: "ukraine",
				country: "UA",
				direction: "entry",
				crossing: "plane",
				date: "2016-08-24",
				officer: "12",
				checkpoint: "Аеропорт Демо 990010",
				location: "Demo Airport",
				x: 820,
				y: 1250,
				rotate: -2,
			},
		],
	},
	{
		stamps: [
			{
				style: "ukraine",
				country: "UA",
				direction: "exit",
				crossing: "car",
				date: "2017-05-03",
				officer: "02",
				checkpoint: "Демо-Захід 990020",
				location: "Demo-Zakhid",
				x: 360,
				y: 330,
				rotate: 2,
			},
			{
				style: "schengen",
				country: "PL",
				direction: "entry",
				crossing: "car",
				date: "2017-05-03",
				officer: "41",
				checkpoint: "DEMOWO D 039",
				location: "Demowo",
				x: 830,
				y: 640,
				rotate: -5,
			},
			{
				style: "schengen",
				country: "PL",
				direction: "exit",
				crossing: "car",
				date: "2017-05-12",
				officer: "08",
				checkpoint: "DEMOWO D 039",
				location: "Demowo",
				x: 330,
				y: 1080,
				rotate: 270,
			},
			{
				style: "ukraine",
				country: "UA",
				direction: "entry",
				crossing: "car",
				date: "2017-05-12",
				officer: "03",
				checkpoint: "Демо-Захід 990020",
				location: null,
				x: 1110,
				y: 1420,
				rotate: 0,
				notes: "Partly outside the page; checkpoint cut off.",
			},
		],
	},
	{
		stamps: [
			{
				style: "ukraine",
				country: "UA",
				direction: "exit",
				crossing: "plane",
				date: "2018-10-12",
				officer: "05",
				checkpoint: "Аеропорт Демо 990010",
				location: "Demo Airport",
				x: 820,
				y: 330,
				rotate: 1,
			},
			{
				style: "generic",
				country: "GE",
				direction: "entry",
				crossing: "plane",
				date: "2018-10-12",
				officer: "114",
				checkpoint: "DEMOVANI AIRPORT",
				location: "Demovani Airport",
				x: 360,
				y: 700,
				rotate: -8,
			},
			{
				style: "generic",
				country: "GE",
				direction: "exit",
				crossing: "plane",
				date: "2018-10-20",
				officer: "087",
				checkpoint: "DEMOVANI AIRPORT",
				location: "Demovani Airport",
				x: 830,
				y: 1000,
				rotate: 6,
			},
			{
				style: "ukraine",
				country: "UA",
				direction: "entry",
				crossing: "plane",
				date: "2018-10-20",
				officer: "12",
				checkpoint: "Аеропорт Демо 990010",
				location: "Demo Airport",
				x: 380,
				y: 1350,
				rotate: -3,
			},
		],
	},
	{
		stamps: [
			{
				style: "ukraine",
				country: "UA",
				direction: "exit",
				crossing: "plane",
				date: "2019-07-01",
				officer: "02",
				checkpoint: "Аеропорт Демо 990010",
				location: "Demo Airport",
				x: 340,
				y: 330,
				rotate: 0,
			},
			{
				style: "schengen",
				country: "IT",
				direction: "entry",
				crossing: "plane",
				date: "2019-07-01",
				officer: "26",
				checkpoint: "MONTEDEMO A 011",
				location: "Montedemo",
				x: 840,
				y: 380,
				rotate: 4,
			},
			{
				style: "schengen",
				country: "FR",
				direction: "exit",
				crossing: "plane",
				date: "2019-07-15",
				officer: "54",
				checkpoint: "PORT-DEMO A 020",
				location: "Port-Demo",
				x: 380,
				y: 950,
				rotate: 90,
			},
			{
				style: "ukraine",
				country: "UA",
				direction: "entry",
				crossing: "plane",
				date: "2019-07-15",
				officer: "05",
				checkpoint: "Аеропорт Демо 990010",
				location: "Demo Airport",
				x: 830,
				y: 1150,
				rotate: 270,
			},
		],
	},
	{ stamps: [] },
];
